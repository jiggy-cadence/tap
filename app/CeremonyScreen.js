// CeremonyScreen v3 — the tap draws the seal.
// The ceremony's own data (decoded bits, HMAC digest, field trace) generates
// the artwork. Each tap produces a one-of-a-kind seal. No canned animations.
//
// Flow: pick art -> approve -> seal wakes -> bits light the ring ->
// VERIFIED blooms a unique pattern from the digest / REFUSED fractures red.

import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Magnetometer, MagnetometerUncalibrated } from 'expo-sensors';
const MagSensor = MagnetometerUncalibrated || Magnetometer;

import { detectCeremony, expectedBits2, stuffBits, sha256Hex, SYMBOL_MS, N_PAY } from './detector';
import { createSigner } from './signer';
import { intentOf } from './canon';

const DEMO_KEY = new Uint8Array([224,2,97,129,114,230,111,106,127,76,18,64,180,47,95,84,78,12,125,56,255,81,117,6,117,52,131,214,39,70,31,112]);
const STONE_URL = 'http://192.168.4.1';
const CEREMONY_MS = (8 + N_PAY) * SYMBOL_MS + 1500;

const PHASE = {
  IDLE: 'idle', SENDING: 'sending-challenge', LISTENING: 'listening',
  VERIFYING: 'verifying', ATTESTED: 'attested', SIGNED: 'signed',
  REFUSED: 'refused', ABORTED: 'aborted',
};

const MOCK_TX = {
  action: 'Pay 0.50 SOL',
  to: '7xKp9mQ2vR4tYw8zAbCdEfGhJkLmNoPqRsT3mQ',
  amountSol: 0.5, balanceBefore: 2.1,
};

function simulateTx(tx) {
  return [
    `Send ${tx.amountSol.toFixed(2)} SOL to ${tx.to.slice(0,4)}…${tx.to.slice(-4)}.`,
    'This address: first seen. No history with you.',
    `Your balance: ${tx.balanceBefore.toFixed(2)} → ${(tx.balanceBefore - tx.amountSol).toFixed(2)} SOL.`,
    'Network fee: ~$0.0003. Irreversible once signed.',
  ];
}

// ---- Art pieces (tappable) ----
const ARTS = [
  [require('./assets/art/vowfield-1080.png'), 'VOW FIELD'],
  [require('./assets/art/seal-1080.png'), 'SEAL'],
  [require('./assets/art/braid.png'), 'BRAID'],
  [require('./assets/art/atlas.jpg'), 'KICK RHYTHM'],
  [require('./assets/art/forge.jpg'), 'FORGE'],
  [require('./assets/art/want.jpg'), 'WANT'],
];

