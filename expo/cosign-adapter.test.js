// Node tests for expo/useStoredIntent.js + expo/cosign-adapter.js.
// FOR LODESTONE TO WIRE into Expo Go — these tests do NOT run in Expo; they prove the
// contract against vault/cosign.js in Node.
'use strict';
const path = require('path');
const Module = require('module');
const vaultNm = path.join(__dirname, '..', 'vault', 'node_modules');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try { return origResolve.call(this, request, parent, isMain, options); }
  catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    try { return origResolve.call(this, path.join(vaultNm, request), parent, isMain, options); }
    catch { /* fall through */ }
    // bare package from vault/node_modules
    const candidate = require('fs').existsSync(path.join(vaultNm, request))
      ? path.join(vaultNm, request)
      : null;
    if (candidate) return origResolve.call(this, candidate, parent, isMain, options);
    // Let node resolve via NODE_PATH-style: inject vaultNm into paths
    const paths = (parent && parent.paths) ? parent.paths.slice() : [];
    if (!paths.includes(vaultNm)) paths.unshift(vaultNm);
    return origResolve.call(this, request, { ...parent, paths }, isMain, options);
  }
};
// Also prepend for children
const origPaths = Module._nodeModulePaths;
Module._nodeModulePaths = function (from) {
  const paths = origPaths.call(this, from);
  if (!paths.includes(vaultNm)) paths.unshift(vaultNm);
  return paths;
};

const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const nacl = require('tweetnacl');
const { makeStoredIntent, memoryStorage } = require('./useStoredIntent');
const { cosignWithStoredIntent, namedReason, USED_KEY } = require('./cosign-adapter');
const { checkPriorityFee } = require('./fee-guard');
const { memoIx, tapMemo } = require('../vault/cosign');
const TAP = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const kp = () => web3.Keypair.generate();
const agent = kp(), phone = kp(), mallory = kp();
const ms = kp().publicKey, mint = kp().publicKey, src = kp().publicKey, dst = kp().publicKey, evil = kp().publicKey;
const BH = '11111111111111111111111111111111';
const intent = {
  feePayer: agent.publicKey.toBase58(), source: src.toBase58(), mint: mint.toBase58(),
  destination: dst.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6,
};

const tc = (o = {}) => spl.createTransferCheckedInstruction(
  o.src || src, o.mint || mint, o.dst || dst, ms,
  o.amount ?? 5_000_000n, o.dec ?? 6, [agent.publicKey, phone.publicKey],
);
const build = (ixs, payer = agent.publicKey) => {
  const t = new web3.Transaction({ feePayer: payer, recentBlockhash: BH });
  ixs.forEach(i => t.add(i));
  return t.serializeMessage();
};

let pass = 0, fail = 0;
const ok = (name, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };

