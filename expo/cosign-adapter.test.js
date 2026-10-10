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
const { cosignWithStoredIntent, namedReason } = require('./cosign-adapter');
const { memoIx } = require('../vault/cosign');

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

  {
    const empty = await store.getStoredIntent();
    ok('no ceremony → NO_STORED_INTENT', !empty.ok && empty.code === 'NO_STORED_INTENT');
  }
  {
    const bad = await store.saveAtCeremony({ feePayer: 'x' });
    ok('incomplete intent → BAD_INTENT', !bad.ok && bad.code === 'BAD_INTENT');
  }
  {
    const saved = await store.saveAtCeremony(intent, { ceremonyId: 'demo-1' });
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
      store,
      agentIntent: { ...intent, amount: '100000000' },
    });
    ok('agentIntent arg → REFUSED_AGENT_INTENT', !r.ok && r.code === 'REFUSED_AGENT_INTENT');
  }

  {
    const bytes = build([tc()]);
    const r = await cosignWithStoredIntent({ msgBytes: bytes, phoneKeypair: phone, store });
    ok('honest tx + stored intent → SIGNED', r.ok && r.code === 'SIGNED');
    ok('sig verifies over exact msgBytes', r.ok && nacl.sign.detached.verify(bytes, r.signature, phone.publicKey.toBytes()));
  }

  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc({ amount: 100_000_000n })]),
      phoneKeypair: phone, store,
    });
    ok('amount swap → REFUSED_AMOUNT_MISMATCH', !r.ok && r.code === 'REFUSED_AMOUNT_MISMATCH');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc({ dst: evil })]),
      phoneKeypair: phone, store,
    });
    ok('dest swap → REFUSED_DESTINATION_MISMATCH', !r.ok && r.code === 'REFUSED_DESTINATION_MISMATCH');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: build([tc()], mallory.publicKey),
      phoneKeypair: phone, store,
    });
    ok('fee payer swap → REFUSED_FEE_PAYER', !r.ok && r.code === 'REFUSED_FEE_PAYER');
  }
  {
    const r = await cosignWithStoredIntent({
      msgBytes: Buffer.concat([build([tc()]), Buffer.alloc(64, 7)]),
      phoneKeypair: phone, store,
    });
    ok('trailing bytes → REFUSED_NON_CANONICAL', !r.ok && r.code === 'REFUSED_NON_CANONICAL');
  }
  {
    const forged = build([tc(), memoIx({ ...intent, amount: '100000000' })]);
    const r = await cosignWithStoredIntent({ msgBytes: forged, phoneKeypair: phone, store });
    ok('forged memo → REFUSED_MEMO_MISMATCH', !r.ok && r.code === 'REFUSED_MEMO_MISMATCH');
  }
  {
    ok('namedReason maps amount', namedReason('amount mismatch: tx=1 approved=2') === 'REFUSED_AMOUNT_MISMATCH');
    ok('namedReason maps destination', namedReason('destination mismatch: tx=a approved=b') === 'REFUSED_DESTINATION_MISMATCH');
  }

  {
    await store.clearStoredIntent();
    const r = await cosignWithStoredIntent({ msgBytes: build([tc()]), phoneKeypair: phone, store });
    ok('cleared store → NO_STORED_INTENT', !r.ok && r.code === 'NO_STORED_INTENT');
  }

  console.log(`${pass}/${pass + fail} pass`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
