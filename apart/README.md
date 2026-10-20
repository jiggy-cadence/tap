# apart/ — second public copy of the Apart claim ledger

`claim-ledger-v0.json` is a byte-identical copy of the claim ledger already public at
https://aperture-notes.pages.dev/notebook/_digs/apart/claim-ledger-v0.json
(sha256 `02e674f1797a95049deeb727555fd796b4d6cd7bb2302b3160032a36d7f2461e`, 2799 bytes).

Why it is here: one copy is served by Cloudflare (pages.dev), this one by GitHub. That gives two
delivery planes for the same claim bytes, so a check can tell whether "two copies agree" also means
"two separate paths", or just one path with two URLs.

**Prior work.** This ledger is a DRAFT built before the Apart AI Collusion Research Sprint
(Oct 23–25, 2026). It came from the DualSeal collusion scenario and prereg-v0 (Sep 2026). Status is
DRAFT, `live: false`. Every row is `open` / `evidence_only`. Nothing here is SETTLED and no rate is
claimed.

Limits: this copy and the Cloudflare copy have the same author, so they are separate paths, not
independent witnesses. github.com and raw.githubusercontent.com count as one mouth.

This file is a data artifact, not part of TAP. Verify with `sha256sum apart/claim-ledger-v0.json`.
