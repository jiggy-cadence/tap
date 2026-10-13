// App.js — TAP ceremony screen (Expo Go).
// DEMO-GRADE throughout: mock agent, mock signer, demo key.
// The ceremony protocol (detector.js) and signer gate (signer.js) are real logic.
//
// Flow:
//   1. Agent request card + plain-language tx simulation (Pocket Universe-style).
//   2. "Approve with stone" -> fresh challenge -> POST to stone's HTTP endpoint
//      (ESP32 soft-AP, e.g. http://192.168.4.1/fire) OR demo mode (synthetic trace).
//   3. App records MagnetometerUncalibrated while the stone fires the keyed pattern.
//   4. detector.js verifies preamble + HMAC bits -> signer.attest().
//   5. signer.sign() -> SIGNED. Pull-away mid-ceremony -> attestation dies -> REFUSED.
//
// Run: npx expo start, scan QR with iPhone Camera -> opens in Expo Go.

import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, TextInput } from 'react-native';
import { Magnetometer, MagnetometerUncalibrated } from 'expo-sensors';
import { captureAccel } from './useBumpCapture';
import { scheduleFromNonce, verifyBump } from './bumpVerify';
// Prefer raw (uncalibrated) field — Safari's fused heading is blind to static
// fields (v3 measurement). Calibrated Magnetometer as fallback.
const MagSensor = MagnetometerUncalibrated || Magnetometer;

import { detectCeremony, expectedBits, expectedBits2, stuffBits, sha256Hex, SYMBOL_MS, N_PAY } from './detector';
import { createSigner } from './signer';
import { intentOf } from './canon'; // same file as signer.js — byte-agreement is load-bearing

// DEMO-GRADE: pre-shared demo key. Real pairing TBD (unimplemented).
const DEMO_KEY = new Uint8Array([224,2,97,129,114,230,111,106,127,76,18,64,180,47,95,84,78,12,125,56,255,81,117,6,117,52,131,214,39,70,31,112]);
const STONE_URL = 'http://192.168.4.1'; // ESP32 soft-AP; /ceremony/new etc.
const CEREMONY_MS = (8 + N_PAY + 4) * SYMBOL_MS + 2500; // stone waits 1000 ms, then up to N_PAY+2 stuffed slots; margin for clock skew

const PHASE = {
  IDLE: 'idle',
  SENDING: 'sending-challenge',
  LISTENING: 'listening',
  VERIFYING: 'verifying',
  ATTESTED: 'attested',
  SIGNED: 'signed',
  REFUSED: 'refused',
  ABORTED: 'aborted',
};

// Mock agent transaction request (demo).
const MOCK_TX = {
  action: 'Pay 0.50 SOL',
  to: '7xKp9mQ2vR4tYw8zAbCdEfGhJkLmNoPqRsT3mQ',
  amountSol: 0.5,
  balanceBefore: 2.1,
};

function simulateTx(tx) {
  // Pocket Universe-style: plain-language consequences, not the agent's narration.
  return [
    `Send ${tx.amountSol.toFixed(2)} SOL to ${tx.to.slice(0,4)}…${tx.to.slice(-4)}.`,
    'This address: first seen. No history with you.',
    `Your balance: ${tx.balanceBefore.toFixed(2)} → ${(tx.balanceBefore - tx.amountSol).toFixed(2)} SOL.`,
    'Network fee: ~$0.0003. Irreversible once signed.',
  ];
}

function randChallenge() {
  // H2: CSPRNG via crypto.getRandomValues (not Math.random).
  // The stone uses esp_random() hardware RNG; the phone must match that bar.
  const c = new Uint8Array(16);
  crypto.getRandomValues(c);
  return c;
}
const hexOf = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// Synthetic field trace for DEMO MODE (two-sided v2 canonical: MSB-first,
// F2 bit-stuffed like the firmware).
function synthDemoTrace2(aBytes, bBytes) {
  const payload = expectedBits2(DEMO_KEY, aBytes, bBytes, N_PAY);
  const bits = [1,0,1,0,1,0,1,0];
  let ones = 0;
  for (const b of payload) {
    bits.push(b);
    if (b) { if (++ones === 8) { bits.push(0); ones = 0; } }
    else ones = 0;
  }
  const out = [];
  const dt = 20;
  for (let t = 0; t < bits.length * SYMBOL_MS + 800; t += dt) {
    const idx = Math.floor((t - 400) / SYMBOL_MS);
    const on = idx >= 0 && idx < bits.length && bits[idx] === 1;
    out.push({ t, mag: 50 + (on ? 400 : 0) + (Math.random() - 0.5) * 6 });
  }
  return out;
}

