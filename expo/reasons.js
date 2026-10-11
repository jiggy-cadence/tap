// expo/reasons.js — every named reason code the phone/stone/sdk can show, in plain English.
// The app shows `title` big and `detail` under it. Never show a raw code alone to the user.
// reasons.test.js fails if any code emitted in stone/, sdk/, expo/ has no entry here.
'use strict';

const R = {
  SIGNED:                        ['Approved', 'Your phone signed exactly the payment you tapped for.'],
  // ceremony / store
  NO_STORED_INTENT:              ['Nothing to approve', 'There is no tapped payment on this phone. Tap the stone first.'],
  CORRUPT_STORED_INTENT:         ['Approval data damaged', 'The saved payment could not be read. Tap the stone again.'],
  BAD_INTENT:                    ['Payment incomplete', 'The payment is missing a detail (amount, recipient or account), so it was not saved.'],
  BAD_TAP:                       ['Tap not recognized', 'The tap did not carry a valid approval. Try again.'],
  REFUSED_NO_TAP:                ['No tap, no payment', 'This payment is over your limit and nobody tapped the stone for it.'],
  REFUSED_NO_TAP_ID:             ['Old approval', 'This approval was saved by an older version and cannot be used safely. Tap again.'],
  REFUSED_REPLAY:                ['Tap already used', 'Each tap approves one payment, once. Someone tried to use this tap a second time.'],
  REFUSED_AGENT_INTENT:          ['Agent tried to set the terms', 'Only what you approved on this phone counts. The agent tried to supply its own version, so it was refused.'],
  REFUSED_USER:                  ['You declined', 'You said no. Nothing was sent.'],
  REFUSED_ALREADY_PENDING:       ['Another approval is open', 'Finish or cancel the open approval first.'],
  REFUSED_EXPIRED:               ['Approval timed out', 'The tap window closed before the payment was signed. Tap again.'],
  REFUSED_CHALLENGE_MISMATCH:    ['Wrong challenge', 'The approval answered a different request than this one.'],
  REFUSED_INTENT_MISMATCH:       ['Not what you approved', 'The payment differs from the one you tapped for.'],
  REFUSED_MISSING_PAYMENT:       ['No payment found', 'The request did not contain a payment to approve.'],
  // stone presence checks
  REFUSED_MAGNET_FAILED:         ['Stone not felt', 'The phone could not read the stone\'s magnetic code. Lay the phone flat on the stone and try again.'],
  REFUSED_MAGNET_NONCE_MISMATCH: ['Wrong stone code', 'The magnetic code did not match this request. If this repeats, someone may be replaying an old tap.'],
  REFUSED_DECODE:                ['Code garbled', 'The magnetic code was damaged in transit. Hold still on the stone and retry.'],
  REFUSED_UNDECODABLE:           ['Code unreadable', 'The phone could not decode the stone\'s signal.'],
  REFUSED_BUMP_TIMING:           ['Kicks out of rhythm', 'The phone felt kicks, but not in the stone\'s rhythm. Take the case off or lay the phone flat.'],
  REFUSED_BUMP_COUNT:            ['Missed kicks', 'The phone felt the wrong number of kicks. Lay it flat on the stone and retry.'],
  REFUSED_BUMP_EXTRA:            ['Extra bumps', 'The phone felt extra bumps that were not from the stone. Keep it still.'],
  // transaction decoder (phone reads the real bytes)
  REFUSED_FEE_PAYER:             ['Unexpected payer', 'Someone other than your agent would pay the network fee.'],
  REFUSED_AMOUNT_MISMATCH:       ['Wrong amount', 'The transaction moves a different amount than you approved.'],
  REFUSED_DESTINATION_MISMATCH:  ['Wrong recipient', 'The money would go to a different address than you approved.'],
  REFUSED_SOURCE_MISMATCH:       ['Wrong account', 'The money would come out of a different account than you approved.'],
  REFUSED_MINT_MISMATCH:         ['Wrong token', 'The transaction moves a different token than you approved.'],
  REFUSED_DECIMALS_MISMATCH:     ['Wrong token units', 'The token decimals do not match, so the amount could be misread.'],
  REFUSED_MULTISIG_MISMATCH:     ['Wrong vault', 'The transaction uses a different vault than you approved.'],
  REFUSED_PHONE_NOT_SIGNER:      ['Phone not part of it', 'This phone is not a required signer on that transaction.'],
  REFUSED_MEMO_MISMATCH:         ['False receipt', 'The receipt written into the transaction does not match what you approved.'],
  REFUSED_MULTI_MEMO:            ['Extra notes attached', 'The transaction carries more than one receipt note.'],
  REFUSED_MEMO_MISSING:          ['Receipt missing', 'This payment needs a TAP receipt in the transaction, and it has none.'],
  REFUSED_IX_COUNT:              ['Hidden extra actions', 'The transaction does more than the one payment you approved.'],
  REFUSED_NOT_TOKEN_PROGRAM:     ['Unknown program', 'The payment does not go through the standard token program.'],
  REFUSED_NOT_TRANSFER_CHECKED:  ['Unsafe transfer type', 'The transfer does not name its token, so the phone will not sign it.'],
  REFUSED_VERSIONED:             ['Unsupported format', 'This transaction format can hide accounts; the phone only signs the plain format.'],
  REFUSED_NON_CANONICAL:         ['Unreadable extras', 'The transaction has bytes the phone could not read, so it will not sign them.'],
  REFUSED_NOT_CANONICAL:         ['Unreadable extras', 'The request has bytes the stone could not read, so it will not sign them.'],
  REFUSED_UNPARSEABLE:           ['Not a transaction', 'The phone could not read this as a transaction.'],
  REFUSED_PRIORITY_FEE:          ['Fee too high', 'The transaction pays an unusually large network tip. The phone refuses to sign it.'],
  REFUSED_COMPUTE_BUDGET:        ['Odd fee settings', 'The transaction has fee settings the phone does not allow.'],
  REFUSED_OTHER:                 ['Refused', 'The phone refused this transaction for a reason it does not have a plain name for yet.'],
  // app plumbing
  NO_STORE:                      ['App not set up', 'The approval store is missing. Reinstall or re-pair the app.'],
  NO_USED_STORE:                 ['App not set up', 'The app cannot record used taps, so it will not sign.'],
  CORRUPT_USED_STORE:            ['Used-tap list damaged', 'The app cannot tell which taps were already used, so it refuses everything until re-paired.'],
  REFUSED_PERSIST_FAILED:        ['Could not save', 'The app could not record this tap as used, so it did not sign.'],
  NO_PHONE_KEY:                  ['Phone key missing', 'This phone has no signing key. Pair it with the vault again.'],
  NO_CSPRNG:                     ['Phone cannot make secure randomness', 'The app cannot start a ceremony on this device.'],
};

function explain(code, rawReason) {
  const e = R[code];
  if (e) return { code, title: e[0], detail: e[1] };
  return { code, title: 'Refused', detail: 'The phone refused this for a reason without a plain name yet' + (rawReason ? ': ' + String(rawReason).slice(0, 120) : '.') };
}

module.exports = { explain, REASONS: R };
