'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { makeLockStore } = require('./lock-store');
const { createVault } = require('../vault/vault');

function memSecureStore() {
  const m = new Map();
  return {
    async getItem(k) { return m.has(k) ? m.get(k) : null; },
    async setItem(k, v) { m.set(k, v); },
  };
}

const K = crypto.randomBytes(32);
const stoneBits = (ch) => crypto.createHmac('sha256', K).update('mag' + ch).digest().readUInt16BE(0);
const ham = (a, b) => { let x = (a ^ b) & 0xffff, n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
const verifyCeremony = (challenge, att) => att && ham(att.bits, stoneBits(challenge)) <= 1;

let n = 0;
async function t(name, fn) { await fn(); n++; console.log('ok', n, name); }

(async () => {
  await t('refuses missing SecureStore', () => {
    assert.throws(() => makeLockStore(null), (e) => e.code === 'NO_LOCK_STORE');
  });
  await t('load before hydrate fails closed', () => {
    const s = makeLockStore(memSecureStore());
    assert.throws(() => s.load(), (e) => e.code === 'LOCK_STORE_NOT_HYDRATED');
  });
  await t('hydrate empty → load null; save + restart keeps hard lock', async () => {
    const backend = memSecureStore();
    const a = makeLockStore(backend);
    await a.hydrate();
    assert.equal(a.load(), null);
    a.save({ fails: 10, lockedUntil: 0, hardLocked: true });
    await a.flush();
    const b = makeLockStore(backend);
    await b.hydrate();
    assert.deepEqual(b.load(), { fails: 10, lockedUntil: 0, hardLocked: true });
  });
  await t('corrupt JSON fails closed', async () => {
    const backend = memSecureStore();
    await backend.setItem('tap.lockout.v1', '{not json');
    const s = makeLockStore(backend);
    await assert.rejects(() => s.hydrate(), (e) => e.code === 'CORRUPT_LOCK_STORE');
  });
  await t('vault hard lock survives restart via lock-store', async () => {
    let clock = 1_000_000;
    const backend = memSecureStore();
    const store = makeLockStore(backend);
    await store.hydrate();
    const mk = (lockStore) => createVault({
      lockStore,
      secrets: { openrouterKey: 'sk-or-v1-x', solanaSecretKey: 'SOL' },
      policy: {
        openrouter: { allowance: 0.05, prices: { 'cheap/model': { prompt: 1e-7, completion: 4e-7 } } },
        sol_transfer: { allowance: 10_000_000, knownRecipients: ['Alice111'] },
        ttlMs: 30000, hardLockAfter: 10,
      },
      executors: {
        openrouter: async () => ({ result: 'ok', actualCost: 0 }),
        sol_transfer: async () => ({ result: 'sig' }),
      },
      verifyCeremony,
      now: () => clock,
    });
    const v = mk(store);
    for (let i = 1; i <= 10; i++) {
      clock += 60000 * 2 ** Math.max(0, i - 3) + 1;
      const r = await v.request({ kind: 'sol_transfer', to: 'Mallory' + i, lamports: 1 });
      assert.equal(r.status, 'needs_ceremony');
      await v.approve(r.intentId, { bits: stoneBits(r.challenge) ^ 0b111 });
    }
    assert.equal(v.status().locked, true);
    await store.flush();
    const store2 = makeLockStore(backend);
    await store2.hydrate();
    const v2 = mk(store2);
    assert.equal(v2.status().locked, true, 'hard lock must survive restart');
    assert.equal((await v2.request({ kind: 'sol_transfer', to: 'Alice111', lamports: 1 })).status, 'locked');
  });
  console.log(`${n}/${n} pass`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
