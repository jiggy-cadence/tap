// TAP vault — the phone-side lock between an AI agent and the things that cost money.
// "Prompts are suggestions. TAP is a lock."
//
// The agent gets ONE capability: request(intent). It never sees a key, a policy, or a balance
// it can edit. Secrets and policy live in this closure. Small, known spend runs on an allowance;
// anything over the allowance, to a new recipient, or of an always-tap kind returns
// needs_ceremony and executes ONLY after a fresh stone ceremony whose challenge is derived from
// the exact intent the human is shown. Executes the STORED intent, never a caller-supplied one.
//
// Kinds shipped:
//   'openrouter'             API spend, USD. Vault-enforced cap.
//   'sol_transfer'           native SOL, lamports, one key. Vault-enforced only (native SOL cannot be
//                            owned by an SPL multisig, so the chain does not back this one).
//   'spl_multisig_transfer'  SPL token from a treasury owned by a 2-of-2 multisig [agent, phone].
//                            The vault holds the PHONE key and co-signs after the ceremony; the agent
//                            adds its own signature and broadcasts. Chain-enforced: without the phone
//                            signature the Token program refuses (MissingRequiredSignature).
//   'squads_vault_transfer'  native SOL from a Squads v4 vault [agent, phone], threshold 2, with an on-chain spending
//                            limit for the agent (the allowance, enforced by the Squads program). Over the limit the
//                            agent opens a proposal; after the ceremony the vault checks the proposal matches the
//                            stored intent and co-approves with the phone key (squads.js). Chain-enforced.
// Add a kind = add a cost function + an executor. The lock logic doesn't change.
'use strict';
const crypto = require('crypto');
const { canon } = require('./canon');
const H = (...parts) => crypto.createHash('sha256').update(parts.join('|')).digest('hex');
const WALLET_KINDS = new Set(['sol_transfer', 'spl_multisig_transfer', 'squads_vault_transfer']);   // kinds with a recipient

