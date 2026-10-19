#!/usr/bin/env node
// vault/stone-devnet-live.js — the FIRST REAL stone-attested TAP approval on Solana DEVNET.
// The physical stone (ESP32, firmware/solenoid_blink.ino) signs on its own key after a touch; a human relays the
// serial lines by hand. This script plays the "phone" (verifies the stone signature, then co-approves the Squads
// proposal with the phone key) and the agent (opens the proposal, broadcasts, executes with a TAPSTONE1 memo).
//
//   --enroll <stonePubkeyHex> [--counter N]   record the stone's SPUB (public; N = counter at pairing, default 0)
//   --propose [--lamports N]                  real devnet Squads proposal (over the on-chain allowance), prints the
//                                             exact `ssign <194hex>` line to type into the stone's serial monitor
//   --attest "SSIG <ctr> <sig> <msg>"         negative controls first, then verify the real line, co-approve, execute
//   --controls                                offline: the three negative controls with a SOFTWARE key (no hardware)
//
// What is NOT checked here (and why): the magnet pattern (needs a phone magnetometer on the stone; this is a serial
// relay) and the 60 s phone freshness window (chat relay is slower; a 30 min window is used instead, see STALE).
// DEVNET ONLY: refuses any other RPC/genesis. Keys: devnet-keys.json (gitignored). State: stone-live-state.json
// (pubkeys, indexes, hashes, signatures: all public).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { buildStoneMsg, verifyStoneSig, sha256, MSG_LEN } = require('./stone-sig');

const STATE = path.join(__dirname, 'stone-live-state.json');
const KEYS = path.join(__dirname, 'devnet-keys.json');
const CLUSTER = 'devnet', CLUSTER_BYTE = 2;
const STALE_MS = 30 * 60 * 1000;
const ex = s => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const exA = a => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const log = (...a) => console.log(...a);
const loadState = () => fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : {};
const saveState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const hexOk = (s, n) => typeof s === 'string' && s.length === 2 * n && /^[0-9a-f]+$/.test(s);
const no = (code, reason) => ({ ok: false, code, reason });

// ---------- pure: parse the stone's line and verify it against OUR saved values ----------
// `SSIG <counter> <sig 128 hex> <msg 300 hex>` (firmware prints uppercase hex; anything after the 4th field is ignored)
function parseSsig(line) {
  const f = String(line || '').trim().split(/\s+/);
  const i = f.indexOf('SSIG');
  if (i < 0 || f.length < i + 4) return null;
  const [ctr, sig, msg] = [f[i + 1], f[i + 2].toLowerCase(), f[i + 3].toLowerCase()];
  if (!/^\d+$/.test(ctr) || !hexOk(sig, 64) || !hexOk(msg, MSG_LEN)) return null;
  return { counter: ctr, sig, msg };
}
// state.stone = { pubkey, lastCounter }, state.pending = { vaultHex, txHash, tapId, createdAt }
function checkAttestation(state, line, nowMs = Date.now()) {
  if (!state.stone || !hexOk(state.stone.pubkey, 32)) return no('NO_ENROLLED_STONE', 'run --enroll <SPUB hex> first');
  if (!state.pending) return no('NO_PENDING_PROPOSAL', 'run --propose first');
  const ev = parseSsig(line);
  if (!ev) return no('REFUSED_PARSE', 'line is not `SSIG <counter> <128 hex> <300 hex>`');
  if (nowMs - state.pending.createdAt > STALE_MS) return no('REFUSED_STONE_STALE', `proposal older than ${STALE_MS / 60000} min; --propose again`);
  const last = BigInt(state.stone.lastCounter || 0), ctr = BigInt(ev.counter);
  if (ctr <= last) return no('REFUSED_STONE_REPLAY', `stone counter ${ctr} not above last accepted ${last}`);
  const { vaultHex, txHash, tapId } = state.pending;
  const want = buildStoneMsg({ cluster: CLUSTER, vault: vaultHex, txHash, tapId, counter: ctr, stonePubkey: state.stone.pubkey }).toString('hex');
  if (ev.msg !== want) {                                  // name the first field that differs, then still fail closed
    const field = [[26, 28, 'REFUSED_STONE_CLUSTER_MISMATCH'], [28, 92, 'REFUSED_STONE_WRONG_VAULT'], [92, 156, 'REFUSED_STONE_WRONG_TX'],
      [156, 220, 'REFUSED_STONE_TAPID_MISMATCH'], [236, 300, 'REFUSED_STONE_KEY_MISMATCH']].find(([a, b]) => ev.msg.slice(a, b) !== want.slice(a, b));
    return no(field ? field[2] : 'REFUSED_STONE_MSG_MISMATCH', 'stone signed bytes that differ from what the phone rebuilt');
  }
  if (!verifyStoneSig(ev.sig, Buffer.from(want, 'hex'), state.stone.pubkey)) return no('REFUSED_STONE_BAD_SIG', 'Ed25519 signature does not verify under the enrolled stone key');
  return { ok: true, counter: ctr.toString(), sig: ev.sig, msg: want, receipt: 'TAPSTONE1:' + sha256(Buffer.from(ev.sig, 'hex')).toString('hex').slice(0, 16) };
}

