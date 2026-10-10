// THE DRAIN SHOT (devnet). The phone approved "5 tUSD to Bob". A compromised agent builds a tx for
// 100 tUSD to Mallory and asks the phone to co-sign. cosign() decodes the real message bytes → REFUSED,
// and without the phone's signature Solana's 2-of-2 multisig also rejects the agent-alone broadcast.
// Then the honest 5 tUSD tx is co-signed and lands. The stored intent never crosses the agent boundary.
'use strict';
const fs = require('fs'), path = require('path');
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const { cosign, memoIx, tapMemo } = require('./cosign');
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const k = JSON.parse(fs.readFileSync(path.join(__dirname, 'devnet-keys.json')));
  const load = a => web3.Keypair.fromSecretKey(Uint8Array.from(a));
  const agent = load(k.agent), phone = load(k.phone), mallory = load(k.mallory), bob = web3.Keypair.generate();

  const ms = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  const mint = await spl.createMint(conn, agent, agent.publicKey, null, 6);
  const treasury = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, ms, true);
  await spl.mintTo(conn, agent, mint, treasury.address, agent, 100_000_000);
  const bobAta = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, bob.publicKey);
  const malAta = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, mallory.publicKey);
  console.log('multisig 2-of-2', ms.toBase58(), '| treasury 100 tUSD');

  // What the human tapped. Lives on the phone; the agent never supplies it.
  const storedIntent = { feePayer: agent.publicKey.toBase58(), source: treasury.address.toBase58(), mint: mint.toBase58(),
    destination: bobAta.address.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6, requireMemo: true };

  const build = async (dest, amount, memo) => {
    const tx = new web3.Transaction({ feePayer: agent.publicKey, ...(await conn.getLatestBlockhash()) });
    tx.add(spl.createTransferCheckedInstruction(treasury.address, mint, dest, ms, amount, 6, [agent.publicKey, phone.publicKey]));
    if (memo) tx.add(memo);
    return tx;
  };
  const broadcast = async (tx, phoneSig) => {
    tx.partialSign(agent);
    if (phoneSig) tx.addSignature(phone.publicKey, Buffer.from(phoneSig));
    return conn.sendRawTransaction(tx.serialize({ requireAllSignatures: false }));
  };

  // 1) ATTACK: agent asks phone to sign 100 tUSD → Mallory.
  const evil = await build(malAta.address, 100_000_000n, memoIx(storedIntent)); // agent even copies the honest receipt
  const r1 = cosign(evil.serializeMessage(), storedIntent, phone);
  if (r1.ok) { console.log('✗ PHONE SIGNED THE DRAIN'); process.exit(1); }
  console.log('✓ PHONE REFUSED drain:', r1.refused);
  // 2) agent broadcasts anyway without the phone → chain must reject (decode the error, don't assume).
  try {
    const s = await broadcast(evil, null); await conn.confirmTransaction(s, 'confirmed');
    console.log('✗ CHAIN ACCEPTED agent-alone drain', ex(s)); process.exit(1);
  } catch (e) {
    const m = String(e.message || e) + JSON.stringify(e.logs || '');
    if (!/signature|MissingRequiredSignature|0x/i.test(m) || /TypeError|is not a function/.test(m)) { console.log('✗ failed for non-chain reason:', m.slice(0, 200)); process.exit(1); }
    console.log('✓ SOLANA REJECTED agent-alone drain:', m.replace(/\s+/g, ' ').slice(0, 160));
  }
  // 3) HONEST: the tapped 5 tUSD → Bob. Phone verifies bytes, co-signs, lands.
  const good = await build(bobAta.address, 5_000_000n, memoIx(storedIntent));
  const r2 = cosign(good.serializeMessage(), storedIntent, phone);
  if (!r2.ok) { console.log('✗ phone refused honest tx:', r2.refused); process.exit(1); }
  const sig = await broadcast(good, r2.signature); await conn.confirmTransaction(sig, 'confirmed');
  const onchain = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  const memoLog = (onchain.meta.logMessages || []).find(l => l.includes('TAP1:')) || '';
  if (!memoLog.includes(tapMemo(storedIntent))) { console.log('✗ receipt memo not found on chain'); process.exit(1); }
  console.log('✓ TAP RECEIPT ON CHAIN:', tapMemo(storedIntent));
  const t = await spl.getAccount(conn, treasury.address), b = await spl.getAccount(conn, bobAta.address), mm = await spl.getAccount(conn, malAta.address);
  console.log('✓ HONEST 5 tUSD LANDED:', ex(sig));
  console.log(`treasury ${Number(t.amount) / 1e6} | bob ${Number(b.amount) / 1e6} | mallory ${Number(mm.amount) / 1e6}`);
  if (Number(t.amount) !== 95e6 || Number(mm.amount) !== 0) { console.log('✗ balances wrong'); process.exit(1); }
  fs.writeFileSync(path.join(__dirname, 'drain-shot-last-run.json'), JSON.stringify({ at: new Date().toISOString(), multisig: ms.toBase58(), refused: r1.refused, honestTx: sig, receipt: tapMemo(storedIntent), treasury: 95, mallory: 0 }, null, 2));
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