function createVault({ secrets, policy, executors, verifyCeremony, now = () => Date.now(), lockStore }) {
  // ---- private state: nothing below is reachable from the returned object ----
  const S = Object.freeze({ ...secrets });          // e.g. { openrouterKey, solanaSecretKey, phoneSecretKey }
  const P = JSON.parse(JSON.stringify(policy));     // deep copy: caller can't mutate after
  const spent = [];                                 // { kind, amount, t } rolling 24 h ledger
  const pending = new Map();                        // intentId -> { intent, digest, challenge, exp }
  const used = new Set();                           // consumed intentIds (single use)
  const known = {};                                 // kind -> Set of trusted recipients
  for (const k of WALLET_KINDS) known[k] = new Set(P[k]?.knownRecipients || []);
  // Lockout state must SURVIVE RESTARTS, or "10 tries ever" becomes "10 tries per restart" (OVERLOOKED.md #2).
  // lockStore: { load() -> {fails,lockedUntil,hardLocked}|null, save(state) } (SecureStore in the app, a file on node).
  let { fails = 0, lockedUntil = 0, hardLocked = false } = (lockStore && lockStore.load()) || {};
  const saveLock = () => { if (lockStore) lockStore.save({ fails, lockedUntil, hardLocked }); };

  const DAY = 24 * 3600 * 1000;
  const MAX_PENDING = P.maxPending || 64;
  const spentLast24h = kind => spent.filter(s => s.kind === kind && now() - s.t < DAY).reduce((a, s) => a + s.amount, 0);

  // recipient must be a plain non-empty string; the executor does the base58/curve check with PublicKey
  function checkRecipient(to) {
    if (typeof to !== 'string' || to.length === 0 || to.length > 44 || /\s/.test(to)) throw new Error('recipient must be a non-empty address string');
  }

  // worst-case cost BEFORE running. For OpenRouter this is an ESTIMATE (chars/3 undercounts CJK and
  // emoji); the ledger is reconciled to the provider's reported cost afterwards. Not a hard bound.
  function costOf(intent) {
    if (intent.kind === 'openrouter') {
      // own-property only: model:'constructor' must not resolve through the prototype chain
      const price = Object.hasOwn(P.openrouter.prices, intent.model) ? P.openrouter.prices[intent.model] : null;
      if (!price) throw new Error(`unpriced model ${intent.model} (refuse, don't guess)`);
      if (!Number.isInteger(intent.max_tokens) || intent.max_tokens <= 0) throw new Error('openrouter: max_tokens required (it bounds the cost)');
      const promptTok = Math.ceil(JSON.stringify(intent.messages || []).length / 3); // generous upper estimate
      const usd = promptTok * price.prompt + intent.max_tokens * price.completion;      // USD
      if (!Number.isFinite(usd) || usd < 0) throw new Error('openrouter: cost not computable (refuse)');
      return usd;
    }
    if (intent.kind === 'sol_transfer') {
      checkRecipient(intent.to);
      if (!Number.isInteger(intent.lamports) || intent.lamports <= 0) throw new Error('sol_transfer: lamports must be a positive integer');
      return intent.lamports;
    }
    if (intent.kind === 'spl_multisig_transfer') {
      checkRecipient(intent.to);
      // amount in base units (integer). Number.isSafeInteger keeps the ledger exact up to 2^53.
      if (!Number.isSafeInteger(intent.amount) || intent.amount <= 0) throw new Error('spl_multisig_transfer: amount must be a positive safe integer in base units');
      return intent.amount;
    }
    if (intent.kind === 'squads_vault_transfer') {
      checkRecipient(intent.to);
      if (!Number.isSafeInteger(intent.lamports) || intent.lamports <= 0) throw new Error('squads_vault_transfer: lamports must be a positive safe integer');
      // the proposal index is part of the intent, so the challenge binds the tap to ONE on-chain proposal
      if (!Number.isInteger(intent.transactionIndex) || intent.transactionIndex < 0) throw new Error('squads_vault_transfer: transactionIndex must be a non-negative integer');
      return intent.lamports;
    }
    throw new Error(`unknown kind ${intent.kind}`);
  }

  function needsTap(intent, cost) {
    const pol = P[intent.kind] || {};
    if (pol.alwaysTap) return 'kind is always-tap';
    if (WALLET_KINDS.has(intent.kind) && !known[intent.kind].has(intent.to)) return 'new recipient';
    if (spentLast24h(intent.kind) + cost > pol.allowance) return 'over allowance';
    return null;
  }

  async function run(intent, cost) {
    // RESERVE before the await: otherwise N concurrent requests all see the same spent24h and all pass
    const entry = { kind: intent.kind, amount: cost, t: now() };
    spent.push(entry);
    let out;
    try { out = await executors[intent.kind](intent, S, P[intent.kind]); }   // executor gets secrets; agent never does
    catch (e) { spent.splice(spent.indexOf(entry), 1); throw e; }
    const actual = out?.actualCost;
    if (Number.isFinite(actual) && actual >= 0) entry.amount = actual;
    // a tap blesses ONE send. The recipient is trusted for future allowance sends only if the human
    // saw and tapped "trust this address" (intent.trust === true, shown in describe()).
    if (WALLET_KINDS.has(intent.kind) && intent.trust === true) known[intent.kind].add(intent.to);
    return { status: 'done', result: out?.result };
  }

  function pruneExpired() { for (const [id, p] of pending) if (now() > p.exp) pending.delete(id); }

  async function request(intent) {
    if (hardLocked) return { status: 'locked', reason: 'too many failed ceremonies: re-pair the stone' };
    const cost = costOf(intent);
    const why = needsTap(intent, cost);
    if (!why) return run(intent, cost);
    pruneExpired();
    if (pending.size >= MAX_PENDING) return { status: 'refused', reason: `too many pending intents (${MAX_PENDING}); wait for them to expire` };
    const digest = H('TAP1', canon(intent));
    const nonce = crypto.randomBytes(16).toString('hex');
    const intentId = H('id', digest, nonce).slice(0, 16);
    // the ceremony challenge is DERIVED from the intent: a tap can only bless this exact intent
    const challenge = H('chal', digest, nonce);
    pending.set(intentId, { intent: JSON.parse(JSON.stringify(intent)), digest, challenge, cost, exp: now() + (P.ttlMs || 30000) });
    return { status: 'needs_ceremony', intentId, why, show: describe(intent, cost), challenge };
  }

  async function approve(intentId, attestation) {
    if (hardLocked) return { status: 'locked' };
    if (now() < lockedUntil) return { status: 'cooldown', retryInMs: lockedUntil - now() };
    if (used.has(intentId)) return { status: 'refused', reason: 'already used (replay)' };
    const p = pending.get(intentId);
    if (!p) return { status: 'refused', reason: 'unknown intent' };
    if (now() > p.exp) { pending.delete(intentId); return { status: 'refused', reason: 'expired' }; }
    if (!verifyCeremony(p.challenge, attestation)) {
      fails++;
      // ESCALATING lockout: a flat "3 fails → 60 s" allows ~3,600 guesses/day (see MATH.md)
      if (fails >= (P.hardLockAfter || 10)) hardLocked = true;
      else if (fails >= 3) lockedUntil = now() + 60000 * 2 ** (fails - 3);
      saveLock();
      return { status: 'refused', reason: 'ceremony did not verify' };
    }
    // no reset on success: a reset would hand out fresh guesses after every legit tap (MATH.md budget is TOTAL)
    used.add(intentId); pending.delete(intentId);
    return run(p.intent, p.cost);               // the STORED intent, not anything the caller sends now
  }

  const fmtUnits = (n, dec) => (n / 10 ** dec).toFixed(dec).replace(/0+$/, '').replace(/\.$/, '');
  function describe(i, cost) {
    const trust = i.trust === true ? ' and TRUST this address for future allowance sends' : '';
    const isNew = k => known[k].has(i.to) ? '' : ' (NEW address)';
    if (i.kind === 'sol_transfer') return `Send ${fmtUnits(i.lamports, 9)} SOL to ${i.to}${isNew(i.kind)}${trust}`;
    if (i.kind === 'spl_multisig_transfer') {
      const pol = P.spl_multisig_transfer || {};
      return `Send ${fmtUnits(i.amount, pol.decimals ?? 0)} ${pol.symbol || 'tokens'} to ${i.to}${isNew(i.kind)}${trust} (2-of-2 treasury)`;
    }
    if (i.kind === 'squads_vault_transfer') return `Send ${fmtUnits(i.lamports, 9)} SOL to ${i.to}${isNew(i.kind)}${trust} (Squads proposal #${i.transactionIndex})`;
    if (i.kind === 'openrouter') {
      // the human must see WHAT is being sent, not just the price: first line of the prompt + a hash of all of it
      const msgs = JSON.stringify(i.messages || []);
      const first = (i.messages || []).map(m => String(m?.content ?? '')).find(Boolean) || '';
      const excerpt = first.replace(/\s+/g, ' ').slice(0, 80) + (first.length > 80 ? '…' : '');
      return `AI call to ${i.model}, up to $${cost.toFixed(4)}; prompt "${excerpt}" (sha256 ${H(msgs).slice(0, 12)})`;
    }
    return `${i.kind}`;
  }

  // approve() is PHONE-SIDE ONLY: the attestation must come from the phone's magnetometer.
  // Hand the agent `vault.agent` (request + status). If the agent can call approve it can guess remotely
  // and can hard-lock the human out with 10 bad calls.
  const status = () => ({ fails, locked: hardLocked, cooldownMs: Math.max(0, lockedUntil - now()), pending: pending.size,
      spent24h: { openrouter: spentLast24h('openrouter'), sol_transfer: spentLast24h('sol_transfer'), spl_multisig_transfer: spentLast24h('spl_multisig_transfer'), squads_vault_transfer: spentLast24h('squads_vault_transfer') } });
  return Object.freeze({
    request, approve, status,
    agent: Object.freeze({ request, status }),
    phone: Object.freeze({ approve }),
  });
}
module.exports = { createVault };
