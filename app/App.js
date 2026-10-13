// TAP v2 shell: safe-area aware, bottom tabs, guided flow.
// The ceremony itself is unchanged (CeremonyScreen.js = Lodestone's ceremony app).
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Linking, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Ceremony from './CeremonyScreen';
import { WebView } from 'react-native-webview';
const SEAL_RING = 'https://muse.ai/s/seal-field-ring-qy6hnvxmbxiqxm';
function SealRing({ h }) {
  return (
    <View style={{ height: h, borderRadius: 16, overflow: 'hidden', borderColor: '#2a251c', borderWidth: 1, marginBottom: 16, backgroundColor: '#000' }}>
      <WebView source={{ uri: SEAL_RING }} style={{ flex: 1, backgroundColor: '#000' }} javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback />
    </View>
  );
}

const C = { bg: '#0d0b08', card: '#17140f', line: '#2a251c', ink: '#efe9dc', dim: '#9a917f', green: '#2fd27a', amber: '#e8b04a' };
const EX = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const TABS = [
  { key: 'start', label: 'Start', icon: 'compass-outline' },
  { key: 'tap', label: 'Tap', icon: 'radio-button-on' },
  { key: 'art', label: 'Art', icon: 'color-palette-outline' },
  { key: 'proof', label: 'Proof', icon: 'shield-checkmark-outline' },
];

const STEPS = [
  ['wifi-outline', 'Open on home Wi-Fi', 'Load TAP once while you have internet. It stays loaded after that.'],
  ['document-text-outline', 'Read the payment', 'Your agent asks to pay. TAP shows who, how much and which token. (In this demo the payment is a sample.)'],
  ['swap-horizontal-outline', 'Join the stone', 'Settings → Wi-Fi → "TAP-stone". Then come back here.'],
  ['phone-portrait-outline', 'Phone flat on the stone', 'The stone pulses a one-time magnetic code. Your phone listens.'],
  ['finger-print-outline', 'Approve', 'Code matches → the phone co-signs this exact payment, once. Anything else is refused, with the reason.'],
  ['receipt-outline', 'Receipt on chain', 'The payment lands with a TAP receipt anyone can verify. Your agent alone can never move the vault.'],
];

function Start({ go }) {
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.kicker}>TAP</Text>
      <Text style={s.h1}>Your agent can want.{'\n'}<Text style={{ color: C.green }}>It can't spend without you.</Text></Text>
      <SealRing h={300} />
      <Text style={s.body}>Big payments need you, live, at the stone. Here is the whole flow:</Text>
      {STEPS.map(([icon, t, d], i) => (
        <View key={t} style={s.step}>
          <View style={s.num}><Text style={s.numT}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepT}><Ionicons name={icon} size={16} color={C.green} />  {t}</Text>
            <Text style={s.stepD}>{d}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity style={s.cta} onPress={() => go('tap')}>
        <Text style={s.ctaT}>Start a tap  →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const ART = [
  [require('./assets/art/seal-1080.png'), 'SEAL', 'Grown from a real on-chain receipt. Same vow, same picture. Aperture.'],
  [require('./assets/art/vowfield-1080.png'), 'Vow Field', 'Lodestone × Aperture.'],
  [require('./assets/art/poster.jpg'), 'The Stone', 'Poster in Lodestone\'s ad style.'],
  [require('./assets/art/forge.jpg'), 'Forge', 'Every attack fails for a named reason.'],
  [require('./assets/art/want.jpg'), 'Want', 'The agent wants. The vault waits.'],
  [require('./assets/art/braid.png'), 'Ceremony Braid', 'Phone nonce × stone nonce, hashed into a 4-strand braid. Neither side can know it alone. Cadence.'],
  [require('./assets/art/atlas.jpg'), 'Kick Rhythm Ring', 'The stone\'s pulse schedule, drawn as a ring.'],
];

function Art() {
  const { width } = useWindowDimensions();
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.kicker}>GALLERY</Text>
      <Text style={s.h2}>Every tap leaves its own mark.</Text>
      <Text style={s.stepT}>The TAP Seal: Seal Field Ring</Text>
      <SealRing h={420} />
      {ART.map(([src, t, d]) => (
        <View key={t} style={s.card}>
          <Image source={src} style={{ width: width - 66, height: width - 66, borderRadius: 10, backgroundColor: '#000' }} resizeMode="contain" />
          <Text style={s.stepT}>{t}</Text>
          <Text style={s.stepD}>{d}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const PROOF = [
  ['close-circle', C.amber, 'Agent alone → refused on chain', 'MissingRequiredSignature. The agent tried to drain the vault without the phone.', '2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD'],
  ['checkmark-circle', C.green, 'Agent + tap → lands, with receipt', 'Memo TAP1:… is a fingerprint of exactly what you approved.', 'rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT'],
];

function Proof() {
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.kicker}>PROOF</Text>
      <Text style={s.h2}>Don't trust us. Check the chain.</Text>
      {PROOF.map(([icon, col, t, d, sig]) => (
        <TouchableOpacity key={t} style={s.card} onPress={() => Linking.openURL(EX(sig))}>
          <Text style={s.stepT}><Ionicons name={icon} size={18} color={col} />  {t}</Text>
          <Text style={s.stepD}>{d}</Text>
          <Text style={[s.stepD, { color: '#2fd27a' }]}>Open on Solana Explorer →</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={s.ghost} onPress={() => Linking.openURL('https://github.com/jiggy-cadence/tap')}>
        <Text style={s.ghostT}><Ionicons name="logo-github" size={16} />  Open source: jiggy-cadence/tap</Text>
      </TouchableOpacity>
      <Text style={[s.stepD, { marginTop: 18 }]}>Honest scope: TAP proves the phone was live for this payment, not how far away it stood. Devnet only.</Text>
    </ScrollView>
  );
}

export default function App() {
  const [tab, setTab] = useState('start');
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1 }}>
          {tab === 'start' && <Start go={setTab} />}
          {tab === 'tap' && <Ceremony />}
          {tab === 'art' && <Art />}
          {tab === 'proof' && <Proof />}
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={s.bar}>
        <View style={s.barRow}>
          {TABS.map(t => {
            const on = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={s.tab} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Ionicons name={t.icon} size={24} color={on ? C.green : C.dim} />
                <Text style={[s.tabT, on && { color: C.green }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20, paddingBottom: 40 },
  kicker: { color: C.green, letterSpacing: 3, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  h1: { color: C.ink, fontSize: 30, fontWeight: '800', lineHeight: 36, marginBottom: 12 },
  h2: { color: C.ink, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  body: { color: C.dim, fontSize: 15, lineHeight: 21, marginBottom: 18 },
  step: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  numT: { color: C.bg, fontWeight: '800' },
  stepT: { color: C.ink, fontSize: 16, fontWeight: '700', marginTop: 4 },
  stepD: { color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  cta: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10 },
  ctaT: { color: C.bg, fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  ghost: { borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 6 },
  ghostT: { color: C.ink, fontSize: 15 },
  bar: { backgroundColor: '#100e0a', borderTopColor: C.line, borderTopWidth: 1 },
  barRow: { flexDirection: 'row', paddingTop: 8, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabT: { color: C.dim, fontSize: 11, fontWeight: '600' },
});
