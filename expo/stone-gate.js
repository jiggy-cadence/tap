// expo/stone-gate.js — PHONE-side enforcement of Stage 1 stone-attested approval.
// Runs inside the app, before the phone releases its co-signature. Never import this from agent code:
// the agent is the party being checked (Lodestone 05:50Z: "agent-side code verifying its own factor").
//
// Inputs:
//   pairing   — from the PHONE's secure store, written once at pairing: { stonePubkey, magKey, counterAtPairing }.
//               counterAtPairing bootstraps replay protection (never assume a fresh stone — Lodestone 06:22Z).
//   activeCluster — the cluster the PHONE is connected to right now (its own config, not the agent's).
//   vault     — from the stored intent (intent.multisig), i.e. what the human approved.
//   evidence  — what came back over the stone channel (USB/BLE). UNTRUSTED: the agent may relay or forge it.
//               { stonePubkey, cluster, txHash, tapIdHash, counter, sig, magMeasured } where magMeasured = 16 bits
//               the phone's magnetometer decoded (null/undefined if no field was felt).
//   window    — { promptedAt, receivedAt } ms timestamps stamped by the PHONE (prompt shown / evidence arrived).
//   msgBytes  — the exact tx message bytes the phone is about to co-sign.
//   tapId     — from the phone's stored intent (never from the agent).
//   lastCounter — highest stone counter this phone has accepted (persisted, 'tap.stoneCounter.v1').
// Check order is frozen in docs/STONE-SIGN-FORMAT.md.
'use strict';
const { buildStoneMsg, magBits, hamming16, verifyStoneSig, sha256, MAG_TOLERANCE, CLUSTER } = require('../vault/stone-sig');
const bs58 = require('bs58');
const WINDOW_MS = 60000; // Lodestone 06:22Z freshness: evidence must arrive within 60 s of the phone's 'touch your stone' prompt

const STONE_COUNTER_PREFIX = 'tap.stoneCounter.v1:';   // + stone pubkey hex: lastSeen is per stone
const stoneCounterKey = pk => STONE_COUNTER_PREFIX + pk;
const hexOk = (s, n) => typeof s === 'string' && s.length === 2 * n && /^[0-9a-f]+$/.test(s);
const no = (code, reason) => ({ ok: false, code, reason });

function checkStoneEvidence({ pairing, evidence, msgBytes, tapId, vault, activeCluster, lastCounter, window }) {
  if (!pairing || !hexOk(pairing.stonePubkey, 32) || !pairing.magKey) {
    return no('NO_STONE_PAIRING', 'no paired stone on this phone');
  }
  if (!evidence || evidence.sig == null || evidence.magMeasured == null) {
    return no('REFUSED_STONE_ABSENT', 'no stone signature and/or no stone field felt');
  }
  if (evidence.stonePubkey !== pairing.stonePubkey) {
    return no('REFUSED_STONE_KEY_MISMATCH', 'evidence names a different stone key than the paired one');
  }
  const cl = typeof activeCluster === 'string' ? CLUSTER[activeCluster] : activeCluster;
  if (![1, 2, 3].includes(cl)) return no('NO_ACTIVE_CLUSTER', 'phone does not know which network it is on');
  if (Number(evidence.cluster) !== cl) return no('REFUSED_STONE_CLUSTER_MISMATCH', `stone approved for cluster ${evidence.cluster}, phone is on ${cl}`);
  const ourHash = sha256(Buffer.from(msgBytes)).toString('hex');
  if (evidence.txHash !== ourHash) {
    return no('REFUSED_STONE_WRONG_TX', 'stone approved a different transaction');
  }
  if (typeof tapId !== 'string' || evidence.tapIdHash !== sha256(Buffer.from(tapId, 'utf8')).toString('hex')) {
    return no('REFUSED_STONE_TAPID_MISMATCH', 'stone approved a different tap ceremony');
  }
  if (!window || !Number.isFinite(window.promptedAt) || !Number.isFinite(window.receivedAt) ||
      window.receivedAt < window.promptedAt || window.receivedAt - window.promptedAt > WINDOW_MS) {
    return no('REFUSED_STONE_STALE', 'stone approval did not arrive within 60 s of the touch prompt');
  }
  let vaultHex;
  try { vaultHex = Buffer.from(bs58.decode(String(vault))).toString('hex'); } catch { vaultHex = ''; }
  if (vaultHex.length !== 64) return no('REFUSED_STONE_BAD_SIG', 'approved vault unreadable');
  let ctr;
  try { ctr = BigInt(evidence.counter); } catch { return no('REFUSED_STONE_BAD_SIG', 'counter unreadable'); }
  let last;
  try {
    last = BigInt(lastCounter == null ? 0 : lastCounter);
    const boot = BigInt(pairing.counterAtPairing == null ? 0 : pairing.counterAtPairing);
    if (boot > last) last = boot;
  } catch { return no('CORRUPT_STONE_COUNTER', 'stored stone counter unreadable'); }
  if (ctr <= last) return no('REFUSED_STONE_REPLAY', `stone counter ${ctr} not above last accepted ${last}`);
  if (!hexOk(evidence.sig, 64)) return no('REFUSED_STONE_BAD_SIG', 'signature malformed');
  if (evidence.msg !== undefined && !hexOk(evidence.msg, 150)) return no('REFUSED_STONE_BAD_SIG', 'stone message is not exactly 150 bytes');
  let msg;
  try { msg = buildStoneMsg({ cluster: cl, vault: vaultHex, txHash: ourHash, tapId, counter: ctr, stonePubkey: pairing.stonePubkey }); }
  catch (e) { return no('REFUSED_STONE_BAD_SIG', 'could not rebuild stone message: ' + e.message); }
  if (evidence.msg !== undefined && evidence.msg !== msg.toString('hex')) return no('REFUSED_STONE_BAD_SIG', 'stone message differs from what the phone rebuilt');
  if (!verifyStoneSig(evidence.sig, msg, pairing.stonePubkey)) return no('REFUSED_STONE_BAD_SIG', 'stone signature does not verify');
  const want = magBits(pairing.magKey, msg);
  const got = Number(evidence.magMeasured);
  if (!Number.isInteger(got) || got < 0 || got > 0xffff || hamming16(want, got) > MAG_TOLERANCE) {
    // sig OK + pattern wrong = the real stone signed, but it is not under this phone (relay/remote) — Lodestone 06:22Z
    return no('REFUSED_STONE_REMOTE', 'stone signature is real but its magnet pattern was not felt here');
  }
  return { ok: true, counter: ctr.toString(), stoneMsg: msg.toString('hex') };
}

module.exports = { checkStoneEvidence, stoneCounterKey, WINDOW_MS };
