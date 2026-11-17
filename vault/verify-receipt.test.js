// Offline: verify-receipt's pure verifyTx() on built transactions (panel 2026-11-17).
// It must resolve lookup-table addresses, and must not call a single-owner transfer a TAP receipt.
'use strict';
const assert = require('assert');
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const { memoIx } = require('./cosign');
const { verifyTx } = require('./verify-receipt');

const kp = () => web3.Keypair.generate().publicKey;
const agent = kp(), phone = kp(), ms = kp(), mint = kp(), src = kp(), dst = kp();
const BH = '11111111111111111111111111111111';
const intent = { feePayer: agent.toBase58(), source: src.toBase58(), mint: mint.toBase58(),
  destination: dst.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6 };
const tc = (signers = [agent, phone], amount = 5_000_000n) => spl.createTransferCheckedInstruction(src, mint, dst, ms, amount, 6, signers);
const legacy = ixs => { const t = new web3.Transaction({ feePayer: agent, recentBlockhash: BH }); ixs.forEach(i => t.add(i));
  return { meta: { err: null }, transaction: { message: t.compileMessage() } }; };

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
t('honest 2-of-2 transfer + memo verifies', () => {
  const r = verifyTx(legacy([tc(), memoIx(intent)]));
  assert.equal(r.ok, true, r.why); assert.deepEqual(r.intent, intent); assert.deepEqual(r.signers.sort(), [agent.toBase58(), phone.toBase58()].sort());
});
t('memo for a different amount does not match', () => {
  const r = verifyTx(legacy([tc([agent, phone], 9_000_000n), memoIx(intent)]));
  assert.equal(r.ok, false); assert.match(r.why, /DOES NOT MATCH/);
});
t('single-owner transfer with a correct TAP memo is NOT a receipt (no co-signers)', () => {
  const ix = spl.createTransferCheckedInstruction(src, mint, dst, agent, 5_000_000n, 6);   // agent is a plain owner
  const r = verifyTx(legacy([ix, memoIx({ ...intent, multisig: agent.toBase58() })]));
  assert.equal(r.ok, false); assert.match(r.why, /at least 2 multisig co-signers, got 0/);
});
t('one co-signer is below the minimum', () => {
  const r = verifyTx(legacy([tc([agent]), memoIx(intent)]));
  assert.equal(r.ok, false); assert.match(r.why, /got 1/);
});
t('a listed co-signer that did not sign is refused', () => {
  const tx = legacy([tc(), memoIx(intent)]), msg = tx.transaction.message, real = msg.isAccountSigner.bind(msg);
  const phoneIdx = msg.accountKeys.findIndex(k => k.equals(phone));
  msg.isAccountSigner = i => i !== phoneIdx && real(i);
  const r = verifyTx(tx); assert.equal(r.ok, false); assert.match(r.why, /did not sign/);
});
t('failed tx and missing tx are refused', () => {
  assert.match(verifyTx(null).why, /not found/);
  assert.match(verifyTx({ meta: { err: { InstructionError: [0, 'Custom'] } }, transaction: {} }).why, /did not succeed/);
});
t('v0 tx: accounts loaded from a lookup table are resolved (was static keys only)', () => {
  const table = new web3.AddressLookupTableAccount({ key: kp(), state: { deactivationSlot: BigInt('18446744073709551615'), lastExtendedSlot: 0,
    lastExtendedSlotStartIndex: 0, authority: undefined, addresses: [mint, dst] } });
  const msg = new web3.TransactionMessage({ payerKey: agent, recentBlockhash: BH, instructions: [tc(), memoIx(intent)] }).compileToV0Message([table]);
  assert.ok(msg.addressTableLookups.length === 1, 'test must actually use the lookup table');
  const loaded = { writable: msg.addressTableLookups[0].writableIndexes.map(i => table.state.addresses[i]),
    readonly: msg.addressTableLookups[0].readonlyIndexes.map(i => table.state.addresses[i]) };
  const r = verifyTx({ meta: { err: null, loadedAddresses: loaded }, transaction: { message: msg } });
  assert.equal(r.ok, true, r.why); assert.deepEqual(r.intent, intent);
  assert.throws(() => verifyTx({ meta: { err: null }, transaction: { message: msg } }), /outside the \d+ keys/);   // without the loaded addresses: named error, not a TypeError
});
console.log(`${n}/${n} pass`);
