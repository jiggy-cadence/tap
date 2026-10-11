'use strict';
/**
 * expo/lock-store.js — SecureStore-backed vault lockStore (Cadence OVERLOOKED #2).
 *
 * vault/vault.js expects a *synchronous* { load(), save(state) }. Expo SecureStore
 * is async, so hydrate() once at app boot, then load/save hit an in-memory cache
 * and save queues a persist. Without hydrate(), load() throws LOCK_STORE_NOT_HYDRATED
 * (fail closed — never silently start unlocked).
 *
 * Wire (Lodestone / main seat):
 *   import * as SecureStore from 'expo-secure-store';
 *   const lockStore = makeLockStore(SecureStore);
 *   await lockStore.hydrate();
 *   const vault = createVault({ ..., lockStore });
 *
 * Factory-wipe of the SecureStore entry resets the hard lock — Jiggy's product call
 * whether that requires a re-pair ceremony.
 */
function makeLockStore(secureStore, { key = 'tap.lockout.v1' } = {}) {
  if (!secureStore || typeof secureStore.getItem !== 'function' || typeof secureStore.setItem !== 'function') {
    const err = new Error('NO_LOCK_STORE');
    err.code = 'NO_LOCK_STORE';
    throw err;
  }
  let cache = null; // null = empty/unlocked; object = persisted shape
  let ready = false;
  let pending = Promise.resolve();

  const normalize = (st) => ({
    fails: Number(st.fails) || 0,
    lockedUntil: Number(st.lockedUntil) || 0,
    hardLocked: !!st.hardLocked,
  });

  return {
    async hydrate() {
      const raw = await secureStore.getItem(key);
      if (raw == null || raw === '') cache = null;
      else {
        try {
          const parsed = JSON.parse(raw);
          cache = parsed && typeof parsed === 'object' ? normalize(parsed) : null;
        } catch {
          const err = new Error('CORRUPT_LOCK_STORE');
          err.code = 'CORRUPT_LOCK_STORE';
          throw err;
        }
      }
      ready = true;
      return cache && { ...cache };
    },
    load() {
      if (!ready) {
        const err = new Error('LOCK_STORE_NOT_HYDRATED');
        err.code = 'LOCK_STORE_NOT_HYDRATED';
        throw err;
      }
      return cache && { ...cache };
    },
    save(state) {
      if (!ready) {
        const err = new Error('LOCK_STORE_NOT_HYDRATED');
        err.code = 'LOCK_STORE_NOT_HYDRATED';
        throw err;
      }
      cache = normalize(state);
      const payload = JSON.stringify(cache);
      pending = Promise.resolve(secureStore.setItem(key, payload)).catch((e) => {
        const err = new Error('LOCK_STORE_PERSIST_FAILED');
        err.code = 'LOCK_STORE_PERSIST_FAILED';
        err.cause = e;
        throw err;
      });
    },
    flush() { return pending; },
    _key: key,
  };
}

module.exports = { makeLockStore };
