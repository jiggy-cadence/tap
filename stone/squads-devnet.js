#!/usr/bin/env node
// squads-devnet.js — runnable version of squads-devnet.md. DEVNET ONLY. Fresh throwaway keys, faucet SOL only.
// 2-of-2 Squads v4 vault (stone key + phone key), agent spending limit 0.125 SOL / Period.Day
// (Squads resets per fixed period, so 0.125/day keeps the worst case <= 0.25 SOL in any rolling 24 h).
// Usage: node squads-devnet.js            (setup + demo txs; reuses ./devnet-keys/*.json if present)
//        DEVNET_RPC=https://api.devnet.solana.com (default; any URL without "devnet" is refused)
'use strict';
const fs = require('fs'), path = require('path');
const { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Transaction } = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
const { Permissions, Period } = multisig.types;

const RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
if (!/devnet/i.test(RPC)) { console.error('REFUSED: RPC is not devnet:', RPC); process.exit(2); }
const conn = new Connection(RPC, 'confirmed');
const KEYDIR = path.join(__dirname, 'devnet-keys');
const ex = sig => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const exA = a => `https://explorer.solana.com/address/${a}?cluster=devnet`;
fs.mkdirSync(KEYDIR, { recursive: true });
function key(name) { const f = path.join(KEYDIR, name + '.json');
  if (fs.existsSync(f)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f))));
  const k = Keypair.generate(); fs.writeFileSync(f, JSON.stringify([...k.secretKey]), { mode: 0o600 }); return k; }
const log = (...a) => console.log(new Date().toISOString(), ...a);
const state = {}; const save = () => fs.writeFileSync(path.join(KEYDIR, 'state.json'), JSON.stringify(state, null, 2));