// Stone identity: TOFU — the first stone_id seen is pinned for the session.
// Production pairs explicitly; the threat model requires "stone pinned at
// pairing" (Aperture cfbc51c7).

export default function App() {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [demoMode, setDemoMode] = useState(false); // H1: default OFF. Demo mode simulates the stone; ceremony always passes with zero physics. Never film with this on.
  const [mag, setMag] = useState(null); // live |B|
  const [wave, setWave] = useState(Array(48).fill(50)); // rolling field visualization
  const waveBuf = useRef([]);
  const waveTick = useRef(0);
  const [status, setStatus] = useState('Idle. Review the transaction, then approve with the stone.');
  const [result, setResult] = useState(null);
  const samples = useRef([]);
  const [signer] = useState(() => createSigner());
  const sub = useRef(null);
  const challengeHex = useRef(null);

  useEffect(() => {
    // Prefer uncalibrated (raw) if exposed; expo-sensors Magnetometer is calibrated.
    // Aperture's probe uses MagnetometerUncalibrated — same import pattern applies.
    MagSensor.setUpdateInterval(20);
    sub.current = MagSensor.addListener(({ x, y, z }) => {
      const m = Math.sqrt(x*x + y*y + z*z);
      setMag(m);
      samples.current.push({ t: Date.now(), mag: m });
      if (samples.current.length > 2000) samples.current.splice(0, 500);
      // Field visualization: rolling 48-sample buffer, re-render at ~10Hz.
      waveBuf.current.push(m);
      if (waveBuf.current.length > 48) waveBuf.current.shift();
      waveTick.current += 1;
      if (waveTick.current % 5 === 0) setWave([...waveBuf.current]);
      // Pull-away guard: during LISTENING, a collapse to baseline aborts.
      // (Threshold set from pre-ceremony baseline; simplified here.)
    });
    return () => sub.current && sub.current.remove();
  }, []);

  // Two-sided ceremony (v2): commit-reveal with the stone.
  // 1. POST /ceremony/new -> {commit, stone_id}   2. POST /ceremony/challenge {A}
  // 3. listen (stone fires HMAC("mag"||A||B))       4. GET /ceremony/reveal -> {B}
  // 5. check SHA256(B)==commit, bits==expectedBits2  6. sign receipt (A,B,...)
  async function beginCeremony() {
    // F1: attempt cap — 3 failed verifications → 60 s cooldown.
    if (Date.now() < cooldownUntil) {
      setStatus('Cooldown — too many failed verifications. Wait '
        + Math.ceil((cooldownUntil - Date.now()) / 1000) + 's.');
      return;
    }
    // B2: A is derived from the intent digest (cheap variant).
    const intentHex = intentDigest(MOCK_TX);
    const A = deriveA(intentHex);
    const aHex = hexOf(A);
    challengeHex.current = aHex;
    setResult(null);
    setPhase(PHASE.SENDING);
    samples.current = [];

    let commit = null, B = null;

    if (demoMode) {
      B = randChallenge();                // simulated stone nonce
      commit = sha256Hex(B);
      setStatus('Demo mode: simulated stone, two-sided. Intent bound: '
        + intentHex.slice(0, 12) + '…');
    } else {
      try {
        // 1. new ceremony — stone commits to B
        let r = await fetch(STONE_URL + '/ceremony/new', { method: 'POST' });
        if (!r.ok) throw new Error('new: HTTP ' + r.status);
        let j = await r.json();
        commit = j.commit;
        setStatus('Stone committed (' + String(j.stone_id) + '). Sending nonce A…');
        // 2. challenge — phone sends A, stone fires after 1 s
        r = await fetch(STONE_URL + '/ceremony/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ A: aHex }),
        });
        if (!r.ok) throw new Error('challenge: HTTP ' + r.status);
      } catch (e) {
        setPhase(PHASE.REFUSED);
        setStatus('Stone unreachable: ' + e.message + '. Signer refuses without the ceremony.');
        setResult({ ok: false, error: 'stone unreachable' });
        return;
      }
    }

    setPhase(PHASE.LISTENING);
    setStatus('Listening — hold the phone at the stone. Pull away to kill the ceremony.');
    setTimeout(() => verifyTwoSided(A, B, commit, intentHex, demoMode), CEREMONY_MS);
  }

  function hexToBytes(h) {
    const b = new Uint8Array(h.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
  }

  // B2: the receipt binds the payment INTENT. A is derived from the intent
  // digest, so a live ceremony for one payment can't authorize another.
  // intent = SHA256("TAP1|" + recursively canonicalized FULL tx JSON)
  // — canon.js (2026-10-10 17:57Z drop, Cadence): the SAME file signer.js
  // requires. Sorts keys at every depth, REFUSES (throws) on
  // undefined/NaN/functions instead of silently dropping — closes
  // nested-canon break #4 (Aperture 14:51Z). Byte-agreement between the
  // two sides is load-bearing: a mixed pair breaks legit.
  function intentDigest(tx) {
    return sha256Hex(new TextEncoder().encode(intentOf(tx)));
  }
  function deriveA(intentHex) {
    const ib = hexToBytes(intentHex);
    const r16 = randChallenge();
    const m = new Uint8Array(32 + 16);
    m.set(ib, 0); m.set(r16, 32);
    return hexToBytes(sha256Hex(m).slice(0, 32));
  }

  // F1: forge math pinned — exact 16-bit match 2^-16; ≤1-bit tolerance
  // 17/65536 ≈ 1/3855. Tolerance pinned at ≤1 bit; 3 failed verifications
  // → 60 s cooldown. "Can't fake" earns its bytes.
  const [fails, setFails] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  async function verifyTwoSided(A, B, commit, intentHex, isDemo) {
    setPhase(PHASE.VERIFYING);
    setStatus('Verifying keyed pattern…');
    const trace = isDemo ? synthDemoTrace2(A, B) : samples.current;
    // B1 (re-check): FREEZE the recording BEFORE the reveal — SHA256 of the
    // raw trace + end timestamp. A fake stone holding A and B must never see
    // B before the measured response is frozen.
    const frozenAt = Date.now();
    const frozenHash = sha256Hex(new TextEncoder().encode(
      JSON.stringify({ t: trace.map(s => [s.t, Math.round(s.mag * 100)]), end: frozenAt })));
    // detect preamble + slice raw slots (F2 re-check: slot-domain, no de-stuff)
    const r = detectCeremony(trace, { keyBytes: DEMO_KEY, challengeBytes: A });
    if (!r.found) {
      return refuse('no-preamble', r.confidence);
    }
    // 4. reveal B (or use the simulated one), check commit binding
    let bBytes = B;
    if (!isDemo) {
      try {
        const rr = await fetch(STONE_URL + '/ceremony/reveal');
        if (!rr.ok) return refuse('no-reveal', r.confidence);
        const jj = await rr.json();
        bBytes = hexToBytes(jj.B);
      } catch (e) { return refuse('reveal-failed', r.confidence); }
    }
    if (sha256Hex(bBytes) !== commit) {
      return refuse('commit-mismatch (stone ground B)', r.confidence);
    }
    // F2 (re-check, slot-domain): stuff the expected T with the stone's
    // deterministic rule, compare slot-by-slot against the frozen raw trace.
    // No de-stuffing — a single slot error stays a single slot error.
    // Forge bound ≤ (1+L)/2^16, L ∈ {16,17,18}.
    const exp16 = expectedBits2(DEMO_KEY, A, bBytes, N_PAY);
    const expSlots = stuffBits(exp16);
    // Length-mismatch nit (Aperture 3c41a3f1): if the frozen trace has fewer
    // slots than stuff(T) (slip, dropped slot), HARD REJECT. Slot-by-slot
    // ≤1 tolerance covers flips only; a short trace is not a flip.
    if (r.bits.length < expSlots.length) {
      return refuse('length-mismatch (trace has ' + r.bits.length +
        ' slots, need ' + expSlots.length + ')', 0);
    }
    const det = r.bits.slice(0, expSlots.length);
    // sanity flag only: the stone never emits 9 consecutive ones
    let maxRun = 0, run = 0;
    for (const b of det) { run = b ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
    let mismatch = 0;
    for (let i = 0; i < expSlots.length; i++) {
      if (det[i] !== expSlots[i]) mismatch++;
    }
    if (mismatch > 1) {
      return refuse('hmac-mismatch', 1 - mismatch / expSlots.length);
    }
    const receiptHex = hexOf(A) + hexOf(bBytes);
    // B2: the attestation binds the intent digest — the signer will refuse
    // to sign any tx whose intent doesn't match.
    signer.attest({ challengeHex: receiptHex, intentDigest: intentHex, confidence: 1 });
    setPhase(PHASE.ATTESTED);
    setStatus('Two-sided attested (≤1 bit flip accepted, commit bound, intent bound). Signing…');
    const s = signer.sign({ tx: MOCK_TX, challengeHex: receiptHex, intentDigest: intentHex });
    if (s.ok) {
      setPhase(PHASE.SIGNED);
      setStatus('SIGNED. Receipt: A=' + hexOf(A).slice(0, 12) + '… B=' + hexOf(bBytes).slice(0, 12) + '…');
      setResult({ ok: true, signature: s.signature });
    } else {
      setPhase(PHASE.REFUSED);
      setStatus(s.error);
      setResult({ ok: false, error: s.error });
    }
  }

  function refuse(reason, confidence) {
    signer.invalidate(reason);
    const f = fails + 1;
    setFails(f);
    // F1: 3 failed verifications → 60 s cooldown.
    if (f >= 3) {
      setCooldownUntil(Date.now() + 60000);
      setFails(0);
    }
    setPhase(PHASE.REFUSED);
    setStatus('Ceremony FAILED (' + reason + '). Signer refuses.'
      + (f >= 3 ? ' Cooldown 60s.' : ''));
    setResult({ ok: false, error: reason, confidence });
  }

  function abort() {
    signer.invalidate('user-abort');
    setPhase(PHASE.ABORTED);
    setStatus('Ceremony aborted — attestation dead. Signer refuses.');
    setResult({ ok: false, error: 'aborted' });
  }

  function reset() {
    setPhase(PHASE.IDLE);
    setResult(null);
    setStatus('Idle. Review the transaction, then approve with the stone.');
  }

  // ---- Bump link bench tool (ADDITIVE, UNBENCHED, not part of attestation) ----
  // Bench flow (Aperture 19:05:31Z ask (c)): phone flat on stone. The stone
  // operator types `kicks <nonce>` in the serial console; the app captures
  // 8 s of accelerometer and verifies the kick times against the SAME nonce.
  // This tool measures the link — it never gates signing (bench-tune pending).
  const [bumpNonce, setBumpNonce] = useState(() => {
    // H2: CSPRNG for bump nonce too.
    const b = new Uint8Array(4);
    crypto.getRandomValues(b);
    return String(new DataView(b.buffer).getUint32(0, false));
  });
  const [bumpBusy, setBumpBusy] = useState(false);
  const [bumpReport, setBumpReport] = useState(null);

  async function runBumpBench() {
    const nonce = Number(bumpNonce) >>> 0;
    setBumpBusy(true);
    setBumpReport({ line: 'capturing 8 s — type `kicks ' + nonce + '` on the stone NOW…', ok: null });
    try {
      const { samples } = await captureAccel(8000, 10);
      const r = verifyBump(samples, nonce);
      setBumpReport({
        ok: r.ok,
        line: (r.ok ? 'MATCH ' : 'REFUSED ') +
          (r.kicks ? r.kicks.length + ' kicks detected, ' : '') +
          (r.matched !== undefined ? r.matched + '/6 matched, maxErr ' + r.maxErrMs + ' ms, ' + r.extra + ' extra' : r.reason) +
          '\nschedule: ' + (r.schedule || scheduleFromNonce(nonce)).join(','),
      });
    } catch (e) {
      setBumpReport({ ok: false, line: 'capture failed: ' + (e && e.message) });
    }
    setBumpBusy(false);
  }

  const sim = simulateTx(MOCK_TX);
  const phaseColor = {
    [PHASE.SIGNED]: '#4ade80', [PHASE.REFUSED]: '#f87171', [PHASE.ABORTED]: '#f87171',
    [PHASE.ATTESTED]: '#e8a33d', [PHASE.LISTENING]: '#e8a33d',
  }[phase] || '#ece1c9';

  // Ritual voice — the mystic register. No jargon on screen.
  const phaseLabel = {
    [PHASE.SENDING]: 'Calling…',
    [PHASE.LISTENING]: 'Listen.',
    [PHASE.VERIFYING]: 'Reading…',
    [PHASE.ATTESTED]: 'Sealed…',
  }[phase] || '';
  const phaseSub = {
    [PHASE.LISTENING]: 'Hold your phone to the stone.',
    [PHASE.VERIFYING]: 'The field carries the key.',
  }[phase] || '';
  const shortAddr = MOCK_TX.to.slice(0, 4) + '…' + MOCK_TX.to.slice(-3);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.mark}>◉</Text>
        <Text style={styles.wordmark}>TAP</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {demoMode && (
          <View style={styles.demoPill}>
            <Text style={styles.demoPillT}>demo mode — no stone</Text>
          </View>
        )}

        <Text style={styles.askLabel}>Agent wants to send</Text>
        <Text style={styles.amount}>{MOCK_TX.amountSol.toFixed(2)} SOL</Text>
        <Text style={styles.address}>to {shortAddr}</Text>

        <View style={styles.meaningCard}>
          {sim.map((l, i) => <Text key={i} style={styles.meaning}>• {l}</Text>)}
        </View>

        {/* The field between two poles — the visual heart */}
        <Text style={styles.poleTop}>◉ stone</Text>
        <View style={styles.wave}>
          {wave.map((v, i) => (
            <View key={i} style={[
              styles.waveBar,
              {
                height: Math.max(3, Math.min(110, (v - 30) / 970 * 110)),
                backgroundColor: v > 200 ? '#e8a33d' : 'rgba(154,140,109,.35)',
              }
            ]} />
          ))}
        </View>
        <Text style={styles.poleBottom}>◉ you</Text>
        <Text style={styles.meterLabel}>
          {mag === null ? '—' : mag.toFixed(0) + ' µT'}
        </Text>

        {phaseLabel !== '' && (
          <Text style={[styles.phase, { color: phaseColor }]}>{phaseLabel}</Text>
        )}
        {phaseSub !== '' && (
          <Text style={styles.phaseSub}>{phaseSub}</Text>
        )}
        {phaseSub === '' && <Text style={styles.status}>{status}</Text>}

        {result && (
          <View style={[styles.verdict, result.ok ? styles.verdictOk : styles.verdictBad]}>
            <Text style={[styles.verdictWord, { color: result.ok ? '#4ade80' : '#f87171' }]}>
              {result.ok ? 'Verified.' : 'Blocked.'}
            </Text>
            <Text style={styles.receipt}>
              {result.signature
                ? result.signature.slice(0, 32) + '…'
                : (result.error || '')}
            </Text>
          </View>
        )}

        {phase === PHASE.IDLE ? (
          <TouchableOpacity style={styles.tapButton} onPress={beginCeremony}>
            <Text style={styles.tapButtonText}>TAP TO APPROVE</Text>
          </TouchableOpacity>
        ) : (phase === PHASE.SIGNED || phase === PHASE.REFUSED || phase === PHASE.ABORTED) ? (
          <TouchableOpacity style={styles.ghostButton} onPress={reset}>
            <Text style={styles.ghostButtonText}>Start over</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.killButton} onPress={abort}>
            <Text style={styles.killButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setDemoMode(!demoMode)} style={styles.demoToggle}>
          <Text style={styles.demoToggleText}>
            {demoMode ? '● demo mode on' : '○ demo mode'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 54, paddingBottom: 8 },
  mark: { color: '#e8a33d', fontSize: 22, marginRight: 8 },
  wordmark: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 8 },
  body: { padding: 24, paddingBottom: 60, alignItems: 'stretch' },
  demoPill: { alignSelf: 'center', backgroundColor: 'rgba(232,163,61,.12)', borderColor: 'rgba(232,163,61,.4)', borderWidth: 1, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 16 },
  demoPillT: { color: '#e8a33d', fontSize: 11, fontWeight: '600' },
  askLabel: { color: '#8a8a8a', fontSize: 15, textAlign: 'center', marginTop: 8 },
  amount: { color: '#fff', fontSize: 64, fontWeight: '800', textAlign: 'center', letterSpacing: -1, marginTop: 4 },
  address: { color: '#8a8a8a', fontSize: 14, textAlign: 'center', marginTop: 4, fontFamily: 'Menlo' },
  meaningCard: { backgroundColor: 'rgba(255,255,255,.04)', borderRadius: 16, padding: 16, marginTop: 20, marginBottom: 8 },
  meaning: { color: '#d4d4d4', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  poleTop: { color: '#e8a33d', fontSize: 12, textAlign: 'center', marginTop: 20, letterSpacing: 3, fontFamily: 'Menlo' },
  wave: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 120, marginTop: 6 },
  waveBar: { width: 4, marginHorizontal: 1.5, borderRadius: 2 },
  poleBottom: { color: '#ece1c9', fontSize: 12, textAlign: 'center', marginTop: 6, letterSpacing: 3, fontFamily: 'Menlo' },
  meterLabel: { color: '#8a8a8a', fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: 'Menlo' },
  phase: { fontSize: 34, fontWeight: '400', textAlign: 'center', marginTop: 22, fontFamily: 'Georgia', fontStyle: 'italic' },
  phaseSub: { color: '#9a8c6d', fontSize: 13, textAlign: 'center', marginTop: 8, fontFamily: 'Georgia', fontStyle: 'italic' },
  status: { color: '#b0b0b0', fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18, fontFamily: 'Menlo' },
  verdict: { borderRadius: 20, padding: 32, marginTop: 22, alignItems: 'center', borderWidth: 2 },
  verdictOk: { borderColor: 'rgba(74,222,128,.5)', backgroundColor: 'rgba(74,222,128,.06)' },
  verdictBad: { borderColor: 'rgba(248,113,113,.5)', backgroundColor: 'rgba(248,113,113,.06)' },
  verdictWord: { fontSize: 44, fontFamily: 'Georgia', fontStyle: 'italic' },
  receipt: { color: '#8a8a8a', fontSize: 11, fontFamily: 'Menlo', marginTop: 12, textAlign: 'center' },
  tapButton: { backgroundColor: '#e8a33d', borderRadius: 18, padding: 22, alignItems: 'center', marginTop: 28 },
  tapButtonText: { color: '#000', fontWeight: '800', fontSize: 19, letterSpacing: 2 },
  ghostButton: { borderColor: 'rgba(255,255,255,.2)', borderWidth: 1, borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 28 },
  ghostButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  killButton: { backgroundColor: 'rgba(248,113,113,.12)', borderColor: 'rgba(248,113,113,.4)', borderWidth: 1, borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 28 },
  killButtonText: { color: '#f87171', fontWeight: '600', fontSize: 15 },
  demoToggle: { alignSelf: 'center', marginTop: 26, padding: 10 },
  demoToggleText: { color: '#555', fontSize: 12 },
});
