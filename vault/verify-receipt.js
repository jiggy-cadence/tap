// Don't trust us: verify a TAP receipt from chain data alone.
//   node verify-receipt.js <txSignature> [devnet|mainnet-beta]
// Reads the landed tx, rebuilds the intent from what ACTUALLY executed (the TransferChecked accounts,
// amount, decimals, fee payer), recomputes "TAP1:" + sha256("TAP1|" + canon(intent)), and checks it equals
// the memo in that same tx. Match = the receipt describes exactly this transfer. No server, no TAP code
// beyond canon + the formula (both ~40 lines, read them).
'use strict';
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const { tapMemo, MEMO_PROGRAM } = require('./cosign');

(async () => {
  const [sig, cluster = 'devnet'] = process.argv.slice(2);
  if (!sig) { console.log('usage: node verify-receipt.js <txSignature> [devnet|mainnet-beta]'); process.exit(2); }
  const conn = new web3.Connection(web3.clusterApiUrl(cluster), 'confirmed');
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log('✗ tx not found on', cluster); process.exit(1); }
  if (tx.meta.err) { console.log('✗ tx did not succeed:', JSON.stringify(tx.meta.err)); process.exit(1); }
  const msg = tx.transaction.message, keys = msg.staticAccountKeys || msg.accountKeys;
  const ixs = (msg.compiledInstructions || msg.instructions).map(ix => ({
    programId: keys[ix.programIdIndex],
    keys: (ix.accountKeyIndexes || ix.accounts).map(i => ({ pubkey: keys[i], isSigner: msg.isAccountSigner(i), isWritable: msg.isAccountWritable(i) })),
    data: Buffer.from(ix.data instanceof Uint8Array ? ix.data : require('bs58').decode(ix.data)),
  }));
  const memos = ixs.filter(i => i.programId.equals(MEMO_PROGRAM));
  const xfers = ixs.filter(i => i.programId.equals(spl.TOKEN_PROGRAM_ID));
  if (memos.length !== 1 || xfers.length !== 1) { console.log(`✗ expected 1 memo + 1 token transfer, got ${memos.length} + ${xfers.length}`); process.exit(1); }
  const d = spl.decodeTransferCheckedInstruction(new web3.TransactionInstruction(xfers[0]), spl.TOKEN_PROGRAM_ID);
  const intent = { feePayer: keys[0].toBase58(), source: d.keys.source.pubkey.toBase58(), mint: d.keys.mint.pubkey.toBase58(),
    destination: d.keys.destination.pubkey.toBase58(), multisig: d.keys.owner.pubkey.toBase58(),
    amount: String(d.data.amount), decimals: d.data.decimals };
  const onchain = memos[0].data.toString('utf8'), recomputed = tapMemo(intent);
  console.log('intent rebuilt from executed tx:\n' + JSON.stringify(intent, null, 2));
  console.log('memo on chain :', onchain);
  console.log('recomputed    :', recomputed);
  const signers = d.keys.multiSigners.map(s => s.pubkey.toBase58());
  console.log('multisig co-signers in tx:', signers.join(', '));
  if (onchain !== recomputed) { console.log('✗ RECEIPT DOES NOT MATCH what executed'); process.exit(1); }
  console.log('✓ RECEIPT VERIFIED: the memo is the hash of exactly this transfer.');
  console.log('  Scope: proves the co-signers signed THIS intent. Human presence at the stone is the ceremony\'s claim, not the memo\'s.');
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
