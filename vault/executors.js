// Real executors. They receive (intent, secrets, policyForKind) from the vault closure; the agent never does.
// Solana: DEVNET only for the Fair demo. OpenRouter: real API, cost read back from usage.
'use strict';
async function openrouter(intent, S) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${S.openrouterKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: intent.model, messages: intent.messages, max_tokens: intent.max_tokens, usage: { include: true } }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const j = await r.json();
  // debit what OpenRouter actually charged, falling back to the vault's worst-case estimate
  return { result: j.choices?.[0]?.message?.content ?? '', actualCost: typeof j.usage?.cost === 'number' ? j.usage.cost : undefined };
}

// Native SOL, ONE key. Vault-enforced only: native SOL cannot be owned by an SPL multisig, so the chain
// does not back this path. Kept for completeness; the chain-enforced path is spl_multisig_transfer.
async function sol_transfer(intent, S) {
  const web3 = require('@solana/web3.js');
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const from = web3.Keypair.fromSecretKey(Uint8Array.from(S.solanaSecretKey));
  const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
    fromPubkey: from.publicKey, toPubkey: new web3.PublicKey(intent.to), lamports: intent.lamports,
  }));
  const sig = await web3.sendAndConfirmTransaction(conn, tx, [from]);
  return { result: sig };   // show https://explorer.solana.com/tx/<sig>?cluster=devnet in the demo
}

// SPL token transfer out of a treasury owned by a 2-of-2 SPL multisig [agent, phone].
// The vault holds ONLY the phone key (S.phoneSecretKey). This executor:
//   1. builds the transaction FROM THE STORED INTENT (so the bytes the phone signs are the intent the human saw),
//   2. uses TransferChecked (binds mint + decimals, so a mint swap is refused by the Token program),
//   3. signs with the phone key, and returns the partially-signed tx.
// The agent must add its own signature (it is the fee payer and the other multisig member) and broadcast.
// The phone signature covers the message, so the agent cannot change amount, mint, source or destination
// afterwards without invalidating it. Without the phone signature the Token program answers
// MissingRequiredSignature. That refusal is Solana's, not ours.
//
// policy (pol): { mint, decimals, multisig, treasury, agentPubkey, rpcUrl?, symbol?, allowance, knownRecipients }
// intent:        { kind: 'spl_multisig_transfer', to: <owner pubkey>, amount: <integer base units>, trust?: bool }
// `conn` is injectable for tests; the vault calls with three args so the default (devnet) applies.
async function spl_multisig_transfer(intent, S, pol, conn) {
  const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token');
  if (!pol) throw new Error('spl_multisig_transfer: policy for kind missing');
  if (!S.phoneSecretKey) throw new Error('spl_multisig_transfer: phone key not in vault secrets');
  conn = conn || new web3.Connection(pol.rpcUrl || web3.clusterApiUrl('devnet'), 'confirmed');
  const phone = web3.Keypair.fromSecretKey(Uint8Array.from(S.phoneSecretKey));
  const pk = (s, what) => { try { return new web3.PublicKey(s); } catch { throw new Error(`spl_multisig_transfer: bad ${what} pubkey`); } };
  const mint = pk(pol.mint, 'mint'), multisig = pk(pol.multisig, 'multisig'), treasury = pk(pol.treasury, 'treasury'), agent = pk(pol.agentPubkey, 'agent');
  const toOwner = pk(intent.to, 'recipient');
  if (!web3.PublicKey.isOnCurve(toOwner.toBytes())) throw new Error('spl_multisig_transfer: recipient must be a wallet (on-curve) pubkey');
  if (!Number.isSafeInteger(intent.amount) || intent.amount <= 0) throw new Error('spl_multisig_transfer: bad amount');
  if (!Number.isInteger(pol.decimals) || pol.decimals < 0 || pol.decimals > 18) throw new Error('spl_multisig_transfer: bad decimals');
  const dest = spl.getAssociatedTokenAddressSync(mint, toOwner);
  const tx = new web3.Transaction();
  tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(agent, dest, toOwner, mint));   // paid by the agent
  tx.add(spl.createTransferCheckedInstruction(treasury, mint, dest, multisig, BigInt(intent.amount), pol.decimals, [agent, phone.publicKey]));
  tx.feePayer = agent;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.partialSign(phone);                         // the only place the phone key is used
  return {
    result: {
      phoneSignedTx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      dest: dest.toBase58(), amount: intent.amount, mint: mint.toBase58(), lastValidBlockHeight,
    },
  };
}
module.exports = { openrouter, sol_transfer, spl_multisig_transfer };