// ---- Generative seal: the ceremony draws itself ----
// bits: array of N_PAY (16) — one bit per ring segment (4ed1eae).
// digestHex: hex string seeding the inner
// pattern. phase + mag drive the living state.
function TapSeal({ bits, digestHex, phase, mag }) {
  const N = N_PAY, R = 104, C = 130, BOX = 260;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const bit = bits[i];
    const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
    const rot = (a * 180 / Math.PI) + 90;
    let col = '#241f16', op = 0.5; // unlit
    if (bit === 1) { col = '#e8a33d'; op = 1; }
    else if (bit === 0) { col = '#57503f'; op = 0.9; }
    if (phase === PHASE.REFUSED) { col = bit === 1 ? '#f87171' : '#3a1a1a'; op = 1; }
    if (phase === PHASE.SIGNED || phase === PHASE.ATTESTED) { col = bit === 1 ? '#ffd98a' : '#8a6f3f'; op = 1; }
    segs.push(
      <View key={'s'+i} style={{
        position: 'absolute', left: x - 2.5, top: y - 9,
        width: 5, height: 18, borderRadius: 2.5,
        backgroundColor: col, opacity: op,
        transform: [{ rotate: rot + 'deg' }],
      }} />
    );
  }
  // Inner constellation from the digest: 12 dots, positions from byte pairs.
  const dots = [];
  const lines = [];
  if (digestHex && digestHex.length >= 48) {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const b1 = parseInt(digestHex.substr(i * 4, 2), 16);
      const b2 = parseInt(digestHex.substr(i * 4 + 2, 2), 16);
      const ang = (b1 / 255) * Math.PI * 2;
      const rad = 18 + (b2 / 255) * 62;
      const x = C + rad * Math.cos(ang), y = C + rad * Math.sin(ang);
      pts.push([x, y]);
      const lit = phase === PHASE.SIGNED || phase === PHASE.ATTESTED;
      dots.push(
        <View key={'d'+i} style={{
          position: 'absolute', left: x - 3, top: y - 3,
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: lit ? '#ffd98a' : '#8a6f3f',
          opacity: lit ? 1 : 0.55,
        }} />
      );
    }
    // Connect every 3rd dot — the "braid" the key material draws.
    const lineCol = phase === PHASE.REFUSED ? '#f87171'
      : (phase === PHASE.SIGNED || phase === PHASE.ATTESTED) ? '#e8a33d' : '#4a4132';
    for (let i = 0; i < pts.length; i += 3) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 3) % pts.length];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      lines.push(
        <View key={'l'+i} style={{
          position: 'absolute', left: x1, top: y1 - 0.75,
          width: len, height: 1.5, backgroundColor: lineCol, opacity: 0.7,
          transform: [{ rotate: ang + 'deg' }],
        }} />
      );
    }
  }
  // Center glyph by phase.
  const glyph = {
    [PHASE.IDLE]: '◉', [PHASE.SENDING]: '◉', [PHASE.LISTENING]: '◉',
    [PHASE.VERIFYING]: '◉', [PHASE.ATTESTED]: '◉', [PHASE.SIGNED]: '✓',
    [PHASE.REFUSED]: '✕', [PHASE.ABORTED]: '✕',
  }[phase] || '◉';
  const glyphCol = phase === PHASE.SIGNED || phase === PHASE.ATTESTED ? '#ffd98a'
    : phase === PHASE.REFUSED || phase === PHASE.ABORTED ? '#f87171' : '#e8a33d';
  // Breathe with the live field while listening.
  const breathe = phase === PHASE.LISTENING && mag !== null
    ? Math.min(1.12, 1 + Math.max(0, mag - 40) / 1200) : 1;
  return (
    <View style={{ width: BOX, height: BOX, transform: [{ scale: breathe }] }}>
      {segs}{lines}{dots}
      <View style={{ position: 'absolute', left: C - 26, top: C - 26, width: 52, height: 52,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: glyphCol, fontSize: 34 }}>{glyph}</Text>
      </View>
    </View>
  );
}

