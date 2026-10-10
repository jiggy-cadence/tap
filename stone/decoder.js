// decoder.js — one plain-English line for the phone. "The phone explains, the stone decides."
'use strict';
const short = a => (a && a.length > 10) ? a.slice(0, 4) + '…' + a.slice(-4) : String(a);
function decode(tx, policy, outcome) {
  const who = (policy.allowedRecipients || {})[tx.to] || ('unknown wallet ' + short(tx.to));
  const what = tx.kind === 'drain' ? `Your agent wants to send EVERYTHING (${tx.amountSol} SOL) to ${who}.`
    : `Your agent wants to send ${tx.amountSol} SOL to ${who}.`;
  const tip = tx.meta && tx.meta.tip ? ` Includes a ${tx.meta.tip} SOL tip.` : '';
  const end = { AUTO: ' Within allowance — no tap needed.', TAP: ' Needs your tap: ' + outcome.reason + '.',
    REFUSE: ' Refused: ' + outcome.reason + '.', SIGNED: ' Approved by tap and signed.',
    BLOCKED: ' Blocked: ' + outcome.reason }[outcome.verdict] || '';
  return what + tip + end;
}
module.exports = { decode };
