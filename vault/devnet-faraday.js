// FARADAY / OFFLINE SIGNING on devnet. Durable nonce whose authority is the PHONE.
//  1. The phone signs offline (cosign decodes the bytes), then we WAIT past the normal blockhash window (a walk to the cage).
//  2. TAMPER in transit: same signatures, amount changed 5 → 100. It must never land.
//  3. The honest signed tx is broadcast late and still lands (durable).
//  4. A second payment is signed; the HUMAN CANCELS it by advancing the nonce; the agent broadcasts it. It must never land.
// Verdicts come from balances and getSignatureStatuses, never from a client error.
'use strict';
const fs = require('fs'), path = require('path');
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token');
const bs58 = require('bs58').default || require('bs58');
const { makeCosigner, memoIx } = require('./cosign');
const wait = ms => new Promise(r => setTimeout(r, ms)); const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const k = JSON.parse(fs.readFileSync(path.join(__dirname, 'devnet-keys.json')));
  const load = a => web3.Keypair.fromSecretKey(Uint8Array.from(a));
  const agent = load(k.agent), phone = load(k.phone), bob = web3.Keypair.generate(), nonceKp = web3.Keypair.generate();
  const ms = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  const mint = await spl.createMint(conn, agent, agent.publicKey, null, 6);
  const tre = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, ms, true);
  await spl.mintTo(conn, agent, mint, tre.address, agent, 100_000_000);
  const bobA = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, bob.publicKey);
  // durable nonce account, AUTHORITY = PHONE
  const rent = await conn.getMinimumBalanceForRentExemption(web3.NONCE_ACCOUNT_LENGTH);
  const ntx = new web3.Transaction().add(web3.SystemProgram.createNonceAccount({ fromPubkey: agent.publicKey, noncePubkey: nonceKp.publicKey, authorizedPubkey: phone.publicKey, lamports: rent }));
  await web3.sendAndConfirmTransaction(conn, ntx, [agent, nonceKp]);
  const nonceValue = async () => (await conn.getNonce(nonceKp.publicKey, 'confirmed')).nonce;
  const cosign = makeCosigner(), bal = async () => Number((await spl.getAccount(conn, bobA.address)).amount) / 1e6;
  const intent = id => ({ feePayer: agent.publicKey.toBase58(), source: tre.address.toBase58(), mint: mint.toBase58(), destination: bobA.address.toBase58(),
    multisig: ms.toBase58(), amount: '5000000', decimals: 6, requireMemo: true, tapId: id, nonceAccount: nonceKp.publicKey.toBase58() });
  const build = (it, amount, nonce) => { const t = new web3.Transaction({ feePayer: agent.publicKey, nonceInfo: { nonce, nonceInstruction: web3.SystemProgram.nonceAdvance({ noncePubkey: nonceKp.publicKey, authorizedPubkey: phone.publicKey }) } });
    t.add(spl.createTransferCheckedInstruction(tre.address, mint, bobA.address, ms, amount, 6, [agent.publicKey, phone.publicKey]), memoIx(it)); return t; };
  const offlineSign = async (it) => { const t = build(it, 5_000_000n, await nonceValue()); const r = cosign(t.serializeMessage(), it, phone);
    if (!r.ok) throw new Error('phone refused honest: ' + r.refused); t.partialSign(agent); t.addSignature(phone.publicKey, Buffer.from(r.signature)); return t; };
  // durable-nonce txs never expire, so the right send is: rebroadcast until the chain gives a verdict (status), never trust one confirm call