// ---------- negative controls: three forgeries that must be refused, each by name ----------
// `signer` is the stone (real line) or a SOFTWARE stand-in. Returns true only if all three refused as expected.
function negativeControls(state, realLine, label) {
  const ev = parseSsig(realLine); assert(ev, 'controls need a parseable SSIG line');
  const mk = (ctr, sig, msg) => `SSIG ${ctr} ${sig} ${msg}`;
  const flip = (hex, byteIdx) => hex.slice(0, byteIdx * 2) + ((parseInt(hex.substr(byteIdx * 2, 2), 16) ^ 0x01).toString(16).padStart(2, '0')) + hex.slice(byteIdx * 2 + 2);
  const other = nacl.sign.keyPair();                       // a key that is NOT the stone
  const otherSig = Buffer.from(nacl.sign.detached(Buffer.from(ev.msg, 'hex'), other.secretKey)).toString('hex');
  const cases = [
    ['(a) tampered message (txHash byte flipped, same signature)', mk(ev.counter, ev.sig, flip(ev.msg, 50)), ['REFUSED_STONE_WRONG_TX']],
    ['(a2) tampered signature (byte flipped) over the right message', mk(ev.counter, flip(ev.sig, 3), ev.msg), ['REFUSED_STONE_BAD_SIG']],
    ['(b) signature from a different key over the right message', mk(ev.counter, otherSig, ev.msg), ['REFUSED_STONE_BAD_SIG']],
    ['(c) replayed counter (already-accepted value)', mk(String(state.stone.lastCounter || 0), ev.sig, ev.msg), ['REFUSED_STONE_REPLAY']],
  ];
  let all = true;
  log(`\n== NEGATIVE CONTROLS (${label})`);
  for (const [name, line, want] of cases) {
    const r = checkAttestation(state, line);
    const pass = !r.ok && want.includes(r.code);
    all = all && pass;
    log(`${pass ? 'refused ' : 'FAILED  '} ${name} -> ${r.ok ? 'ACCEPTED (BUG)' : r.code + ': ' + r.reason}`);
  }
  return all;
}

