// expo/fee-guard.js — bound the ComputeBudget priority fee before the phone co-signs.
// vault/cosign.js allows ComputeBudget instructions but does not look inside them. The fee payer is the
// agent, so an inflated price burns the AGENT's SOL, not the vault's; still, the phone should not put its
// signature on a tx that pays an absurd tip. Pure, no Expo imports, unit-tested in Node.
'use strict';
const web3 = require('@solana/web3.js');

const CB = web3.ComputeBudgetProgram.programId.toBase58();
const DEFAULT_CU_PER_IX = 200000;           // runtime default when no SetComputeUnitLimit (non-builtin ix)
const MAX_CU = 1400000;                     // runtime max per tx
const DEFAULT_MAX_PRIORITY_LAMPORTS = 100000; // 0.0001 SOL; normal devnet/mainnet tips are far below this

function checkPriorityFee(msgBytes, maxLamports = DEFAULT_MAX_PRIORITY_LAMPORTS) {
  let msg;
  try { msg = web3.Message.from(Buffer.from(msgBytes)); }
  catch (e) { return { ok: false, code: 'REFUSED_UNPARSEABLE', reason: 'unparseable message (fee guard)' }; }
  let limit = null, price = 0n, nonCb = 0;
  const seen = new Set();
  for (const ix of msg.instructions) {
    if (msg.accountKeys[ix.programIdIndex].toBase58() !== CB) { nonCb++; continue; }
    const d = Buffer.from(require('bs58').decode(ix.data));
    const tag = d[0];
    if (seen.has(tag)) return { ok: false, code: 'REFUSED_COMPUTE_BUDGET', reason: 'duplicate compute-budget instruction' };
    seen.add(tag);
    if (tag === 2 && d.length === 5) limit = d.readUInt32LE(1);
    else if (tag === 3 && d.length === 9) price = d.readBigUInt64LE(1);
    else return { ok: false, code: 'REFUSED_COMPUTE_BUDGET', reason: `compute-budget instruction ${tag} not allowed` };
  }
  const units = BigInt(Math.min(limit ?? DEFAULT_CU_PER_IX * nonCb, MAX_CU));
  const lamports = (units * price + 999999n) / 1000000n;   // micro-lamports per CU, rounded up
  if (lamports > BigInt(maxLamports)) {
    return { ok: false, code: 'REFUSED_PRIORITY_FEE', reason: `priority fee ${lamports} lamports exceeds cap ${maxLamports}`, lamports };
  }
  return { ok: true, lamports, units, microLamportsPerCU: price };
}

module.exports = { checkPriorityFee, DEFAULT_MAX_PRIORITY_LAMPORTS };