(async () => {
  const store = makeStoredIntent(memoryStorage());
  const usedStorage = memoryStorage();

  {
    const empty = await store.getStoredIntent();
    ok('no ceremony → NO_STORED_INTENT', !empty.ok && empty.code === 'NO_STORED_INTENT');
  }
  {
    const bad = await store.saveAtCeremony({ feePayer: 'x' });
    ok('incomplete intent → BAD_INTENT', !bad.ok && bad.code === 'BAD_INTENT');
  }
  {
    const saved = await store.saveAtCeremony(intent, { ceremonyId: 'demo-1', tapId: TAP });
    ok('ceremony save → ok', saved.ok);
    const got = await store.getStoredIntent();
    ok('get returns ceremony intent', got.ok && got.intent.amount === '5000000' && got.ceremonyId === 'demo-1');
    ok('amount stored as string', typeof got.intent.amount === 'string');
  }
  {
    const r = store.refuseAgentIntent({ ...intent, amount: '100000000' });
    ok('refuseAgentIntent named', !r.ok && r.code === 'REFUSED_AGENT_INTENT');
    const got = await store.getStoredIntent();
    ok('refuseAgentIntent did not overwrite store', got.ok && got.intent.amount === '5000000');
  }

  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc()]),
      phoneKeypair: phone,
      store, usedStorage,
      agentIntent: { ...intent, amount: '100000000' },
    });
    ok('agentIntent arg → REFUSED_AGENT_INTENT', !r.ok && r.code === 'REFUSED_AGENT_INTENT');
  }

  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc({ amount: 100_000_000n })]),
      phoneKeypair: phone, store, usedStorage,
    });
    ok('amount swap → REFUSED_AMOUNT_MISMATCH', !r.ok && r.code === 'REFUSED_AMOUNT_MISMATCH');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc({ dst: evil })]),
      phoneKeypair: phone, store, usedStorage,
    });
    ok('dest swap → REFUSED_DESTINATION_MISMATCH', !r.ok && r.code === 'REFUSED_DESTINATION_MISMATCH');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc()], mallory.publicKey),
      phoneKeypair: phone, store, usedStorage,
    });
    ok('fee payer swap → REFUSED_FEE_PAYER', !r.ok && r.code === 'REFUSED_FEE_PAYER');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: Buffer.concat([build([tc()]), Buffer.alloc(64, 7)]),
      phoneKeypair: phone, store, usedStorage,
    });
    ok('trailing bytes → REFUSED_NON_CANONICAL', !r.ok && r.code === 'REFUSED_NON_CANONICAL');
  }
  {
    const forged = build([tc(), memoIx({ ...intent, amount: '100000000' })]);
    const r = await cosignWithStoredIntent({ msgBytes: forged, phoneKeypair: phone, store, usedStorage });
    ok('forged memo → REFUSED_MEMO_MISMATCH', !r.ok && r.code === 'REFUSED_MEMO_MISMATCH');
  }
  {
    const got0 = await store.getStoredIntent();
    const bytes = build([tc(), memoIx(got0.intent)]);
    const r = await cosignWithStoredIntent({ msgBytes: bytes, phoneKeypair: phone, store, usedStorage });
    ok('honest tx + stored intent → SIGNED', r.ok && r.code === 'SIGNED');
    ok('sig verifies over exact msgBytes', r.ok && nacl.sign.detached.verify(bytes, r.signature, phone.publicKey.toBytes()));
  }

  {
    // SINGLE USE, persisted (Cadence @bbc2189): same tap, fresh blockhash → refused
    const got0 = await store.getStoredIntent();
    const t = new web3.Transaction({ feePayer: agent.publicKey, recentBlockhash: web3.Keypair.generate().publicKey.toBase58() });
    t.add(tc()); t.add(memoIx(got0.intent));
    const r = await cosignWithStoredIntent({ msgBytes: t.serializeMessage(), phoneKeypair: phone, store, usedStorage });
    ok('same tap, fresh blockhash → REFUSED_REPLAY', !r.ok && r.code === 'REFUSED_REPLAY');
    const saved = JSON.parse(await usedStorage.getItem(USED_KEY));
    ok('spent tap persisted to storage', Array.isArray(saved) && saved.includes(tapMemo(got0.intent)));
    // simulate app restart: new store object over the same storage
    const r2 = await cosignWithStoredIntent({ msgBytes: t.serializeMessage(), phoneKeypair: phone, store, usedStorage: { getItem: async k => usedStorage.getItem(k), setItem: async (k, v) => usedStorage.setItem(k, v) } });
    ok('replay after restart (fresh adapter over same storage) → REFUSED_REPLAY', !r2.ok && r2.code === 'REFUSED_REPLAY');
  }
  {
    // a second REAL ceremony for the same payment mints a new tapId and works
    const s2 = makeStoredIntent(memoryStorage());
    const sv = await s2.saveAtCeremony(intent);
    ok('ceremony mints a 32-hex tapId from CSPRNG', sv.ok && /^[0-9a-f]{32}$/.test(sv.intent.tapId) && sv.intent.tapId !== TAP);
    const r = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store: s2, usedStorage });
    ok('second real tap, same payment → SIGNED', r.ok && r.code === 'SIGNED');
  }
  {
    const s3 = makeStoredIntent(memoryStorage()); await s3.saveAtCeremony(intent);
    const r = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store: s3 });
    ok('no persistent used-store → NO_USED_STORE (fails closed)', !r.ok && r.code === 'NO_USED_STORE');
    const bad = memoryStorage(); await bad.setItem(USED_KEY, '{not json');
    const r2 = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store: s3, usedStorage: bad });
    ok('corrupt used-store → CORRUPT_USED_STORE', !r2.ok && r2.code === 'CORRUPT_USED_STORE');
    const failing = { getItem: async () => null, setItem: async () => { throw new Error('disk full'); } };
    const r3 = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store: s3, usedStorage: failing });
    ok('cannot persist spend → REFUSED_PERSIST_FAILED, no signature', !r3.ok && r3.code === 'REFUSED_PERSIST_FAILED' && !r3.signature);
  }
  {
    const legacy = memoryStorage();
    await legacy.setItem('tap.storedIntent.v1', JSON.stringify({ intent, source: 'ceremony' }));
    const r = await makeStoredIntent(legacy).getStoredIntent();
    ok('stored intent without tapId → REFUSED_NO_TAP_ID', !r.ok && r.code === 'REFUSED_NO_TAP_ID');
    const r2 = await makeStoredIntent(memoryStorage()).saveAtCeremony(intent, { tapId: 'short' });
    ok('bad tapId → BAD_INTENT', !r2.ok && r2.code === 'BAD_INTENT');
  }
  {
    // priority fee bound (fee-guard.js)
    const s4 = makeStoredIntent(memoryStorage()); await s4.saveAtCeremony(intent);
    const cu = (units, price) => [web3.ComputeBudgetProgram.setComputeUnitLimit({ units }), web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price })];
    const r = await cosignWithStoredIntent({ msgBytes: build([...cu(200000, 1_000_000_000), tc()]), phoneKeypair: phone, store: s4, usedStorage: memoryStorage() });
    ok('huge priority fee (200000000 lamports = 0.2 SOL) → REFUSED_PRIORITY_FEE', !r.ok && r.code === 'REFUSED_PRIORITY_FEE');
    ok('fee math exact: 200000 CU × 1e9 µlam/CU = 200000000 lamports', checkPriorityFee(build([...cu(200000, 1_000_000_000), tc()]), 1e12).lamports === 200000000n);
    ok('fee math: no limit ix → 200000 CU default per ix', checkPriorityFee(build([web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 }), tc()])).lamports === 100000n);
    ok('fee exactly at cap 100000 → allowed', checkPriorityFee(build([...cu(100000, 1_000_000), tc()])).ok);
    ok('fee 1 lamport over cap → refused', !checkPriorityFee(build([...cu(100001, 1_000_000), tc()])).ok);
    const r2 = await cosignWithStoredIntent({ msgBytes: build([...cu(50000, 1000), tc()]), phoneKeypair: phone, store: s4, usedStorage: memoryStorage() });
    ok('normal priority fee → SIGNED', r2.ok && r2.code === 'SIGNED');
    const dup = build([web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), tc()]);
    ok('duplicate compute-budget ix → REFUSED_COMPUTE_BUDGET', checkPriorityFee(dup).code === 'REFUSED_COMPUTE_BUDGET');
    const heap = build([web3.ComputeBudgetProgram.requestHeapFrame({ bytes: 65536 }), tc()]);
    ok('heap-frame ix → REFUSED_COMPUTE_BUDGET', checkPriorityFee(heap).code === 'REFUSED_COMPUTE_BUDGET');
  }
  {
    ok('namedReason maps replay', namedReason('already used: this tap was spent (replay)') === 'REFUSED_REPLAY');
    ok('namedReason maps no tapId', namedReason('stored intent has no tapId (single-use cannot be enforced)') === 'REFUSED_NO_TAP_ID');
  }
  {
    ok('namedReason maps amount', namedReason('amount mismatch: tx=1 approved=2') === 'REFUSED_AMOUNT_MISMATCH');
    ok('namedReason maps destination', namedReason('destination mismatch: tx=a approved=b') === 'REFUSED_DESTINATION_MISMATCH');
  }

  {
    await store.clearStoredIntent();
    const r = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store, usedStorage });
    ok('cleared store → NO_STORED_INTENT', !r.ok && r.code === 'NO_STORED_INTENT');
  }

  console.log(`${pass}/${pass + fail} pass`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