// ---------- devnet plumbing (same shape as e2e-squads-devnet.js) ----------
async function devnet() {
  const web3 = require('@solana/web3.js');
  const RPC = process.env.TAP_RPC || web3.clusterApiUrl('devnet');
  if (!/devnet/i.test(RPC)) { console.error('REFUSED: RPC is not devnet:', RPC); process.exit(2); }
  const conn = new web3.Connection(RPC, 'confirmed');
  if ((await conn.getGenesisHash()) !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') { console.error('REFUSED: genesis hash is not devnet'); process.exit(2); }
  const k = JSON.parse(fs.readFileSync(KEYS));
  const kp = n => { assert(k[n], `devnet-keys.json lacks ${n}; run e2e-squads-devnet.js once`); return web3.Keypair.fromSecretKey(Uint8Array.from(k[n])); };
  const agent = kp('agent'), phone = kp('phone'), mallory = kp('mallory'), alice = kp('alice');
  const { decodeSquadsErr } = require('./squads');
  async function landed(sig, lastValidBlockHeight, blockhash) {
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
    for (let i = 0; i < 20; i++) {
      const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (t) return { err: t.meta.err, name: decodeSquadsErr(t.meta.err), logs: t.meta.logMessages || [], slot: t.slot, msgBytes: Buffer.from(t.transaction.message.serialize()) };
      await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error(`tx ${sig} not found after confirm`);
  }
  async function agentSends(ixs) {
    const tx = new web3.Transaction().add(...ixs); tx.feePayer = agent.publicKey;
    const bh = await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash = bh.blockhash; tx.sign(agent);
    const sig = await conn.sendRawTransaction(tx.serialize());
    return { sig, ...(await landed(sig, bh.lastValidBlockHeight, bh.blockhash)) };
  }
  return { web3, RPC, conn, k, agent, phone, mallory, alice, landed, agentSends };
}

async function ensureMultisig(d, state) {
  const { web3, conn, agent, phone, alice, agentSends } = d;
  const multisig = require('@sqds/multisig'); const { Permissions, Period } = multisig.types;
  if (state.multisig) return state.multisig;
  log('== SETUP (once) Squads v4 multisig [agent, phone] threshold 2; vault funded 0.3 SOL; allowance agent -> alice 0.05 SOL/day');
  const createKey = web3.Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, multisig.getProgramConfigPda({})[0]);
  const links = {};
  const confirmed = async sig => { await conn.confirmTransaction(sig, 'confirmed'); return sig; };
  links.multisigCreate = ex(await confirmed(await multisig.rpc.multisigCreateV2({ connection: conn, treasury, createKey, creator: agent, multisigPda, configAuthority: null, threshold: 2,
    members: [{ key: agent.publicKey, permissions: Permissions.all() }, { key: phone.publicKey, permissions: Permissions.all() }], timeLock: 0, rentCollector: null, memo: 'TAP stone-live 2-of-2 agent+phone' })));
  links.vaultFunded = ex((await agentSends([web3.SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: vaultPda, lamports: 0.3e9 })])).sig);
  const slKey = web3.Keypair.generate().publicKey;
  const [spendingLimitPda] = multisig.getSpendingLimitPda({ multisigPda, createKey: slKey });
  const i = BigInt((await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)).transactionIndex.toString()) + 1n;
  await confirmed(await multisig.rpc.configTransactionCreate({ connection: conn, feePayer: agent, multisigPda, transactionIndex: i, creator: agent.publicKey, rentPayer: agent.publicKey, signers: [agent],
    actions: [{ __kind: 'AddSpendingLimit', createKey: slKey, vaultIndex: 0, mint: web3.PublicKey.default, amount: 50_000_000n, period: Period.Day, members: [agent.publicKey], destinations: [alice.publicKey] }] }));
  await confirmed(await multisig.rpc.proposalCreate({ connection: conn, feePayer: agent, creator: agent, rentPayer: agent, multisigPda, transactionIndex: i }));
  await confirmed(await multisig.rpc.proposalApprove({ connection: conn, feePayer: agent, member: agent, multisigPda, transactionIndex: i }));
  await confirmed(await multisig.rpc.proposalApprove({ connection: conn, feePayer: agent, member: phone, multisigPda, transactionIndex: i }));
  links.spendingLimitAdded = ex(await confirmed(await multisig.rpc.configTransactionExecute({ connection: conn, feePayer: agent, multisigPda, transactionIndex: i, member: agent, rentPayer: agent, spendingLimits: [spendingLimitPda] })));
  state.multisig = { multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), spendingLimit: spendingLimitPda.toBase58(), allowanceLamports: 50_000_000, links };
  saveState(state);
  log('multisig', exA(state.multisig.multisig)); log('vault   ', exA(state.multisig.vault));
  return state.multisig;
}

