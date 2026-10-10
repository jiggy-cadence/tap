// Squads v4 path. The treasury is a Squads v4 multisig [agent, phone], threshold 2, with a SPENDING LIMIT for the
// agent that IS the allowance, enforced by the Squads program (native SOL included, which the SPL-multisig path
// cannot cover). Over the limit, or to a destination the limit does not list, the agent has to open a proposal
// and the phone has to approve it. The vault holds ONLY the phone key.
//
// What this executor does after a verified ceremony:
//   1. reads the VaultTransaction the agent created ON CHAIN for intent.transactionIndex,
//   2. decodes it and REFUSES unless it is exactly one SystemProgram transfer from the vault PDA to the STORED
//      intent's recipient for the STORED intent's lamports (the human approved an intent; the phone must not
//      approve a proposal that says something else),
//   3. signs a Squads proposalApprove with the phone key (fee payer = agent) and returns it agent-unsigned.
// The agent adds its signature, broadcasts, then calls vaultTransactionExecute itself (it is a member). Without
// the phone's approval, vaultTransactionExecute is refused by the Squads program (InvalidProposalStatus).
//
// policy (pol): { multisig, vaultIndex, agentPubkey, rpcUrl?, allowance, knownRecipients }
// intent:       { kind: 'squads_vault_transfer', to: <wallet pubkey>, lamports: <integer>, transactionIndex: <integer>, trust?: bool }
'use strict';
const web3 = require('@solana/web3.js');
const multisig = require('@sqds/multisig');

// A VaultTransaction decodes to {to, lamports} only if it is one plain System transfer out of the vault PDA.
// Anything else (two instructions, another program, a different source) throws: refuse, do not guess.
function decodeVaultTransfer(vt, vaultPda) {
  const m = vt.message;
  if (m.addressTableLookups && m.addressTableLookups.length) throw new Error('squads: address lookup tables not supported (accounts would be hidden)');
  if (m.instructions.length !== 1) throw new Error(`squads: expected exactly one instruction, got ${m.instructions.length}`);
  const ix = m.instructions[0];
  const prog = m.accountKeys[ix.programIdIndex];
  if (!prog || !prog.equals(web3.SystemProgram.programId)) throw new Error('squads: instruction is not a System program instruction');
  const d = Buffer.from(ix.data);
  if (d.length !== 12 || d.readUInt32LE(0) !== 2 || ix.accountIndexes.length !== 2) throw new Error('squads: System instruction is not a plain transfer');
  const from = m.accountKeys[ix.accountIndexes[0]], to = m.accountKeys[ix.accountIndexes[1]];
  if (!from || !from.equals(vaultPda)) throw new Error('squads: transfer is not from the vault PDA');
  const lamports = d.readBigUInt64LE(4);
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('squads: lamports exceed safe integer');
  return { to: to.toBase58(), lamports: Number(lamports) };
}

// getTransaction().meta.err -> a name. Squads custom codes resolve through the SDK's generated error table.
function decodeSquadsErr(err) {
  if (!err) return null;
  const ie = err.InstructionError;
  if (!ie) return JSON.stringify(err);
  const inner = ie[1];
  if (typeof inner === 'string') return inner;
  if (inner && typeof inner.Custom === 'number') {
    const e = multisig.generated.errorFromCode(inner.Custom);
    return e ? e.name : `Custom(${inner.Custom})`;
  }
  return JSON.stringify(inner);
}

async function squads_vault_transfer(intent, S, pol, conn) {
  if (!pol) throw new Error('squads_vault_transfer: policy for kind missing');
  if (!S.phoneSecretKey) throw new Error('squads_vault_transfer: phone key not in vault secrets');
  if (!Number.isInteger(intent.transactionIndex) || intent.transactionIndex < 0) throw new Error('squads_vault_transfer: transactionIndex must be a non-negative integer');
  if (!Number.isSafeInteger(intent.lamports) || intent.lamports <= 0) throw new Error('squads_vault_transfer: bad lamports');
  conn = conn || new web3.Connection(pol.rpcUrl || web3.clusterApiUrl('devnet'), 'confirmed');
  const phone = web3.Keypair.fromSecretKey(Uint8Array.from(S.phoneSecretKey));
  const pk = (s, what) => { try { return new web3.PublicKey(s); } catch { throw new Error(`squads_vault_transfer: bad ${what} pubkey`); } };
  const multisigPda = pk(pol.multisig, 'multisig'), agent = pk(pol.agentPubkey, 'agent'), to = pk(intent.to, 'recipient');
  const vaultIndex = pol.vaultIndex || 0;
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: vaultIndex });
  const index = BigInt(intent.transactionIndex);
  const [transactionPda] = multisig.getTransactionPda({ multisigPda, index });

  // 1. read what the agent actually put on chain
  const info = await conn.getAccountInfo(transactionPda, 'confirmed');
  if (!info) throw new Error(`squads_vault_transfer: no VaultTransaction at index ${intent.transactionIndex}`);
  // The SDK decoder does NOT check the 8-byte account discriminator: a ConfigTransaction at this index
  // (e.g. ChangeThreshold → 1) was only refused because decoding happened to crash. Check type explicitly.
  if (!info.owner.equals(multisig.PROGRAM_ID)) throw new Error('squads_vault_transfer: account at index is not owned by the Squads program');
  if (!Buffer.from(info.data.subarray(0, 8)).equals(Buffer.from(multisig.generated.vaultTransactionDiscriminator))) throw new Error('squads_vault_transfer: account at index is not a VaultTransaction (config/batch proposal?)');
  const [vt] = multisig.accounts.VaultTransaction.fromAccountInfo(info);
  if (!vt.multisig.equals(multisigPda)) throw new Error('squads_vault_transfer: VaultTransaction belongs to another multisig');
  if (vt.vaultIndex !== vaultIndex) throw new Error('squads_vault_transfer: VaultTransaction targets another vault');

  // 2. it must say exactly what the human approved
  const decoded = decodeVaultTransfer(vt, vaultPda);
  if (decoded.to !== to.toBase58() || decoded.lamports !== intent.lamports)
    throw new Error(`squads_vault_transfer: intent mismatch: on-chain proposal is ${decoded.lamports} lamports to ${decoded.to}, approved intent is ${intent.lamports} to ${intent.to}`);

  // 3. phone approves THIS proposal, and only this one
  const tx = new web3.Transaction();
  tx.add(multisig.instructions.proposalApprove({ multisigPda, transactionIndex: index, member: phone.publicKey }));
  tx.feePayer = agent;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.partialSign(phone);                        // the only place the phone key is used
  return {
    result: {
      phoneSignedTx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      transactionIndex: intent.transactionIndex, decoded, vault: vaultPda.toBase58(), lastValidBlockHeight,
    },
  };
}

module.exports = { squads_vault_transfer, decodeVaultTransfer, decodeSquadsErr };
