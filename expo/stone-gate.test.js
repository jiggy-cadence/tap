// Adversarial tests for Stage 1 stone-attested approval (expo/stone-gate.js via expo/cosign-adapter.js).
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
const { cosignWithStoredIntent, STONE_PAIRING_KEY } = require('./cosign-adapter');
const { stoneCounterKey, checkStoneEvidence } = require('./stone-gate');
const { explain } = require('./reasons');
const { memoIx } = require('../vault/cosign');
const S = require('../vault/stone-sig');

const kp = () => web3.Keypair.generate();
const agent = kp(), phone = kp();
const ms = kp().publicKey, mint = kp().publicKey, src = kp().publicKey, dst = kp().publicKey;
const intent = { feePayer: agent.publicKey.toBase58(), source: src.toBase58(), mint: mint.toBase58(),
  destination: dst.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6 };
const tc = () => spl.createTransferCheckedInstruction(src, mint, dst, ms, 5_000_000n, 6, [agent.publicKey, phone.publicKey]);
const txFor = (it, bh = '11111111111111111111111111111111') => { const t = new web3.Transaction({ feePayer: agent.publicKey, recentBlockhash: bh }); t.add(tc()); t.add(memoIx(it)); return t.serializeMessage(); };

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

// Simulated stone: mirrors firmware/stone_sign.h (byte equality proven in stone/stone-sig.test.js).
function makeStone(seedByte = 0x21) {
  const kp = nacl.sign.keyPair.fromSeed(Buffer.alloc(32).map((_, i) => seedByte + i));
  const pk = Buffer.from(kp.publicKey).toString('hex');
  const magKey = Buffer.alloc(32, 0).map((_, i) => 0x50 + i).toString('hex');
  let counter = 0n;
  return {
    pk, magKey,
    sign({ cluster, vault, txHash, tapId, touched }) {
      if (!touched) return null;                    // firmware: STONE_NO_TOUCH, nothing emitted
      counter += 1n;                                // firmware: persisted before the sig exists
      const msg = S.buildStoneMsg({ cluster, vault, txHash, tapId, counter, stonePubkey: pk });
      return { stonePubkey: pk, cluster, txHash, tapIdHash: S.sha256(Buffer.from(tapId, 'utf8')).toString('hex'), counter: counter.toString(),
        msg: msg.toString('hex'), sig: Buffer.from(nacl.sign.detached(msg, kp.secretKey)).toString('hex'), magMeasured: S.magBits(magKey, msg) };
    },
  };
}
const VAULT = ms.toBuffer().toString('hex');
const pairingFor = (st, counterAtPairing = '0') => ({ stonePubkey: st.pk, magKey: st.magKey, counterAtPairing });

async function setup(stone) {
  const storage = memoryStorage();
  if (stone) await storage.setItem(STONE_PAIRING_KEY, JSON.stringify(pairingFor(stone)));
  const store = makeStoredIntent(memoryStorage());
  const sv = await store.saveAtCeremony(intent);
  const bytes = txFor(sv.intent);
  const txHash = S.sha256(Buffer.from(bytes)).toString('hex');
  return { storage, store, it: sv.intent, bytes, txHash };
}
const NOW = () => ({ promptedAt: 1_000_000, receivedAt: 1_005_000 });
const run = (c, stoneEvidence, extra = {}) => cosignWithStoredIntent({ msgBytes: c.bytes, phoneKeypair: phone, store: c.store, usedStorage: c.storage, stoneEvidence, activeCluster: 'devnet', stoneWindow: NOW(), ...extra });

