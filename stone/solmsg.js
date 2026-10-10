// solmsg.js — sign the actual Solana message bytes, not JSON (wormhole §2).
// decodeTransfer(bytes) is the ONLY source of what the phone displays; the signer
// hashes and signs the same bytes. JSON intent becomes display-only, derived from bytes.
// Supports legacy + v0 messages with exactly ONE SystemProgram.transfer instruction
// (plus optional ComputeBudget instructions). Anything else -> throw (refuse).
'use strict';
const { VersionedMessage, SystemProgram, PublicKey } = require('@solana/web3.js');
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
function decodeTransfer(messageBytes) {
  const bytes = Uint8Array.from(messageBytes);
  let msg;
  try { msg = VersionedMessage.deserialize(bytes); } catch (e) { throw new Error('solmsg: not a Solana message (' + e.message + ')'); }
  if (msg.version !== 'legacy' && msg.addressTableLookups && msg.addressTableLookups.length)
    throw new Error('solmsg: address lookup tables not supported (accounts would be hidden from display)');
  const keys = msg.staticAccountKeys;
  const ixs = msg.compiledInstructions;
  const transfers = [];
  for (const ix of ixs) {
    const prog = keys[ix.programIdIndex];
    if (!prog) throw new Error('solmsg: bad program index');
    if (prog.toBase58() === COMPUTE_BUDGET) continue;
    if (!prog.equals(SystemProgram.programId)) throw new Error('solmsg: non-System instruction ' + prog.toBase58());
    const d = Buffer.from(ix.data);
    if (d.length !== 12 || d.readUInt32LE(0) !== 2 || ix.accountKeyIndexes.length !== 2)
      throw new Error('solmsg: System instruction is not a plain transfer');
    transfers.push({ from: keys[ix.accountKeyIndexes[0]].toBase58(), to: keys[ix.accountKeyIndexes[1]].toBase58(), lamports: d.readBigUInt64LE(4).toString() });
  }
  if (transfers.length !== 1) throw new Error('solmsg: expected exactly one transfer, got ' + transfers.length);
  // Re-serialize and require byte-exact round trip (no trailing junk / malleable encodings).
  if (Buffer.compare(Buffer.from(msg.serialize()), Buffer.from(bytes)) !== 0) throw new Error('solmsg: non-canonical message encoding');
  return { feePayer: keys[0].toBase58(), ...transfers[0], recentBlockhash: msg.recentBlockhash, version: msg.version };
}
const displayLine = d => `Send ${d.lamports} lamports (${Number(BigInt(d.lamports)) / 1e9} SOL) from ${d.from} to ${d.to}. Fee payer ${d.feePayer}.`;
module.exports = { decodeTransfer, displayLine, PublicKey };
