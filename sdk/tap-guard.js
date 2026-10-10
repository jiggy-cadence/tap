// tap-guard.js — thin wrapper an agent calls instead of sending payments bare.
// DEMO / DEVNET ONLY. No network. Wire to stone/policy.js + stone/decoder.js.
//
//   const { guard } = require('./tap-guard');
//   const send = guard(agentSendFn, { policy });
//   const r = await send(tx);
//   // AUTO  → { status: 'sent', result, decoderLine }
//   // TAP   → { status: 'needs_tap', decoderLine, approve, refuse }
//   //         await r.approve(attestation) → { status: 'sent', ... }
//   // REFUSE→ { status: 'refused', decoderLine, reason }
'use strict';

const path = require('path');
const { evaluate } = require(path.join(__dirname, '..', 'stone', 'policy'));
const { decode } = require(path.join(__dirname, '..', 'stone', 'decoder'));

const DEFAULT_FEE = 5000n;

function lamportsOf(tx) {
  if ('lamports' in tx) {
    const v = tx.lamports;
    if (typeof v === 'bigint') return v >= 0n ? v : null;
    if (typeof v === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(v)) return BigInt(v);
    return null;
  }
  const amt = tx.amountSol;
  if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) return null;
  return BigInt(Math.round(amt * 1e9));
}

function feeOf(tx) {
  if (tx.feeLamports === undefined) return DEFAULT_FEE;
  if (typeof tx.feeLamports === 'number') return null;
  if (/^(0|[1-9][0-9]*)$/.test(String(tx.feeLamports))) return BigInt(tx.feeLamports);
  return null;
}

/**
 * Wrap an agent's raw send function with TAP policy.
 * @param {function(tx, ctx?): Promise|any} agentSendFn - called only when AUTO or after approve()
 * @param {{ policy: object, history?: array, now?: function }} opts
 * @returns {function(tx): Promise<object>} guarded send
 */
function guard(agentSendFn, opts = {}) {
  if (typeof agentSendFn !== 'function') throw new Error('agentSendFn must be a function');
  const policy = opts.policy;
  if (!policy || typeof policy !== 'object') throw new Error('opts.policy is required');
  const now = opts.now || (() => Date.now());
  // Rolling 24h AUTO history: [{ at, lamports, feeLamports }]
  const history = Array.isArray(opts.history) ? opts.history.slice() : [];
  let pending = null; // one in-flight needs_tap at a time

  async function send(tx) {
    if (!tx || typeof tx !== 'object') {
      return { status: 'refused', decoderLine: 'Refused: payment is missing.', reason: 'payment is missing' };
    }
    const nowMs = now();
    const outcome = evaluate(policy, tx, history, nowMs);
    const decoderLine = decode(tx, policy, outcome);

    if (outcome.verdict === 'REFUSE') {
      return { status: 'refused', decoderLine, reason: outcome.reason, verdict: 'REFUSE' };
    }

    if (outcome.verdict === 'AUTO') {
      const result = await agentSendFn(tx, { verdict: 'AUTO' });
      const lam = lamportsOf(tx);
      const fee = feeOf(tx);
      if (lam !== null && fee !== null) {
        history.push({ at: nowMs, lamports: lam.toString(), feeLamports: fee.toString() });
      }
      return { status: 'sent', result, decoderLine, verdict: 'AUTO' };
    }

    // TAP — do not call agentSendFn yet; wait for approve()
    if (pending) {
      return {
        status: 'refused',
        decoderLine: decode(tx, policy, { verdict: 'BLOCKED', reason: 'another tap is already pending' }),
        reason: 'another tap is already pending',
        verdict: 'BLOCKED',
      };
    }

    const ticket = { tx, outcome, decoderLine, nowMs, settled: false };
    pending = ticket;

    const approve = async (attestation = {}) => {
      if (pending !== ticket || ticket.settled) {
        throw new Error('no pending tap for this payment (already settled or superseded)');
      }
      ticket.settled = true;
      pending = null;
      // Tap-approved spends do NOT count against the rolling AUTO allowance
      // (policy.js only accumulates AUTO history).
      const result = await agentSendFn(tx, { verdict: 'SIGNED', tap: attestation });
      const signedLine = decode(tx, policy, { verdict: 'SIGNED', reason: '' });
      return { status: 'sent', result, decoderLine: signedLine, verdict: 'SIGNED', attestation };
    };

    const refuse = async (reason = 'user refused the tap') => {
      if (pending !== ticket || ticket.settled) {
        throw new Error('no pending tap for this payment (already settled or superseded)');
      }
      ticket.settled = true;
      pending = null;
      const line = decode(tx, policy, { verdict: 'BLOCKED', reason });
      return { status: 'refused', decoderLine: line, reason, verdict: 'BLOCKED' };
    };

    return {
      status: 'needs_tap',
      decoderLine,
      reason: outcome.reason,
      verdict: 'TAP',
      approve,
      refuse,
    };
  }

  send.getHistory = () => history.map(h => ({ ...h }));
  send.pending = () => (pending ? { decoderLine: pending.decoderLine, reason: pending.outcome.reason } : null);
  return send;
}

module.exports = { guard };