// ---------- commands ----------
async function enroll(pubHex, counter) {
  const pk = String(pubHex || '').replace(/^SPUB\s+/i, '').trim().toLowerCase();
  if (!hexOk(pk, 32)) { console.error('REFUSED: stone pubkey must be 64 hex chars (the SPUB line)'); process.exit(2); }
  const s = loadState();
  s.stone = { pubkey: pk, counterAtPairing: counter, lastCounter: counter, enrolledAt: new Date().toISOString(), cluster: CLUSTER };
  saveState(s);
  log('enrolled stone pubkey', pk, '(base58', bs58.encode(Buffer.from(pk, 'hex')) + ') counterAtPairing', counter, '->', STATE);
}

async function propose(lamports) {
  const s = loadState();
  if (!s.stone) { console.error('REFUSED: no enrolled stone; --enroll first'); process.exit(2); }
  const d = await devnet(); const { web3, conn, agent, mallory, agentSends } = d;
  const multisig = require('@sqds/multisig');
  const M = await ensureMultisig(d, s);
  const multisigPda = new web3.PublicKey(M.multisig), vaultPda = new web3.PublicKey(M.vault);
  assert(lamports > M.allowanceLamports, 'amount must be over the on-chain allowance, or no tap is needed');
  const i = BigInt((await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)).transactionIndex.toString()) + 1n;
  log(`== PROPOSE  agent opens proposal #${i}: ${lamports / 1e9} SOL vault -> mallory (over the 0.05 SOL/day allowance), approves it itself (1 of 2)`);
  const msg = new web3.TransactionMessage({ payerKey: vaultPda, recentBlockhash: (await conn.getLatestBlockhash()).blockhash,
    instructions: [web3.SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: mallory.publicKey, lamports })] });
  const r = await agentSends([
    multisig.instructions.vaultTransactionCreate({ multisigPda, transactionIndex: i, creator: agent.publicKey, rentPayer: agent.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: msg, memo: 'TAP: needs stone' }),
    multisig.instructions.proposalCreate({ multisigPda, creator: agent.publicKey, rentPayer: agent.publicKey, transactionIndex: i }),
    multisig.instructions.proposalApprove({ multisigPda, transactionIndex: i, member: agent.publicKey }),
  ]);
  assert.equal(r.err, null, 'proposal create failed: ' + r.name);
  const txHash = sha256(r.msgBytes).toString('hex');            // sha256 of the landed proposal tx's message bytes
  const tapId = crypto.randomBytes(16).toString('hex');
  const vaultHex = Buffer.from(bs58.decode(M.multisig)).toString('hex');   // "vault" field = the Squads multisig pubkey (format doc)
  const requestHex = Buffer.concat([Buffer.from([CLUSTER_BYTE]), Buffer.from(vaultHex, 'hex'), Buffer.from(txHash, 'hex'), sha256(Buffer.from(tapId, 'utf8'))]).toString('hex');
  assert.equal(requestHex.length, 194);
  const expectedCounter = String(BigInt(s.stone.lastCounter || 0) + 1n);
  s.pending = { transactionIndex: Number(i), proposalSig: r.sig, proposalLink: ex(r.sig), lamports, to: mallory.publicKey.toBase58(), vaultHex, txHash, tapId, requestHex,
    expectedCounter, expectedMsg: buildStoneMsg({ cluster: CLUSTER, vault: vaultHex, txHash, tapId, counter: expectedCounter, stonePubkey: s.stone.pubkey }).toString('hex'), createdAt: Date.now() };
  saveState(s);
  log('proposal tx', ex(r.sig));
  log(`stone message: cluster devnet | vault ${M.multisig} | txHash ${txHash.slice(0, 16)}… | tapId ${tapId} | expected counter ${expectedCounter}`);
  log('\nTYPE THIS ONE LINE INTO THE STONE SERIAL MONITOR, then touch the pad / press BOOT when it prints TOUCH:\n');
  log(`ssign ${requestHex}\n`);
  log('paste back the whole SSIG line:  node stone-devnet-live.js --attest "SSIG <ctr> <sig> <msg>"');
}

