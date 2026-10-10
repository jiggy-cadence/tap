// TAP on-chain: "the agent can't spend without you" enforced by SOLANA, not by our code.
// SPL Token native multisig, m=2 of [agentKey, phoneKey]. The treasury token account is owned by the
// multisig, so the Token Program itself rejects any transfer lacking the phone's signature.
// The phone (vault) signs only after a stone ceremony. DEVNET ONLY. Throwaway keys.
'use strict';
const fs = require('fs'), path = require('path');
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const KEYS = path.join(__dirname, 'devnet-keys.json');
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const exA = a => `https://explorer.solana.com/address/${a}?cluster=devnet`;

(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  let k = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS)) : null;
  const load = a => web3.Keypair.fromSecretKey(Uint8Array.from(a));
  const agent = k ? load(k.agent) : web3.Keypair.generate();   // the AI's hot key (also pays fees)
  const phone = k ? load(k.phone) : web3.Keypair.generate();   // lives in the phone vault, released by a tap
  const mallory = k ? load(k.mallory) : web3.Keypair.generate();
  if (!k) fs.writeFileSync(KEYS, JSON.stringify({ agent: [...agent.secretKey], phone: [...phone.secretKey], mallory: [...mallory.secretKey] }), { mode: 0o600 });

  let bal = await conn.getBalance(agent.publicKey);
  if (bal < 0.05e9) {
    console.log('airdropping 1 devnet SOL to the agent fee-payer…');
    const sig = await conn.requestAirdrop(agent.publicKey, 1e9);
    await conn.confirmTransaction(sig, 'confirmed'); bal = await conn.getBalance(agent.publicKey);
  }
  console.log('agent', agent.publicKey.toBase58(), 'balance', bal / 1e9, 'SOL');

  // 1) 2-of-2 multisig: agent + phone
  const ms = await spl.createMultisig(conn, agent, [agent.publicKey, phone.publicKey], 2);
  console.log('MULTISIG 2-of-2 [agent, phone]:', exA(ms.toBase58()));
  // 2) a test dollar (6 decimals) and a treasury owned by the multisig
  const mint = await spl.createMint(conn, agent, agent.publicKey, null, 6);
  const treasury = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, ms, true);
  await spl.mintTo(conn, agent, mint, treasury.address, agent, 100_000_000);         // 100 tUSD
  const dest = await spl.getOrCreateAssociatedTokenAccount(conn, agent, mint, mallory.publicKey);
  console.log('treasury (owned by multisig) funded with 100 tUSD:', exA(treasury.address.toBase58()));

  // 3) ATTACK: the agent alone tries to drain the treasury
  try {
    await spl.transfer(conn, agent, treasury.address, dest.address, ms, 100_000_000, [agent]);
    console.log('✗ UNEXPECTED: agent-alone transfer succeeded'); process.exitCode = 1;
  } catch (e) {
    const msg = String(e.message || e) + ' ' + JSON.stringify(e.logs || e.transactionLogs || '');
    // only an ON-CHAIN rejection counts: a JS/client error is NOT Solana refusing (that false-pass happened once)
    if (!/custom program error|insufficient|signature|Signers|not enough|0x[0-9a-f]+/i.test(msg) || /BigInt|TypeError|is not a function/i.test(msg)) {
      console.log('✗ agent-alone failed for a NON-chain reason (not a valid refusal):', msg.slice(0, 200)); process.exitCode = 1; return;
    }
    console.log('✓ AGENT ALONE → REFUSED BY SOLANA:', msg.replace(/\s+/g, ' ').slice(0, 220));
  }
  // 4) WITH THE TAP: the phone co-signs (in the product, only after a verified ceremony)
  const sig = await spl.transfer(conn, agent, treasury.address, dest.address, ms, 5_000_000, [agent, phone]);
  console.log('✓ AGENT + PHONE (after tap) → 5 tUSD moved:', ex(sig));
  const t = await spl.getAccount(conn, treasury.address);
  console.log('treasury now', Number(t.amount) / 1e6, 'tUSD (was 100; only the tapped 5 left)');
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
