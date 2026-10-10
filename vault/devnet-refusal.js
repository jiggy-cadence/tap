// Put the agent-alone drain ON-CHAIN (skipPreflight) so the Token Program's refusal has a public tx signature.
'use strict';
const web3 = require('@solana/web3.js'), spl = require('@solana/spl-token'), k = require('./devnet-keys.json');
const [ms, treasury, dest] = process.argv.slice(2).map(a => new web3.PublicKey(a));
(async () => {
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const agent = web3.Keypair.fromSecretKey(Uint8Array.from(k.agent));
  const ix = spl.createTransferInstruction(treasury, dest, ms, 50_000_000, [agent]);   // phone signature absent
  const tx = new web3.Transaction().add(ix);
  tx.feePayer = agent.publicKey; tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash; tx.sign(agent);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const r = await conn.confirmTransaction(sig, 'confirmed');
  console.log(r.value.err ? '✓ ON-CHAIN REFUSAL' : '✗ UNEXPECTED SUCCESS', JSON.stringify(r.value.err));
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
})().catch(e => console.error('FAIL', e.message));
