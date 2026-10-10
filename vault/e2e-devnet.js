#!/usr/bin/env node
// TAP end-to-end on Solana DEVNET. One runnable path, no mocks except the stone (clearly labelled).
//
//   agent.request(spl transfer)  ->  needs_ceremony  ->  SIMULATED STONE answers the challenge
//   ->  phone.approve()  ->  vault co-signs with the phone key (held only in the vault)  ->  agent adds
//   its signature and broadcasts  ->  tx lands.  Verified with getTransaction().meta.err, not by "no throw".
//
// Also shown:  (A) the agent alone, on-chain, refused by the Token program (MissingRequiredSignature);
//              (B) an attestation for a 1 tUSD intent replayed against a 90 tUSD intent, refused by the vault;
//              (C) a guessed attestation, refused by the vault.
//
// THE STONE IS SIMULATED. The real stone firmware and phone app are maintained separately by Lodestone.
// The simulation uses the same model the unit tests use: the stone returns bits16(HMAC(K, "mag"||challenge)),
// the phone accepts Hamming distance <= 1. Nothing about the vault, the executor or the chain is simulated.
//
// Keys: devnet-keys.json (mode 600, gitignored, devnet only, throwaway). agent / phone / mallory / mintAuthority.
// The mint authority is a SEPARATE key: the agent cannot mint its way around the treasury.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token');
const { createVault } = require('./vault');
const executors = require('./executors');

const KEYS = path.join(__dirname, 'devnet-keys.json');
const OUT = path.join(__dirname, 'e2e-last-run.json');
const RPC = process.env.TAP_RPC || web3.clusterApiUrl('devnet');
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const exA = a => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const DEC = 6, UNIT = 10 ** DEC, tUSD = n => `${n / UNIT} tUSD`;
const log = (...a) => console.log(...a);
const step = s => log(`\n== ${s}`);
const links = {};

// ---------- SIMULATED STONE (labelled; see header) ----------
const STONE_K = crypto.randomBytes(32);                       // the stone's secret, never given to the vault or agent
const simulatedStoneAnswer = challenge => ({ bits: crypto.createHmac('sha256', STONE_K).update('mag' + challenge).digest().readUInt16BE(0) });
const ham = (a, b) => { let x = (a ^ b) & 0xffff, n = 0; while (x) { n += x & 1; x >>= 1; } return n; };
// the phone's verifier: it knows the stone's key from pairing and accepts <= 1 bit of magnetometer error
const verifyCeremony = (challenge, att) => !!att && Number.isInteger(att.bits) && ham(att.bits, simulatedStoneAnswer(challenge).bits) <= 1;

