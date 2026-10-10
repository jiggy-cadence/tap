// policy.js — decides AUTO (within allowance), TAP (needs phone at stone), or REFUSE.
// Allowance is a ROLLING 24h window (wormhole §6), not a midnight reset: the sum of
// auto-approved spends whose timestamp is within the last 24h, in integer lamports.
// A calendar reset allows 2x at the boundary (0.25 at 23:59 + 0.25 at 00:00); rolling does not.
// FEES COUNT against the allowance (decision: yes). Rationale: the allowance bounds what a
// compromised agent can make you lose; fees are a loss too, and an agent spamming tiny
// transfers (or setting huge priority fees) would otherwise leak value outside the bound.
// Worst case with zero taps: auto-approved (amount + fee) in ANY 24h window <= dailyAllowance.
'use strict';
const DAY_MS = 24 * 60 * 60 * 1000;
const LAMPORTS_PER_SOL = 1_000_000_000n;
const DEFAULT_FEE = 5000n; // base fee per signature if the tx doesn't state one
const solToLamports = sol => BigInt(Math.round(sol * 1e9));
const fmt = l => (Number(l) / 1e9).toString();
function txLamports(tx) {
  if ('lamports' in tx) {
    const v = tx.lamports;
    if (typeof v === 'bigint') return v >= 0n ? v : null;
    if (typeof v === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(v)) return BigInt(v);
    return null; // numbers refused: unsafe above 2^53
  }
  const amt = tx.amountSol;
  if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) return null;
  return solToLamports(amt);
}
const feeOf = tx => (tx.feeLamports === undefined ? DEFAULT_FEE : (/^(0|[1-9][0-9]*)$/.test(String(tx.feeLamports)) && typeof tx.feeLamports !== 'number' ? BigInt(tx.feeLamports) : null));
// spent: number (legacy: SOL already spent in window, caller computed) OR history array
// [{ at: ms, lamports: string|bigint, feeLamports? }] of AUTO-approved spends.
function spentInWindow(history, nowMs) {
  let sum = 0n;
  for (const h of history) if (h.at > nowMs - DAY_MS && h.at <= nowMs) sum += BigInt(h.lamports) + BigInt(h.feeLamports ?? DEFAULT_FEE);
  return sum;
}
function evaluate(policy, tx, spent = 0, nowMs = Date.now()) {
  if ('amountSol' in tx && !('lamports' in tx) && typeof tx.amountSol !== 'number')
    return { verdict: 'REFUSE', code: 'REFUSE_BAD_AMOUNT', reason: Number.isFinite(Number(tx.amountSol)) ? 'amount must be a number, not text' : 'amount is not a valid number' };
  const amt = txLamports(tx);
  if (amt === null) return { verdict: 'REFUSE', code: 'REFUSE_BAD_AMOUNT', reason: 'amount is not a valid number (lamports must be an integer string)' };
  const fee = feeOf(tx);
  if (fee === null) return { verdict: 'REFUSE', code: 'REFUSE_BAD_FEE', reason: 'fee must be an integer string of lamports' };
  if ((policy.alwaysTap || []).includes(tx.kind)) return { verdict: 'TAP', code: 'TAP_ALWAYS', reason: `"${tx.kind}" always needs a tap` };
  if (!(policy.allowedRecipients || {})[tx.to]) return { verdict: 'TAP', code: 'TAP_RECIPIENT', reason: 'recipient is not on your list' };
  const perTx = solToLamports(policy.perTxAutoMaxSol), daily = solToLamports(policy.dailyAllowanceSol);
  if (amt > perTx) return { verdict: 'TAP', code: 'TAP_PER_TX', reason: `${fmt(amt)} SOL is over the ${policy.perTxAutoMaxSol} SOL per-payment limit` };
  // Legacy numeric arg: amounts only (pre-fee behavior) so old callers keep their meaning.
  const used = Array.isArray(spent) ? spentInWindow(spent, nowMs) : solToLamports(spent);
  const cost = Array.isArray(spent) ? amt + fee : amt;
  if (used + cost > daily) return { verdict: 'TAP', code: 'TAP_ALLOWANCE', reason: `would exceed the ${policy.dailyAllowanceSol} SOL rolling-24h allowance (${fmt(used)} SOL incl. fees used)` };
  return { verdict: 'AUTO', code: 'AUTO_OK', reason: 'within allowance' };
}
module.exports = { evaluate, spentInWindow, DAY_MS, LAMPORTS_PER_SOL, DEFAULT_FEE };