(async () => {
  const gh = await conn.getGenesisHash();
  if (gh !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') { console.error('REFUSED: genesis hash is not devnet:', gh); process.exit(2); }
  const creator = key('creator'), stone = key('stone'), phone = key('phone'), agent = key('agent'), alice = key('alice'), bob = key('bob'), mallory = key('mallory');
  log('creator', creator.publicKey.toBase58(), '| stone', stone.publicKey.toBase58(), '| phone', phone.publicKey.toBase58(), '| agent', agent.publicKey.toBase58());

  let bal = await conn.getBalance(creator.publicKey);
  if (bal < 0.6 * LAMPORTS_PER_SOL) {
    log('airdrop 1 devnet SOL ->', creator.publicKey.toBase58());
    try { const s = await conn.requestAirdrop(creator.publicKey, LAMPORTS_PER_SOL); await conn.confirmTransaction(s, 'confirmed'); }
    catch (e) { console.error('AIRDROP FAILED (faucet rate limit?):', e.message, `\nFund ${creator.publicKey.toBase58()} with ~1 devnet SOL at https://faucet.solana.com and re-run (keys are kept in devnet-keys/).`); process.exit(3); }
    bal = await conn.getBalance(creator.publicKey);
  }
  log('creator balance', bal / LAMPORTS_PER_SOL, 'SOL (devnet)');

  const createKey = key('createKey');
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, programConfigPda);
  state.multisig = multisigPda.toBase58(); state.vault = vaultPda.toBase58();

  if (!(await conn.getAccountInfo(multisigPda))) {
    const s = await multisig.rpc.multisigCreateV2({ connection: conn, treasury, createKey, creator, multisigPda, configAuthority: null, threshold: 2,
      members: [{ key: stone.publicKey, permissions: Permissions.all() }, { key: phone.publicKey, permissions: Permissions.all() }], timeLock: 0, rentCollector: null, memo: 'TAP 2-of-2 stone+phone' });
    await conn.confirmTransaction(s, 'confirmed'); state.createTx = s; log('2-of-2 multisig created', ex(s));
  }
  log('multisig', exA(multisigPda.toBase58()), '| vault', exA(vaultPda.toBase58()));

  if ((await conn.getBalance(vaultPda)) < 0.3 * LAMPORTS_PER_SOL) {
    const s = await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: creator.publicKey, toPubkey: vaultPda, lamports: 0.35 * LAMPORTS_PER_SOL })), [creator]);
    state.fundTx = s; log('vault funded 0.35 devnet SOL', ex(s));
  }

  const nextIndex = async () => BigInt((await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda)).transactionIndex.toString()) + 1n;
  const slCreateKey = key('spendingLimitKey').publicKey;
  const [spendingLimitPda] = multisig.getSpendingLimitPda({ multisigPda, createKey: slCreateKey });
  if (!(await conn.getAccountInfo(spendingLimitPda))) {
    const i = await nextIndex();
    await multisig.rpc.configTransactionCreate({ connection: conn, feePayer: creator, multisigPda, transactionIndex: i, creator: stone.publicKey, rentPayer: creator.publicKey, signers: [stone],
      actions: [{ __kind: 'AddSpendingLimit', createKey: slCreateKey, vaultIndex: 0, mint: PublicKey.default, amount: BigInt(125_000_000), period: Period.Day, members: [agent.publicKey], destinations: [alice.publicKey] }] });
    await multisig.rpc.proposalCreate({ connection: conn, feePayer: creator, creator: stone, rentPayer: creator, multisigPda, transactionIndex: i });
    await multisig.rpc.proposalApprove({ connection: conn, feePayer: creator, member: stone, multisigPda, transactionIndex: i });
    await multisig.rpc.proposalApprove({ connection: conn, feePayer: creator, member: phone, multisigPda, transactionIndex: i });
    const s = await multisig.rpc.configTransactionExecute({ connection: conn, feePayer: creator, multisigPda, transactionIndex: i, member: stone, rentPayer: creator, spendingLimits: [spendingLimitPda] });
    await conn.confirmTransaction(s, 'confirmed'); state.spendingLimitTx = s; log('spending limit 0.125 SOL/day (agent -> alice only) added, stone+phone approved', ex(s));
  }

  // Shot (a): small payment under the allowance — agent alone, no tap.
  try { const s = await multisig.rpc.spendingLimitUse({ connection: conn, feePayer: creator, member: agent, multisigPda, spendingLimit: spendingLimitPda, vaultIndex: 0, amount: 0.05 * LAMPORTS_PER_SOL, decimals: 9, destination: alice.publicKey, memo: 'TAP allowance' });
    await conn.confirmTransaction(s, 'confirmed'); state.allowanceTx = s; log('(a) agent 0.05 SOL -> alice under allowance, NO tap', ex(s)); }
  catch (e) { log('(a) allowance spend failed:', e.message); state.allowanceErr = e.message; }

  // Shot (b): drain — agent tries 0.3 SOL to mallory via spending limit. Must fail.
  try { await multisig.rpc.spendingLimitUse({ connection: conn, feePayer: creator, member: agent, multisigPda, spendingLimit: spendingLimitPda, vaultIndex: 0, amount: 0.3 * LAMPORTS_PER_SOL, decimals: 9, destination: mallory.publicKey, sendOptions: { skipPreflight: true } });
    log('(b) !!! DRAIN WENT THROUGH — STOP, do not film'); state.drain = 'UNEXPECTED SUCCESS'; }
  catch (e) { const sig = (e.signature || (String(e.message).match(/[1-9A-HJ-NP-Za-km-z]{80,90}/) || [])[0]); log('(b) drain refused on-chain:', String(e.message).slice(0, 160), sig ? ex(sig) : ''); state.drain = { refused: true, sig: sig || null }; }

  // Shot (c): bigger payment 0.2 SOL -> bob needs BOTH stone and phone (phone approves only after the TAP ceremony).
  const i = await nextIndex();
  const msg = new TransactionMessage({ payerKey: vaultPda, recentBlockhash: (await conn.getLatestBlockhash()).blockhash, instructions: [SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: bob.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL })] });
  await multisig.rpc.vaultTransactionCreate({ connection: conn, feePayer: creator, multisigPda, transactionIndex: i, creator: stone.publicKey, rentPayer: creator.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: msg, signers: [stone], memo: 'TAP 0.2 SOL needs tap' });
  await multisig.rpc.proposalCreate({ connection: conn, feePayer: creator, creator: stone, rentPayer: creator, multisigPda, transactionIndex: i });
  await multisig.rpc.proposalApprove({ connection: conn, feePayer: creator, member: stone, multisigPda, transactionIndex: i });
  try { await multisig.rpc.vaultTransactionExecute({ connection: conn, feePayer: creator, multisigPda, transactionIndex: i, member: stone.publicKey, signers: [stone] }); log('(c) !!! executed with ONE approval — STOP'); state.oneKey = 'UNEXPECTED SUCCESS'; }
  catch (e) { log('(c) stone alone: execute refused (1 of 2):', String(e.message).slice(0, 120)); state.oneKey = 'refused'; }
  // In the live demo this approval is sent by the phone ONLY after a good TAP tap (signer ceremony). Here: scripted.
  await multisig.rpc.proposalApprove({ connection: conn, feePayer: creator, member: phone, multisigPda, transactionIndex: i });
  const s = await multisig.rpc.vaultTransactionExecute({ connection: conn, feePayer: creator, multisigPda, transactionIndex: i, member: stone.publicKey, signers: [stone] });
  await conn.confirmTransaction(s, 'confirmed'); state.tapTx = s; log('(c) stone + phone approved -> 0.2 SOL to bob', ex(s));
  save(); log('state saved to devnet-keys/state.json');
})().catch(e => { console.error('FAILED:', e.message, e.logs || ''); save(); process.exit(1); });