async function attest(line) {
  const s = loadState();
  if (!negativeControls(s, line, 'using the real stone line as the base')) { console.error('\nREFUSED: a negative control was accepted; not proceeding'); process.exit(3); }
  log('\n== REAL ATTEMPT  verify the stone signature');
  const v = checkAttestation(s, line);
  if (!v.ok) { console.error(`REFUSED ${v.code}: ${v.reason}`); process.exit(3); }
  log('stone signature VERIFIED under enrolled key', s.stone.pubkey.slice(0, 16) + '…', 'counter', v.counter, 'receipt', v.receipt);
  s.stone.lastCounter = v.counter; saveState(s);                 // persist the used counter BEFORE the phone signs (format doc, check 10)

  const d = await devnet(); const { web3, conn, agent, agentSends, landed } = d;
  const multisig = require('@sqds/multisig');
  const { createVault } = require('./vault'); const { squads_vault_transfer } = require('./squads');
  const P = s.pending, M = s.multisig, multisigPda = new web3.PublicKey(M.multisig);
  const token = crypto.randomBytes(16).toString('hex');       // only this process, only after the stone check above
  const vault = createVault({ secrets: { phoneSecretKey: d.k.phone },
    policy: { squads_vault_transfer: { allowance: 0, knownRecipients: [], multisig: M.multisig, vaultIndex: 0, agentPubkey: agent.publicKey.toBase58(), rpcUrl: d.RPC }, ttlMs: 120000, hardLockAfter: 10 },
    executors: { squads_vault_transfer }, verifyCeremony: (_challenge, att) => !!att && att.stoneVerified === token });
  log('== PHONE  vault reads proposal #' + P.transactionIndex + ' on chain, checks it says exactly', P.lamports / 1e9, 'SOL ->', P.to);
  const req = await vault.agent.request({ kind: 'squads_vault_transfer', to: P.to, lamports: P.lamports, transactionIndex: P.transactionIndex });
  assert.equal(req.status, 'needs_ceremony', JSON.stringify(req));
  const ok = await vault.phone.approve(req.intentId, { stoneVerified: token, stoneCounter: v.counter, stoneReceipt: v.receipt });
  assert.equal(ok.status, 'done', 'approve failed: ' + JSON.stringify(ok));
  const tx = web3.Transaction.from(Buffer.from(ok.result.phoneSignedTx, 'base64'));
  tx.partialSign(agent); assert.ok(tx.verifySignatures());
  const approveSig = await conn.sendRawTransaction(tx.serialize());
  const r1 = await landed(approveSig, ok.result.lastValidBlockHeight, tx.recentBlockhash);
  assert.equal(r1.err, null, 'phone approval failed: ' + r1.name);
  const prop = await multisig.accounts.Proposal.fromAccountAddress(conn, multisig.getProposalPda({ multisigPda, transactionIndex: BigInt(P.transactionIndex) })[0]);
  assert.equal(prop.status.__kind, 'Approved'); assert.equal(prop.approved.length, 2);
  log('phone co-approved (2 of 2)', ex(approveSig));
  log('== AGENT  executes with memo', v.receipt);
  const memoIx = new web3.TransactionInstruction({ programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from(v.receipt, 'utf8') });
  const { instruction } = await multisig.instructions.vaultTransactionExecute({ connection: conn, multisigPda, transactionIndex: BigInt(P.transactionIndex), member: agent.publicKey });
  const r2 = await agentSends([memoIx, instruction]);
  assert.equal(r2.err, null, 'execute failed: ' + r2.name + ' ' + r2.logs.join(' | '));
  s.result = { at: new Date().toISOString(), transactionIndex: P.transactionIndex, stonePubkey: s.stone.pubkey, stoneCounter: v.counter, stoneSig: v.sig, stoneMsg: v.msg, receipt: v.receipt,
    proposal: ex(P.proposalSig), phoneApproved: ex(approveSig), executed: ex(r2.sig), slot: r2.slot, magnetPatternChecked: false, note: 'stone line relayed by hand over serial; phone-side checks done by this script' };
  s.history = (s.history || []).concat([s.result]); delete s.pending; saveState(s);
  log('\nLANDED (slot ' + r2.slot + '): vault -' + P.lamports / 1e9 + ' SOL, mallory +' + P.lamports / 1e9 + '. Approval needed agent + phone, and the phone signed only after the STONE signed.');
  log('phone approval :', ex(approveSig));
  log('execute + memo :', ex(r2.sig));
  log('written', STATE);
}

