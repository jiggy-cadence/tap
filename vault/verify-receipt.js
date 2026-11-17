// Don't trust us: verify a TAP receipt from chain data alone.
//   node verify-receipt.js <txSignature> [devnet|mainnet-beta]
// Reads the landed tx, rebuilds the intent from what ACTUALLY executed (the TransferChecked accounts,
// amount, decimals, fee payer), recomputes "TAP1:" + sha256("TAP1|" + canon(intent)), and checks it equals
// the memo in that same tx. Match = the receipt describes exactly this transfer. No server, no TAP code
// beyond canon + the formula (both ~40 lines, read them).
// Account indexes are resolved against the FULL key list (static keys + addresses loaded from lookup
// tables), and the transfer must carry at least MIN_SIGNERS distinct multisig co-signers that really
// signed. A plain single-owner transfer with a TAP memo is NOT a TAP receipt and fails here.
'use strict';
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const { tapMemo, MEMO_PROGRAM } = require('./cosign');

const MIN_SIGNERS = 2;   // TAP treasuries are 2-of-2 (agent + phone); fewer co-signers is not a TAP transfer

// Pure: takes a getTransaction() response, returns { ok, why, intent, onchain, recomputed, signers }.
function verifyTx(tx, { minSigners = MIN_SIGNERS } = {}) {
  if (!tx) return { ok: false, why: 'tx not found' };
  if (tx.meta && tx.meta.err) return { ok: false, why: 'tx did not succeed: ' + JSON.stringify(tx.meta.err) };
  const msg = tx.transaction.message;
  // v0 instructions may index past the static keys into lookup-table addresses (writable, then readonly)
  const la = (tx.meta && tx.meta.loadedAddresses) || {};
  const keys = [...(msg.staticAccountKeys || msg.accountKeys), ...(la.writable || []), ...(la.readonly || [])].map(k => new web3.PublicKey(k));
  const key = i => { if (!keys[i]) throw new Error(`account index ${i} is outside the ${keys.length} keys of this tx`); return keys[i]; };
  const ixs = (msg.compiledInstructions || msg.instructions).map(ix => ({
    programId: key(ix.programIdIndex),
    keys: Array.from(ix.accountKeyIndexes || ix.accounts).map(i => ({ pubkey: key(i), isSigner: msg.isAccountSigner(i), isWritable: msg.isAccountWritable(i) })),
    data: Buffer.from(ix.data instanceof Uint8Array ? ix.data : require('bs58').decode(ix.data)),
  }));
  const memos = ixs.filter(i => i.programId.equals(MEMO_PROGRAM));
  const xfers = ixs.filter(i => i.programId.equals(spl.TOKEN_PROGRAM_ID));
  if (memos.length !== 1 || xfers.length !== 1) return { ok: false, why: `expected 1 memo + 1 token transfer, got ${memos.length} + ${xfers.length}` };
  const d = spl.decodeTransferCheckedInstruction(new web3.TransactionInstruction(xfers[0]), spl.TOKEN_PROGRAM_ID);
  const intent = { feePayer: keys[0].toBase58(), source: d.keys.source.pubkey.toBase58(), mint: d.keys.mint.pubkey.toBase58(),
    destination: d.keys.destination.pubkey.toBase58(), multisig: d.keys.owner.pubkey.toBase58(),
    amount: String(d.data.amount), decimals: d.data.decimals };
  const onchain = memos[0].data.toString('utf8');
  const tm = onchain.match(/^TAP1:([A-Za-z0-9_-]{16,64}):[0-9a-f]{64}$/); if (tm) intent.tapId = tm[1];   // single-use tap id, carried in the memo
  const recomputed = tapMemo(intent);
  const signers = d.keys.multiSigners.map(s => s.pubkey.toBase58());
  const out = { intent, onchain, recomputed, signers };
  const signed = new Set(d.keys.multiSigners.filter(s => s.isSigner).map(s => s.pubkey.toBase58()));
  if (signed.size !== signers.length) return { ok: false, why: 'a listed multisig co-signer did not sign (or is listed twice)', ...out };
  if (signed.size < minSigners) return { ok: false, why: `expected at least ${minSigners} multisig co-signers, got ${signed.size} (not a TAP co-signed transfer)`, ...out };
  if (onchain !== recomputed) return { ok: false, why: 'RECEIPT DOES NOT MATCH what executed', ...out };
  return { ok: true, why: 'receipt verified', ...out };
}

if (require.main === module) (async () => {
  const [sig, cluster = 'devnet'] = process.argv.slice(2);
  if (!sig) { console.log('usage: node verify-receipt.js <txSignature> [devnet|mainnet-beta]'); process.exit(2); }
  const conn = new web3.Connection(web3.clusterApiUrl(cluster), 'confirmed');
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log('✗ tx not found on', cluster); process.exit(1); }
  const r = verifyTx(tx);
  if (r.intent) {
    console.log('intent rebuilt from executed tx:\n' + JSON.stringify(r.intent, null, 2));
    console.log('memo on chain :', r.onchain);
    console.log('recomputed    :', r.recomputed);
    console.log('multisig co-signers in tx:', r.signers.join(', ') || '(none)');
  }
  if (!r.ok) { console.log('✗ ' + r.why); process.exit(1); }
  console.log('✓ RECEIPT VERIFIED: the memo is the hash of exactly this transfer.');
  console.log('  Scope: proves the co-signers signed THIS intent. Human presence at the stone is the ceremony\'s claim, not the memo\'s.');
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });

module.exports = { verifyTx, MIN_SIGNERS };
