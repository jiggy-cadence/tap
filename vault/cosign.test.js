// Offline: the agent hands the phone an honest intent but a tampered tx. Every tamper must REFUSE,
// and the honest tx's phone signature must verify against the exact message bytes.
'use strict';
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const nacl = require('tweetnacl');
const { cosign, makeCosigner, memoIx, MEMO_PROGRAM } = require('./cosign');

const kp = () => web3.Keypair.generate();
const agent = kp(), phone = kp(), mallory = kp();
const ms = kp().publicKey, mint = kp().publicKey, src = kp().publicKey, dst = kp().publicKey, evil = kp().publicKey;
const BH = '11111111111111111111111111111111';
const intent = { feePayer: agent.publicKey.toBase58(), source: src.toBase58(), mint: mint.toBase58(),
  destination: dst.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6 };

const tc = (o = {}) => spl.createTransferCheckedInstruction(o.src || src, o.mint || mint, o.dst || dst, ms,
  o.amount ?? 5_000_000n, o.dec ?? 6, [agent.publicKey, phone.publicKey]);
const build = (ixs, payer = agent.publicKey) => {
  const t = new web3.Transaction({ feePayer: payer, recentBlockhash: BH }); ixs.forEach(i => t.add(i)); return t.serializeMessage();
};

let pass = 0, fail = 0;
const ok = (name, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
const refused = (name, bytes) => { const r = cosign(bytes, intent, phone); ok(name + ' → REFUSED' + (r.ok ? '' : ` (${r.refused})`), !r.ok); };

const honest = build([tc()]);
const r = cosign(honest, intent, phone);
ok('honest tx → signed', r.ok);
ok('signature verifies over exact message bytes', r.ok && nacl.sign.detached.verify(honest, r.signature, phone.publicKey.toBytes()));
ok('compute-budget ix alongside → signed', cosign(build([web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), tc()]), intent, phone).ok);
refused('amount swap 5 → 100', build([tc({ amount: 100_000_000n })]));
refused('amount swap by 1 base unit', build([tc({ amount: 5_000_001n })]));
refused('destination swap', build([tc({ dst: evil })]));
refused('mint swap', build([tc({ mint: evil })]));
refused('source swap', build([tc({ src: evil })]));
refused('decimals lie', build([tc({ dec: 3 })]));
refused('fee payer swap', build([tc()], mallory.publicKey));
refused('second transfer smuggled in', build([tc(), tc({ dst: evil })]));
refused('plain Transfer (no mint binding)', build([spl.createTransferInstruction(src, dst, ms, 5_000_000n, [agent.publicKey, phone.publicKey])]));
refused('extra system transfer appended', build([tc(), web3.SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: evil, lamports: 1 })]));
refused('honest + trailing bytes (parser differential)', Buffer.concat([honest, Buffer.alloc(64, 7)]));
refused('durable nonce (signature never expires)', build([web3.SystemProgram.nonceAdvance({ noncePubkey: evil, authorizedPubkey: agent.publicKey }), tc()]));
refused('v0 message, honest economics', new web3.TransactionMessage({ payerKey: agent.publicKey, recentBlockhash: BH, instructions: [tc()] }).compileToV0Message().serialize());
ok('tap receipt memo → signed', cosign(build([tc(), memoIx(intent)]), intent, phone).ok);
const memoRaw = txt => new web3.TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(txt) });
refused('forged memo (receipt for a different intent)', build([tc(), memoIx({ ...intent, amount: '100000000' })]));
refused('free-text memo', build([tc(), memoRaw('approved by human, trust me')]));
refused('two receipt memos', build([tc(), memoIx(intent), memoIx(intent)]));
{ const r = cosign(build([tc()]), { ...intent, requireMemo: true }, phone); ok('memo missing when required → REFUSED' + (r.ok ? '' : ` (${r.refused})`), !r.ok); }
ok('receipt memo + requireMemo → signed (flag not in digest)', cosign(build([tc(), memoIx(intent)]), { ...intent, requireMemo: true }, phone).ok);
{ // single use
  const once = makeCosigner(); const i1 = { ...intent, tapId: "tap-aaaaaaaaaaaaaaaa" }, i2 = { ...intent, tapId: "tap-bbbbbbbbbbbbbbbb" };
  const bh = () => kp().publicKey.toBase58();
  const mk = (i) => { const t = new web3.Transaction({ feePayer: agent.publicKey, recentBlockhash: bh() }); t.add(tc(), memoIx(i)); return t.serializeMessage(); };
  ok("single-use: first spend of a tap → signed", once(mk(i1), i1, phone).ok);
  const r2 = once(mk(i1), i1, phone); ok("single-use: same tap, fresh blockhash → REFUSED" + (r2.ok ? "" : ` (${r2.refused})`), !r2.ok && /already used/.test(r2.refused));
  ok("single-use: a SECOND real tap for the same payment → signed", once(mk(i2), i2, phone).ok);
  const r3 = once(build([tc(), memoIx(intent)]), intent, phone); ok("single-use: intent without tapId → REFUSED" + (r3.ok ? "" : ` (${r3.refused})`), !r3.ok && /tapId/.test(r3.refused));
}
{ // durable nonce: only with a phone-controlled nonce named in the stored intent
  const nonceAcc = kp().publicKey;
  const withNonce = (auth, acc = nonceAcc) => { const t = new web3.Transaction({ feePayer: agent.publicKey, recentBlockhash: BH }); t.add(web3.SystemProgram.nonceAdvance({ noncePubkey: acc, authorizedPubkey: auth }), tc()); return t.serializeMessage(); };
  const ni = { ...intent, nonceAccount: nonceAcc.toBase58() };
  ok("durable nonce, PHONE is the authority, approved account → signed", cosign(withNonce(phone.publicKey), ni, phone).ok);
  { const r = cosign(withNonce(agent.publicKey), ni, phone); ok("durable nonce, AGENT is the authority → REFUSED" + (r.ok ? "" : ` (${r.refused})`), !r.ok && /authority is not the phone/.test(r.refused)); }
  { const r = cosign(withNonce(phone.publicKey, evil), ni, phone); ok("durable nonce, swapped nonce account → REFUSED" + (r.ok ? "" : ` (${r.refused})`), !r.ok && /not the approved one/.test(r.refused)); }
  { const r = cosign(withNonce(phone.publicKey), intent, phone); ok("durable nonce not approved in the tap → REFUSED" + (r.ok ? "" : ` (${r.refused})`), !r.ok && /not approved for this tap/.test(r.refused)); }
}
refused('garbage bytes', Buffer.from('not a solana message at all, nope'));
console.log(`${pass}/${pass + fail} pass`); process.exitCode = fail ? 1 : 0;