export default function CeremonyScreen() {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [status, setStatus] = useState('Idle. Review the transaction, then approve with the stone.');
  const [result, setResult] = useState(null);
  const [demoMode, setDemoMode] = useState(true);
  const [artIdx, setArtIdx] = useState(0);
  // Seal state: the ceremony's own data, drawn live.
  const [sealBits, setSealBits] = useState(new Array(N_PAY).fill(null));
  const [sealDigest, setSealDigest] = useState('');
  const [sealId, setSealId] = useState('');
  const [mag, setMag] = useState(null);
  const [wave, setWave] = useState(new Array(48).fill(0));
  const magRef = useRef(0);
  const waveBuf = useRef(new Array(48).fill(0));
  const samples = useRef([]);
  const signer = useRef(createSigner({ now: () => Date.now() })).current;

  // Live magnetometer -> field readout + waveform.
  useEffect(() => {
    let sub = null;
    (async () => {
      try {
        await MagSensor.setUpdateIntervalForType(
          require('expo-sensors').SensorTypes.magnetometerUncalibrated, 100);
      } catch (e) {}
      try { await MagSensor.setUpdateInterval(100); } catch (e) {}
      sub = MagSensor.addListener(d => {
        const m = Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z);
        magRef.current = m; setMag(m);
        waveBuf.current = [...waveBuf.current.slice(1), m];
      });
    })();
    const iv = setInterval(() => setWave([...waveBuf.current]), 100);
    return () => { if (sub) sub.remove(); clearInterval(iv); };
  }, []);

  function randChallenge() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return b;
  }
  function hexOf(b) {
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function hexToBytes(h) {
    const b = new Uint8Array(h.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
  }
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

  async function beginCeremony() {
    setResult(null);
    setSealBits(new Array(N_PAY).fill(null));
    setSealDigest(''); setSealId('');
    samples.current = [];
    const intentHex = intentDigest(MOCK_TX);
    const A = deriveA(intentHex);
    const B = randChallenge();
    const commit = sha256Hex(B);
    setPhase(PHASE.SENDING);
    setStatus('Challenge sent. Stone, fire when ready.');
    if (!demoMode) {
      try {
        const r = await fetch(STONE_URL + '/ceremony/new', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commit, A: hexOf(A) }),
        });
        if (!r.ok) return refuse('stone-unreachable');
      } catch (e) { return refuse('stone-unreachable'); }
      try {
        const r2 = await fetch(STONE_URL + '/ceremony/challenge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ A: hexOf(A) }),
        });
        if (!r2.ok) return refuse('challenge-rejected');
      } catch (e) { return refuse('challenge-failed'); }
    }
    // Record while the stone fires.
    const t0 = Date.now();
    const recIv = setInterval(() => {
      samples.current.push({ t: Date.now() - t0, mag: magRef.current });
    }, 50);
    setPhase(PHASE.LISTENING);
    setStatus('Listening — hold the phone at the stone. Pull away to kill the ceremony.');
    setTimeout(() => {
      clearInterval(recIv);
      // Animate the ring lighting as the pattern resolves.
      animateBits(A, B);
      verifyTwoSided(A, B, commit, intentHex, demoMode);
    }, CEREMONY_MS);
  }

  // The ring lights bit-by-bit as the keyed pattern resolves — the tap
  // drawing itself. Uses the locally-computed expected bits (no key leak:
  // the phone already holds the key).
  function animateBits(A, B) {
    const exp = expectedBits2(DEMO_KEY, A, B, N_PAY);
    let i = 0;
    const iv = setInterval(() => {
      i += 2;
      setSealBits(exp.slice(0, N_PAY).map((b, j) => j < Math.min(i, N_PAY) ? b : null));
      if (i >= N_PAY) clearInterval(iv);
    }, 90);
  }

  function synthDemoTrace2(A, B) {
    // Synthetic trace matching expectedBits2 — demo only.
    const exp = expectedBits2(DEMO_KEY, A, B, N_PAY);
    const slots = stuffBits(exp);
    const trace = [];
    let t = 0;
    for (let s = 0; s < 8; s++) { trace.push({ t, mag: 45 + (s % 2 ? 60 : -20) }); t += SYMBOL_MS; }
    for (const b of slots) { trace.push({ t, mag: 45 + (b ? 90 : -30) }); t += SYMBOL_MS; }
    return trace;
  }

  const [fails, setFails] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  async function verifyTwoSided(A, B, commit, intentHex, isDemo) {
    setPhase(PHASE.VERIFYING);
    setStatus('Verifying keyed pattern…');
    const trace = isDemo ? synthDemoTrace2(A, B) : samples.current;
    const frozenAt = Date.now();
    const frozenHash = sha256Hex(new TextEncoder().encode(
      JSON.stringify({ t: trace.map(s => [s.t, Math.round(s.mag * 100)]), end: frozenAt })));
    const r = detectCeremony(trace, { keyBytes: DEMO_KEY, challengeBytes: A });
    if (!r.found) return refuse('no-preamble', r.confidence);
    let bBytes = B;
    if (!isDemo) {
      try {
        const rr = await fetch(STONE_URL + '/ceremony/reveal');
        if (!rr.ok) return refuse('no-reveal', r.confidence);
        const jj = await rr.json();
        bBytes = hexToBytes(jj.B);
      } catch (e) { return refuse('reveal-failed', r.confidence); }
    }
    if (sha256Hex(bBytes) !== commit) return refuse('commit-mismatch (stone ground B)', r.confidence);
    const exp16 = expectedBits2(DEMO_KEY, A, bBytes, N_PAY);
    const expSlots = stuffBits(exp16);
    if (r.bits.length < expSlots.length) {
      return refuse('length-mismatch (trace has ' + r.bits.length + ' slots, need ' + expSlots.length + ')', 0);
    }
    const det = r.bits.slice(0, expSlots.length);
    let mismatch = 0;
    for (let i = 0; i < expSlots.length; i++) if (det[i] !== expSlots[i]) mismatch++;
    if (mismatch > 1) return refuse('hmac-mismatch', 1 - mismatch / expSlots.length);
    const receiptHex = hexOf(A) + hexOf(bBytes);
    // The seal's inner constellation is seeded by THIS ceremony's digest.
    // Same key, different tap, different art — mathematically.
    const digest = sha256Hex(new TextEncoder().encode(receiptHex));
    setSealDigest(digest);
    setSealId(digest.slice(0, 8).toUpperCase());
    setSealBits(exp16.slice(0, N_PAY));
    signer.attest({ challengeHex: receiptHex, intentDigest: intentHex, confidence: 1 });
    setPhase(PHASE.ATTESTED);
    setStatus('Two-sided attested (≤1 bit flip accepted, commit bound, intent bound). Signing…');
    const s = signer.sign({ tx: MOCK_TX, challengeHex: receiptHex, intentDigest: intentHex });
    if (s.ok) {
      setPhase(PHASE.SIGNED);
      setStatus('SIGNED. Seal #' + digest.slice(0, 8).toUpperCase() + ' — this art never existed before this tap.');
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
    if (f >= 3) { setCooldownUntil(Date.now() + 60000); setFails(0); }
    setPhase(PHASE.REFUSED);
    setStatus('Ceremony FAILED (' + reason + '). Signer refuses.' + (f >= 3 ? ' Cooldown 60s.' : ''));
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
    setSealBits(new Array(N_PAY).fill(null));
    setSealDigest(''); setSealId('');
    setStatus('Idle. Review the transaction, then approve with the stone.');
  }

  const sim = simulateTx(MOCK_TX);
  const waveMax = Math.max(60, ...wave);
  const waveMin = Math.min(30, ...wave);
  const phaseWord = {
    [PHASE.IDLE]: 'Idle', [PHASE.SENDING]: 'Sending', [PHASE.LISTENING]: 'Listening',
    [PHASE.VERIFYING]: 'Reading', [PHASE.ATTESTED]: 'Attested',
    [PHASE.SIGNED]: 'Verified', [PHASE.REFUSED]: 'Blocked', [PHASE.ABORTED]: 'Aborted',
  }[phase];
  const [artSrc, artName] = ARTS[artIdx];

  return (
    <ScrollView style={s.root} contentContainerStyle={s.pad}>
      {/* Art picker — tap through the pieces */}
      <Text style={s.kicker}>CANVAS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip}>
        {ARTS.map(([src, name], i) => (
          <TouchableOpacity key={name} onPress={() => setArtIdx(i)} style={s.thumbW}>
            <Image source={src} style={[s.thumb, i === artIdx && s.thumbOn]} />
            <Text style={[s.thumbT, i === artIdx && s.thumbTOn]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* The seal: art + ceremony data composited */}
      <View style={s.sealFrame}>
        <Image source={artSrc} style={s.sealArt} resizeMode="cover" />
        <View style={s.sealDim} />
        <View style={s.sealOver}>
          <TapSeal bits={sealBits} digestHex={sealDigest} phase={phase} mag={mag} />
        </View>
        {sealId !== '' && (
          <Text style={s.sealId}>SEAL #{sealId}</Text>
        )}
      </View>

      {/* Field readout */}
      <Text style={s.field}>{mag === null ? '—' : mag.toFixed(1)} µT</Text>
      <View style={s.wave}>
        {wave.map((v, i) => {
          const h = 4 + ((v - waveMin) / Math.max(1, waveMax - waveMin)) * 56;
          const hot = phase === PHASE.LISTENING || phase === PHASE.VERIFYING;
          return <View key={i} style={[s.bar, { height: h,
            backgroundColor: hot ? '#e8a33d' : '#57503f' }]} />;
        })}
      </View>

      {/* Phase + status */}
      <Text style={s.phase}>{phaseWord}</Text>
      <Text style={s.status}>{status}</Text>

      {/* Transaction */}
      <View style={s.tx}>
        <Text style={s.txA}>{MOCK_TX.action}</Text>
        {sim.map((l, i) => <Text key={i} style={s.txL}>· {l}</Text>)}
      </View>

      {/* Action */}
      {phase === PHASE.IDLE || phase === PHASE.SIGNED || phase === PHASE.REFUSED || phase === PHASE.ABORTED ? (
        <TouchableOpacity style={s.btn} onPress={phase === PHASE.IDLE ? beginCeremony : reset}>
          <Text style={s.btnT}>{phase === PHASE.IDLE ? 'TAP TO APPROVE' : 'AGAIN'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[s.btn, s.btnKill]} onPress={abort}>
          <Text style={s.btnT}>PULL AWAY</Text>
        </TouchableOpacity>
      )}
      {result && result.ok && (
        <Text style={s.sig}>sig {String(result.signature).slice(0, 20)}…</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0908' },
  pad: { padding: 16, paddingBottom: 48 },
  kicker: { color: '#8a6f3f', fontSize: 11, fontWeight: '800', letterSpacing: 4, marginBottom: 10 },
  strip: { marginBottom: 14, marginHorizontal: -16, paddingHorizontal: 16 },
  thumbW: { marginRight: 12, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 8, opacity: 0.45, borderWidth: 1, borderColor: '#241f16' },
  thumbOn: { opacity: 1, borderColor: '#e8a33d' },
  thumbT: { color: '#57503f', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  thumbTOn: { color: '#e8a33d' },
  sealFrame: { position: 'relative', height: 340, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#000', borderWidth: 1, borderColor: '#241f16', marginBottom: 12 },
  sealArt: { position: 'absolute', width: '100%', height: '100%', opacity: 0.55 },
  sealDim: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(10,9,8,0.35)' },
  sealOver: { position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  sealId: { position: 'absolute', bottom: 10, width: '100%', textAlign: 'center',
    color: '#ffd98a', fontFamily: 'Menlo', fontSize: 12, letterSpacing: 3 },
  field: { color: '#e8a33d', fontFamily: 'Menlo', fontSize: 22, textAlign: 'center', marginBottom: 6 },
  wave: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
    height: 64, gap: 2, marginBottom: 14 },
  bar: { width: 4, borderRadius: 2 },
  phase: { color: '#ece1c9', fontSize: 30, fontWeight: '900', textAlign: 'center',
    letterSpacing: -0.5, marginBottom: 4 },
  status: { color: '#9a917f', fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15,
    textAlign: 'center', lineHeight: 21, marginBottom: 14, paddingHorizontal: 12 },
  tx: { backgroundColor: '#12100c', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#241f16' },
  txA: { color: '#ece1c9', fontSize: 19, fontWeight: '800', marginBottom: 8 },
  txL: { color: '#9a917f', fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },
  btn: { backgroundColor: '#e8a33d', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnKill: { backgroundColor: '#3a1a1a' },
  btnT: { color: '#0a0908', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  sig: { color: '#57503f', fontFamily: 'Menlo', fontSize: 11, textAlign: 'center', marginTop: 10 },
});