(async () => {
  const stone = makeStone();
  {
    const c = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    const r = await run(c, ev);
    ok('honest: stone touched, right tx → SIGNED + stoneAttested', r.ok && r.code === 'SIGNED' && r.stoneAttested === true);
    ok('honest: phone sig verifies over exact bytes', r.ok && nacl.sign.detached.verify(c.bytes, r.signature, phone.publicKey.toBytes()));
    ok('honest: stone counter persisted', (await c.storage.getItem(stoneCounterKey(stone.pk))) === ev.counter);
  }
  {
    const c = await setup(stone);
    const r = await run(c, undefined);
    ok('stone LIFTED (no evidence) → REFUSED_STONE_ABSENT', !r.ok && r.code === 'REFUSED_STONE_ABSENT');
    ok('stone lifted: tap NOT burned, nothing persisted', (await c.storage.getItem('tap.usedTaps.v1')) == null);
  }
  {
    // phone approves with the stone lifted: agent relays a real stone sig but the phone feels no field
    const c = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    const r = await run(c, { ...ev, magMeasured: null });
    ok('real sig relayed, no field felt (stone lifted) → REFUSED_STONE_ABSENT', !r.ok && r.code === 'REFUSED_STONE_ABSENT');
  }
  {
    const c = await setup(stone);
    ok('stone without touch emits nothing', stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: false }) === null);
  }
  {
    // agent forges a stone sig: random 64 bytes under the paired stone's pubkey
    const c = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    const r = await run(c, { ...ev, sig: Buffer.from(nacl.randomBytes(64)).toString('hex') });
    ok('agent-forged sig (random bytes) → REFUSED_STONE_BAD_SIG', !r.ok && r.code === 'REFUSED_STONE_BAD_SIG');
    const agentKp = nacl.sign.keyPair();
    const msg = S.buildStoneMsg({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, counter: 99, stonePubkey: stone.pk });
    const r2 = await run(c, { ...ev, counter: '99', sig: Buffer.from(nacl.sign.detached(msg, agentKp.secretKey)).toString('hex') });
    ok('agent signs correct bytes with ITS key, claims stone pk → REFUSED_STONE_BAD_SIG', !r2.ok && r2.code === 'REFUSED_STONE_BAD_SIG');
  }
  {
    // stone key swap: agent's own "stone" signs perfectly and names its own pubkey
    const c = await setup(stone);
    const evil = makeStone(0x99);
    const ev = evil.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    const r = await run(c, ev);
    ok('stone key swap (valid sig by an unpaired stone) → REFUSED_STONE_KEY_MISMATCH', !r.ok && r.code === 'REFUSED_STONE_KEY_MISMATCH');
    const r2 = await run(c, ev, { stonePairing: pairingFor(evil), pairing: pairingFor(evil) });
    ok('caller-supplied pairing is ignored (pairing only from phone storage)', !r2.ok && r2.code === 'REFUSED_STONE_KEY_MISMATCH');
  }
  {
    // sig for a different tx (the stone really signed — just another payment)
    const c = await setup(stone);
    const other = S.sha256(Buffer.from('some other payment')).toString('hex');
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: other, tapId: c.it.tapId, touched: true });
    const r = await run(c, ev);
    ok('stone sig for a different tx → REFUSED_STONE_WRONG_TX', !r.ok && r.code === 'REFUSED_STONE_WRONG_TX');
    const r2 = await run(c, { ...ev, txHash: c.txHash });
    ok('different-tx sig with the txHash label LIED to match → REFUSED_STONE_BAD_SIG', !r2.ok && r2.code === 'REFUSED_STONE_BAD_SIG');
    const ev3 = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: 'ffffffffffffffffffffffffffffffff', touched: true });
    const r3 = await run(c, ev3);
    ok('stone sig for same tx but another tapId → REFUSED_STONE_TAPID_MISMATCH', !r3.ok && r3.code === 'REFUSED_STONE_TAPID_MISMATCH');
    ok('another-tapId sig with tapIdHash label lied → REFUSED_STONE_BAD_SIG', (await run(c, { ...ev3, tapIdHash: S.sha256(Buffer.from(c.it.tapId)).toString('hex'), msg: undefined })).code === 'REFUSED_STONE_BAD_SIG');
    // Lodestone attack 1: devnet evidence replayed into a mainnet ceremony (messageBytes carry no cluster)
    const evDev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    ok('devnet stone evidence, phone on mainnet → REFUSED_STONE_CLUSTER_MISMATCH', (await run(c, evDev, { activeCluster: 'mainnet-beta' })).code === 'REFUSED_STONE_CLUSTER_MISMATCH');
    ok('devnet evidence relabelled cluster=1, phone on mainnet → REFUSED_STONE_BAD_SIG', (await run(c, { ...evDev, cluster: 1, msg: undefined }, { activeCluster: 'mainnet-beta' })).code === 'REFUSED_STONE_BAD_SIG');
    ok('phone without an active cluster → NO_ACTIVE_CLUSTER', (await run(c, evDev, { activeCluster: undefined })).code === 'NO_ACTIVE_CLUSTER');
    ok('evidence msg not 150 bytes → REFUSED_STONE_BAD_SIG', (await run(c, { ...evDev, msg: evDev.msg + '00' })).code === 'REFUSED_STONE_BAD_SIG');
  }
  {
    // stale counter: a captured, once-valid stone approval replayed onto a NEW ceremony
    const st2 = makeStone(0x31);
    const c1 = await setup(st2);
    const ev1 = st2.sign({ cluster: 2, vault: VAULT, txHash: c1.txHash, tapId: c1.it.tapId, touched: true });
    ok('stale-counter setup: first spend SIGNED', (await run(c1, ev1)).ok);
    const ev2 = st2.sign({ cluster: 2, vault: VAULT, txHash: c1.txHash, tapId: c1.it.tapId, touched: true }); // counter 2
    const ev3 = st2.sign({ cluster: 2, vault: VAULT, txHash: c1.txHash, tapId: c1.it.tapId, touched: true }); // counter 3
    await c1.storage.setItem(stoneCounterKey(st2.pk), '3');
    const r = await run(c1, ev2);
    ok('stale counter (2 ≤ last 3) → REFUSED_STONE_REPLAY', !r.ok && r.code === 'REFUSED_STONE_REPLAY');
    const r2 = await run(c1, ev3);
    ok('equal counter (3 ≤ 3) → REFUSED_STONE_REPLAY', !r2.ok && r2.code === 'REFUSED_STONE_REPLAY');
    const r3 = await run(c1, { ...ev3, counter: '4', msg: undefined });
    ok('counter bumped by the agent without re-signing → REFUSED_STONE_BAD_SIG', !r3.ok && r3.code === 'REFUSED_STONE_BAD_SIG');
  }
  {
    // bootstrap at pairing (Lodestone): phone records the stone's counter when paired; older evidence is dead
    const st3 = makeStone(0x41);
    const old = []; for (let i = 0; i < 5; i++) old.push(st3.sign({ cluster: 2, vault: VAULT, txHash: 'aa'.repeat(32), tapId: 'x'.repeat(32), touched: true }));
    const c = await setup(null);
    await c.storage.setItem(STONE_PAIRING_KEY, JSON.stringify(pairingFor(st3, '5')));
    const ev = st3.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true }); // counter 6
    const fakeOld = { ...ev, counter: '3', msg: undefined };
    ok('counter ≤ counterAtPairing (fresh phone, no lastSeen) → REFUSED_STONE_REPLAY', (await run(c, fakeOld)).code === 'REFUSED_STONE_REPLAY');
    ok('counter > counterAtPairing → SIGNED', (await run(c, ev)).ok);
    ok('lastSeen is stored per stone pubkey', (await c.storage.getItem(stoneCounterKey(st3.pk))) === '6' && (await c.storage.getItem(stoneCounterKey(stone.pk))) == null);
  }
  {
    // freshness window (Lodestone): hour-old evidence for the same tx
    const c = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    ok('evidence 61 s after prompt → REFUSED_STONE_STALE', (await run(c, ev, { stoneWindow: { promptedAt: 0, receivedAt: 61_000 } })).code === 'REFUSED_STONE_STALE');
    ok('evidence that arrived BEFORE the prompt → REFUSED_STONE_STALE', (await run(c, ev, { stoneWindow: { promptedAt: 10_000, receivedAt: 5_000 } })).code === 'REFUSED_STONE_STALE');
    ok('no window stamped → REFUSED_STONE_STALE', (await run(c, ev, { stoneWindow: undefined })).code === 'REFUSED_STONE_STALE');
  }
  {
    // pattern mismatch
    const c = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    const r = await run(c, { ...ev, magMeasured: ev.magMeasured ^ 0b11 });
    ok('field pattern off by 2 bits (real sig) → REFUSED_STONE_REMOTE', !r.ok && r.code === 'REFUSED_STONE_REMOTE');
    const r1 = await run(c, { ...ev, magMeasured: ev.magMeasured ^ 0b100 });
    ok('field pattern off by 1 bit (t=1) → SIGNED', r1.ok && r1.stoneAttested);
  }
  {
    // pattern replayed from an earlier tx (the attack E was folded in to stop)
    const c = await setup(stone);
    const old = stone.sign({ cluster: 2, vault: VAULT, txHash: S.sha256(Buffer.from('earlier')).toString('hex'), tapId: c.it.tapId, touched: true });
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c.txHash, tapId: c.it.tapId, touched: true });
    let pat = old.magMeasured; if (S.hamming16(pat, ev.magMeasured) <= 1) pat ^= 0xff; // keep the test meaningful
    const r = await run(c, { ...ev, magMeasured: pat });
    ok('old tx\'s magnet pattern replayed → REFUSED_STONE_REMOTE', !r.ok && r.code === 'REFUSED_STONE_REMOTE');
  }
  {
    // fail closed on storage problems
    const c = await setup(stone);
    await c.storage.setItem(STONE_PAIRING_KEY, '{not json');
    ok('corrupt pairing → CORRUPT_STONE_PAIRING (never skips the stone)', (await run(c, undefined)).code === 'CORRUPT_STONE_PAIRING');
    const c2 = await setup(stone);
    const ev = stone.sign({ cluster: 2, vault: VAULT, txHash: c2.txHash, tapId: c2.it.tapId, touched: true });
    const failing = { getItem: k => c2.storage.getItem(k), setItem: async (k, v) => { if (k.startsWith('tap.stoneCounter.v1:')) throw new Error('disk'); return c2.storage.setItem(k, v); } };
    const r = await run({ ...c2, storage: failing }, ev);
    ok('stone counter write fails → REFUSED_PERSIST_FAILED, no signature', !r.ok && r.code === 'REFUSED_PERSIST_FAILED' && !r.signature);
    ok('no pairing passed to gate → NO_STONE_PAIRING', checkStoneEvidence({ pairing: null }).code === 'NO_STONE_PAIRING');
  }
  {
    const c = await setup(null);
    const r = await run(c, undefined);
    ok('no stone paired → pre-Stage-1 path, honestly reported stoneAttested:false', r.ok && r.stoneAttested === false);
  }
  for (const code of ['REFUSED_STONE_ABSENT', 'REFUSED_STONE_WRONG_TX', 'REFUSED_STONE_REPLAY', 'REFUSED_STONE_BAD_SIG', 'REFUSED_STONE_REMOTE', 'REFUSED_STONE_KEY_MISMATCH', 'REFUSED_STONE_CLUSTER_MISMATCH', 'REFUSED_STONE_TAPID_MISMATCH', 'REFUSED_STONE_STALE', 'NO_ACTIVE_CLUSTER', 'NO_STONE_PAIRING', 'CORRUPT_STONE_PAIRING', 'CORRUPT_STONE_COUNTER']) {
    const e = explain(code); ok(`${code} has plain English`, e.title !== 'Refused' && e.detail.length > 20);
  }
  console.log(`${pass}/${pass + fail} pass`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