// SOFTWARE stand-in for the stone (labelled): a nacl key signs the frozen format. Proves the parse/verify path
// and the controls without hardware. It is NOT a stone.
function controlsOffline() {
  const soft = nacl.sign.keyPair();                            // SOFTWARE KEY, NOT THE STONE
  const pub = Buffer.from(soft.publicKey).toString('hex');
  const state = { stone: { pubkey: pub, lastCounter: 4 }, pending: { vaultHex: crypto.randomBytes(32).toString('hex'), txHash: crypto.randomBytes(32).toString('hex'), tapId: crypto.randomBytes(16).toString('hex'), createdAt: Date.now() } };
  const P = state.pending, build = (counter, stonePubkey) => buildStoneMsg({ cluster: CLUSTER, vault: P.vaultHex, txHash: P.txHash, tapId: P.tapId, counter, stonePubkey });
  const msg = build(5, pub);
  const sig = Buffer.from(nacl.sign.detached(msg, soft.secretKey)).toString('hex');
  const line = `SSIG 5 ${sig.toUpperCase()} ${msg.toString('hex').toUpperCase()}`;   // uppercase, as the firmware prints it
  const all = negativeControls(state, line, 'SOFTWARE Ed25519 key standing in for the stone');
  const v = checkAttestation(state, line);
  log('\nsoftware-signed valid line ->', v.ok ? 'ACCEPTED counter ' + v.counter + ' receipt ' + v.receipt : 'REFUSED ' + v.code);
  const stale = checkAttestation({ ...state, pending: { ...state.pending, createdAt: Date.now() - STALE_MS - 1 } }, line);
  log('stale proposal ->', stale.code);
  const other = checkAttestation(state, `SSIG 5 ${sig} ${build(5, crypto.randomBytes(32).toString('hex')).toString('hex')}`);
  log('message naming another stone key ->', other.code);
  const okAll = all && v.ok && stale.code === 'REFUSED_STONE_STALE' && other.code === 'REFUSED_STONE_KEY_MISMATCH' && parseSsig('garbage') === null && parseSsig(line + ' PATTERN end');
  log(okAll ? '\nOFFLINE CONTROLS PASS (software key, no hardware involved)' : '\nOFFLINE CONTROLS FAILED');
  process.exit(okAll ? 0 : 1);
}

if (require.main === module) {
  const a = process.argv.slice(2), arg = f => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const run = p => p.catch(e => { console.error('\nFAILED:', e.message || e, e.logs || ''); process.exit(1); });
  if (a.includes('--enroll')) run(enroll(arg('--enroll'), Number(arg('--counter') || 0)));
  else if (a.includes('--propose')) run(propose(Number(arg('--lamports') || 100_000_000)));
  else if (a.includes('--attest')) run(attest(arg('--attest')));
  else if (a.includes('--controls')) controlsOffline();
  else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).join('\n')); process.exit(2); }
}
module.exports = { parseSsig, checkAttestation, negativeControls };
