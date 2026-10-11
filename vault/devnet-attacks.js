// Two on-chain attacks on a REAL phone-co-signed transfer (devnet). Verdicts come from chain state and
// getSignatureStatuses / getTransaction, never from a client error or a timeout (verdict-needs-named-reason).
//  A) REBROADCAST: the agent re-sends the identical signed honest tx. Does Bob get paid twice?
//  B) HOARD: the agent gets a phone signature, then sits on it until the blockhash expires, then broadcasts.
//     (Lodestone's residual: the phone doesn't check blockhash freshness.) Does a stale signature still spend?
'use strict';
const fs = require('fs'), path = require('path');
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token');
const { makeCosigner, memoIx } = require('./cosign');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const k = JSON.parse(fs.readFileSync(path.join(__dirname, 'devnet-keys.json')));
  const load = a => web3.Keypair.fromSecretKey(Uint8Array.from(a));
  const agent = load(k.agent), phone = load(k.phone), bob = web3.Keypair.generate();
  const ms = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  const mint = await spl.createMint(conn, agent, agent.publicKey, null, 6);
  const tre = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, ms, true);
  await spl.mintTo(conn, agent, mint, tre.address, agent, 100_000_000);
  const bobA = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, bob.publicKey);
  const cosign = makeCosigner();
  const intent = id => ({ feePayer: agent.publicKey.toBase58(), source: tre.address.toBase58(), mint: mint.toBase58(),
    destination: bobA.address.toBase58(), multisig: ms.toBase58(), amount: '5000000', decimals: 6, requireMemo: true, tapId: id });
  const signed = async (it) => {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');
    const tx = new web3.Transaction({ feePayer: agent.publicKey, blockhash, lastValidBlockHeight });
    tx.add(spl.createTransferCheckedInstruction(tre.address, mint, bobA.address, ms, 5_000_000n, 6, [agent.publicKey, phone.publicKey]), memoIx(it));
    const r = cosign(tx.serializeMessage(), it, phone); if (!r.ok) throw new Error('cosign refused honest: ' + r.refused);
    tx.partialSign(agent); tx.addSignature(phone.publicKey, Buffer.from(r.signature)); return { raw: tx.serialize(), lastValidBlockHeight };
  };
  const bal = async () => Number((await spl.getAccount(conn, bobA.address)).amount) / 1e6;
  const status = async sig => (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];

  // ---- A) REBROADCAST ----
  const A = await signed(intent('tap-rebroadcast-' + Date.now()));
  const s1 = await conn.sendRawTransaction(A.raw); await conn.confirmTransaction(s1, 'confirmed');
  const b1 = await bal();
  let reErr = 'none'; try { await conn.sendRawTransaction(A.raw, { skipPreflight: false }); } catch (e) { reErr = String(e.message).replace(/\s+/g, ' ').slice(0, 140); }
  await wait(8000); const b2 = await bal();
  console.log(`A) REBROADCAST  first: ${ex(s1)}  bob ${b1}`);
  console.log(`   resend → client said: ${reErr}`);
  console.log(`   chain truth: bob ${b2} (${b2 === b1 ? 'NOT paid twice ✓ (Solana dedups by signature)' : 'PAID TWICE ✗'})`);

  // ---- B) HOARD a phone signature past blockhash expiry ----
  const B = await signed(intent('tap-hoard-' + Date.now()));
  const sigB = require('bs58').default ? require('bs58').default.encode(B.raw.subarray(1, 65)) : require('bs58').encode(B.raw.subarray(1, 65));
  console.log(`B) HOARD  phone signed at lastValidBlockHeight ${B.lastValidBlockHeight}; agent waits for expiry…`);
  for (let i = 0; i < 40; i++) { const h = await conn.getBlockHeight('confirmed'); if (h > B.lastValidBlockHeight + 5) { console.log(`   block height ${h} > ${B.lastValidBlockHeight}: expired`); break; } await wait(5000); }
  const before = await bal(); let hoardErr = 'none';
  try { await conn.sendRawTransaction(B.raw, { skipPreflight: false }); } catch (e) { hoardErr = String(e.message).replace(/\s+/g, ' ').slice(0, 140); }
  await wait(8000); const after = await bal(), st = await status(sigB);
  console.log(`   broadcast stale → client said: ${hoardErr}`);
  console.log(`   chain truth: status=${st ? JSON.stringify(st.err || st.confirmationStatus) : 'none (never landed)'}; bob ${before} → ${after} (${after === before ? 'stale signature spent NOTHING ✓' : 'STALE SIGNATURE SPENT ✗'})`);
  fs.writeFileSync(path.join(__dirname, 'devnet-attacks-last-run.json'), JSON.stringify({ at: new Date().toISOString(), rebroadcast: { first: s1, bob: [b1, b2], resend: reErr }, hoard: { sig: sigB, err: hoardErr, landed: !!st, bob: [before, after] } }, null, 2));
  if (b2 !== b1 || after !== before) process.exit(1);
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