// confirm + fetch the on-chain result. Returns meta.err (null on success). A client "no throw" is NOT a pass.
async function landed(conn, sig, lastValidBlockHeight, blockhash) {
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  for (let i = 0; i < 20; i++) {
    const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (t) return { err: t.meta.err, logs: t.meta.logMessages || [], slot: t.slot };
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not found after confirm`);
}

(async () => {
  const conn = new web3.Connection(RPC, 'confirmed');
  // ---------- keys ----------
  const k = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS)) : {};
  const load = n => { if (!k[n]) { k[n] = [...web3.Keypair.generate().secretKey]; fs.writeFileSync(KEYS, JSON.stringify(k), { mode: 0o600 }); fs.chmodSync(KEYS, 0o600); } return web3.Keypair.fromSecretKey(Uint8Array.from(k[n])); };
  const agent = load('agent'), phone = load('phone'), mallory = load('mallory'), mintAuthority = load('mintAuthority');
  log('agent (fee payer, multisig member 1):', agent.publicKey.toBase58());
  log('phone (multisig member 2, key lives ONLY in the vault):', phone.publicKey.toBase58());
  log('mintAuthority (separate key, NOT the agent):', mintAuthority.publicKey.toBase58());
  log('mallory (recipient):', mallory.publicKey.toBase58());
  let bal = await conn.getBalance(agent.publicKey);
  if (bal < 0.1e9) { log('airdropping 1 devnet SOL to the agent...'); const s = await conn.requestAirdrop(agent.publicKey, 1e9); await conn.confirmTransaction(s, 'confirmed'); bal = await conn.getBalance(agent.publicKey); }
  log('agent balance', bal / 1e9, 'SOL');

  // ---------- setup: multisig, mint, treasury ----------
  step('SETUP  2-of-2 multisig [agent, phone], tUSD mint (authority = mintAuthority), treasury owned by the multisig');
  const multisig = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  const mint = await spl.createMint(conn, agent, mintAuthority.publicKey, null, DEC);
  const treasury = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, multisig, true);
  await spl.mintTo(conn, agent, mint, treasury.address, mintAuthority, 100 * UNIT);
  const mintInfo = await spl.getMint(conn, mint);
  assert.equal(mintInfo.mintAuthority.toBase58(), mintAuthority.publicKey.toBase58(), 'mint authority must be the separate key');
  assert.notEqual(mintInfo.mintAuthority.toBase58(), agent.publicKey.toBase58());
  const dest = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, mallory.publicKey);
  links.multisig = exA(multisig.toBase58()); links.mint = exA(mint.toBase58()); links.treasury = exA(treasury.address.toBase58());
  log('multisig  ', links.multisig); log('mint      ', links.mint, '(authority', mintAuthority.publicKey.toBase58() + ')'); log('treasury  ', links.treasury, '100 tUSD');
  const treasuryBal = async () => Number((await spl.getAccount(conn, treasury.address)).amount);
  const destBal = async () => Number((await spl.getAccount(conn, dest.address)).amount);

  // ---------- the vault: phone side. Holds the phone key. The agent gets vault.agent only. ----------
  const vault = createVault({
    secrets: { phoneSecretKey: k.phone },
    policy: {
      spl_multisig_transfer: {
        allowance: 0, knownRecipients: [],                     // every send needs a tap in this demo
        mint: mint.toBase58(), decimals: DEC, symbol: 'tUSD', multisig: multisig.toBase58(),
        treasury: treasury.address.toBase58(), agentPubkey: agent.publicKey.toBase58(), rpcUrl: RPC,
      },
      ttlMs: 60000, hardLockAfter: 10,
    },
    executors, verifyCeremony,
  });
  const agentApi = vault.agent, phoneApi = vault.phone;
  assert.equal(agentApi.approve, undefined, 'agent handle must not have approve');
  assert.ok(!JSON.stringify(agentApi).includes(String(k.phone[0]) + ',' + k.phone[1]), 'agent handle must not expose the phone key');

  // ---------- (A) agent alone, on chain ----------
  step('(A) ATTACK  agent alone signs a 50 tUSD transfer from the treasury and broadcasts it (skipPreflight so the refusal is on-chain)');
  {
    const ix = spl.createTransferCheckedInstruction(treasury.address, mint, dest.address, multisig, BigInt(50 * UNIT), DEC, [agent.publicKey]);
    const tx = new web3.Transaction().add(ix); tx.feePayer = agent.publicKey;
    const bh = await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash = bh.blockhash; tx.sign(agent);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const r = await landed(conn, sig, bh.lastValidBlockHeight, bh.blockhash);
    const errStr = JSON.stringify(r.err);
    log('meta.err =', errStr); log('log tail  :', r.logs.filter(l => /Error|failed/.test(l)).join(' | '));
    assert.ok(r.err && /MissingRequiredSignature/.test(errStr), 'expected MissingRequiredSignature, got ' + errStr);
    assert.equal(await treasuryBal(), 100 * UNIT, 'treasury must be untouched');
    links.agentAloneRefused = ex(sig);
    log('REFUSED BY SOLANA (slot', r.slot + ')', links.agentAloneRefused);
  }

  // ---------- (B)+(C) vault refusals ----------
  step('(B) ATTACK  attestation swap: stone answers a 1 tUSD intent, agent replays it against a 90 tUSD intent');
  {
    const small = await agentApi.request({ kind: 'spl_multisig_transfer', to: mallory.publicKey.toBase58(), amount: 1 * UNIT });
    const big = await agentApi.request({ kind: 'spl_multisig_transfer', to: mallory.publicKey.toBase58(), amount: 90 * UNIT });
    assert.equal(small.status, 'needs_ceremony'); assert.equal(big.status, 'needs_ceremony');
    log('human is shown for the small one:', JSON.stringify(small.show));
    const attSmall = simulatedStoneAnswer(small.challenge);          // SIMULATED STONE answers the SMALL challenge
    const swapped = await phoneApi.approve(big.intentId, attSmall);  // ...and the agent tries to spend it on the big one
    log('approve(big, attestation-for-small) ->', JSON.stringify(swapped));
    assert.equal(swapped.status, 'refused');
    step('(C) ATTACK  guessed attestation against the 1 tUSD intent');
    const guessed = await phoneApi.approve(small.intentId, { bits: (attSmall.bits + 7) & 0xffff });
    log('approve(small, guess) ->', JSON.stringify(guessed));
    assert.equal(guessed.status, 'refused');
    assert.equal(await treasuryBal(), 100 * UNIT, 'treasury must be untouched');
    log('vault status:', JSON.stringify(agentApi.status()));
  }

  // ---------- the real path ----------
  step('E2E  agent requests 5 tUSD to mallory -> needs_ceremony -> SIMULATED STONE taps -> vault co-signs -> agent broadcasts');
  {
    const before = await destBal();
    const req = await agentApi.request({ kind: 'spl_multisig_transfer', to: mallory.publicKey.toBase58(), amount: 5 * UNIT });
    assert.equal(req.status, 'needs_ceremony'); log('vault ->', req.status, '|', req.why, '| shows:', JSON.stringify(req.show));
    const att = simulatedStoneAnswer(req.challenge);                 // SIMULATED STONE
    log('SIMULATED STONE answers challenge', req.challenge.slice(0, 16) + '…', 'with bits', att.bits.toString(2).padStart(16, '0'));
    const ok = await phoneApi.approve(req.intentId, att);
    assert.equal(ok.status, 'done', 'approve failed: ' + JSON.stringify(ok));
    log('vault executed the STORED intent; phone co-signed. amount in tx =', tUSD(ok.result.amount));
    assert.equal(ok.result.amount, 5 * UNIT);
    // the agent now holds a phone-signed tx; it adds its own signature and broadcasts
    const tx = web3.Transaction.from(Buffer.from(ok.result.phoneSignedTx, 'base64'));
    const xfer = spl.decodeTransferCheckedInstruction(tx.instructions[1]);
    assert.equal(xfer.data.amount, BigInt(5 * UNIT)); assert.equal(xfer.keys.mint.pubkey.toBase58(), mint.toBase58());
    assert.equal(xfer.keys.destination.pubkey.toBase58(), dest.address.toBase58());
    tx.partialSign(agent);
    assert.ok(tx.verifySignatures(), 'both signatures must verify');
    const sig = await conn.sendRawTransaction(tx.serialize());
    const r = await landed(conn, sig, ok.result.lastValidBlockHeight, tx.recentBlockhash);
    log('meta.err =', JSON.stringify(r.err));
    assert.equal(r.err, null, 'tx failed on chain: ' + JSON.stringify(r.err) + ' ' + r.logs.join(' | '));
    const after = await destBal();
    assert.equal(after - before, 5 * UNIT, 'mallory must have received exactly 5 tUSD');
    assert.equal(await treasuryBal(), 95 * UNIT);
    links.e2eSuccess = ex(sig);
    log('LANDED (slot', r.slot + '): treasury 100 -> 95, mallory +5.', links.e2eSuccess);
    // replay: the same approval cannot run twice
    const replay = await phoneApi.approve(req.intentId, att);
    assert.equal(replay.status, 'refused'); log('replay of the used approval ->', replay.reason);
  }

  fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), rpc: RPC, agent: agent.publicKey.toBase58(), phone: phone.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(), mallory: mallory.publicKey.toBase58(), links }, null, 2));
  step('RESULT');
  for (const [n, l] of Object.entries(links)) log(n.padEnd(20), l);
  log('written', OUT);
  log('\nALL CHECKS PASSED. Stone: SIMULATED. Vault, executor, multisig, Token program: real (devnet).');
})().catch(e => { console.error('\nE2E FAILED:', e.message || e); process.exit(1); });