const landUntil = async (raw, sig, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }); } catch {} await wait(3000); const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0]; if (st && st.confirmationStatus) return st; } return null; };
  const status = async sig => (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
  const out = {}; let bad = 0;

  // 1+2+3: sign offline, wait past the blockhash window, tamper, then honest
  const T1 = await offlineSign(intent('tap-faraday-' + Date.now()));
  console.log('1) phone signed OFFLINE with a phone-controlled durable nonce. Walking to the cage: waiting 100 s (past the ~60–90 s blockhash window)…');
  await wait(100000);
  const forged = build(intent('x'), 100_000_000n, T1.nonceInfo.nonce); forged.signatures = T1.signatures.map(s => ({ ...s }));   // same sigs, amount 5 → 100
  const fRaw = forged.serialize({ requireAllSignatures: false, verifySignatures: false });
  let fErr = 'none'; try { await conn.sendRawTransaction(fRaw, { skipPreflight: true }); } catch (e) { fErr = String(e.message).slice(0, 100); }
  await wait(6000); const fSig = bs58.encode(fRaw.subarray(1, 65)), fSt = await status(fSig), afterTamper = await bal();
  console.log(`2) TAMPER in transit (amount 5 → 100, same signatures): landed=${!!(fSt && !fSt.err)} bob=${afterTamper} ${fSt ? JSON.stringify(fSt.err) : '(no status: rejected at signature verification)'} ${fErr !== 'none' ? '| ' + fErr : ''}`);
  if (fSt && !fSt.err) bad++;
  const r1 = T1.serialize(), s1 = bs58.encode(r1.subarray(1, 65)); const st1 = await landUntil(r1, s1); const afterHonest = await bal();
  console.log(`   honest status: ${st1 ? JSON.stringify(st1.err) + ' ' + st1.confirmationStatus : 'no verdict in 60 s'}`);
  console.log(`3) HONEST broadcast 100+ s later → bob ${afterHonest} ${ex(s1)} (durable: survived the wait)`);
  if (afterHonest !== 5) bad++;

  // 4: second payment, human cancels by advancing the phone-controlled nonce, agent broadcasts anyway
  const T2 = await offlineSign(intent('tap-faraday-cancel-' + Date.now()));
  const cancel = new web3.Transaction().add(web3.SystemProgram.nonceAdvance({ noncePubkey: nonceKp.publicKey, authorizedPubkey: phone.publicKey }));
  const cs = await web3.sendAndConfirmTransaction(conn, cancel, [agent, phone]);       // agent pays the fee; only the PHONE can authorize the advance
  console.log(`4) HUMAN CANCELS: phone advanced the nonce ${ex(cs)}`);
  let cErr = 'none'; const raw2 = T2.serialize(); try { await conn.sendRawTransaction(raw2, { skipPreflight: true }); } catch (e) { cErr = String(e.message).slice(0, 100); }
  await wait(8000); const s2 = bs58.encode(raw2.subarray(1, 65)), st2 = await status(s2), afterCancel = await bal();
  console.log(`   agent broadcasts the cancelled payment anyway → landed=${!!(st2 && !st2.err)} bob=${afterCancel} ${st2 ? JSON.stringify(st2.err) : '(no status: never landed)'}`);
  if (st2 && !st2.err) bad++; if (afterCancel !== 5) bad++;
  // 5: can the AGENT cancel/advance it? (it isn't the authority)
  let agentAdv = 'none'; try { await web3.sendAndConfirmTransaction(conn, new web3.Transaction().add(web3.SystemProgram.nonceAdvance({ noncePubkey: nonceKp.publicKey, authorizedPubkey: agent.publicKey })), [agent]); agentAdv = 'ADVANCED ✗'; bad++; }
  catch (e) { agentAdv = String(e.message).replace(/\s+/g, ' ').slice(0, 120); }
  console.log(`5) the AGENT tries to advance the phone's nonce → ${agentAdv}`);
  fs.writeFileSync(path.join(__dirname, 'devnet-faraday-last-run.json'), JSON.stringify({ at: new Date().toISOString(), nonce: nonceKp.publicKey.toBase58(), honest: s1, cancel: cs, tamperLanded: !!(fSt && !fSt.err), cancelledLanded: !!(st2 && !st2.err), bob: afterCancel }, null, 2));
  console.log(bad ? `✗ ${bad} check(s) failed` : '✓ offline signing works; tampering and cancelled payments never land; only the phone controls the nonce');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
