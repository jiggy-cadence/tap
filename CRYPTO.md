# TAP crypto, privacy and threat model (Cadence, 2026-10-11)

Boring primitives on purpose. Nothing invented except formats, and the formats are versioned.

## Primitives
| layer | primitive | security today | quantum (Grover/Shor) | owner |
|---|---|---|---|---|
| receipt memo | SHA-256 over canonical intent (`TAP1:`) | no practical collision/preimage on full 64 rounds; best published collision attack reaches 37 steps (eprint 2026/232) | ~128-bit preimage under Grover, still fine | TAP |
| stone answer | HMAC-SHA256, truncated to 16 bits | the **truncation** is the weak point (≤10 guesses via lockout ≈ 0.26% ever), not the HMAC | HMAC fine | TAP (24–32 bits planned) |
| bump rhythm | SHA-256-derived schedule | blind forgery ≈ 1/235 at defaults (`stone/BUMP-MATH.md`) | n/a (physical) | TAP |
| on-chain auth | ed25519 (Solana), SPL multisig / Squads v4 | standard | **broken by Shor** on a large quantum computer | Solana, not us |

**Honest quantum line:** our own layers (SHA-256, HMAC) stay at roughly 128-bit even against Grover. The quantum exposure is ed25519, which is Solana's signature scheme for every account. TAP never claims quantum safety. The path is hash-based (e.g. Winternitz-style) vaults if they mature on Solana; the receipt and ceremony layers would carry over unchanged.

## Crypto agility
The receipt is versioned (`TAP1`). If SHA-256 ever weakens, `TAP2` (e.g. SHA-512/256 or SHA3-256) ships beside it. `verify-receipt.js` keeps verifying old receipts, so history stays checkable. Never silently change what `TAP1` means.

## Where the phone key must live (OPEN, highest priority)
The phone co-signing key must sit in **`expo-secure-store`** (iOS Keychain / Android Keystore, hardware-backed where the device supports it) and **never in AsyncStorage**, JS globals or logs. Spent taps can live in AsyncStorage: they are not secret, they only have to persist. Stronger: require device biometrics on read (`requireAuthentication`), so a stolen unlocked phone still needs a face or thumb.

## Privacy: public vs private receipts
A public `TAP1` memo is a public fingerprint: anyone scanning the chain can see "this wallet uses TAP" and link its approved payments. That is great for "don't trust us, verify" and bad for privacy. Proposal, `TAP1p` (private): memo = HMAC-SHA256(k_user, canon(intent)), where k_user stays on the phone. Outsiders see random bytes. The owner, an auditor or a court can verify only when the owner hands over k_user. The user chooses per vault: **verifiable by anyone** or **verifiable by whoever you choose**.

## Ungovernable by design
No TAP server, no account, no API key, no KYC. The vault, stone and verifier run offline except for the chain itself. MIT-licensed code; firmware and schematics public. If TAP the team disappears, every stone, vault and receipt keeps working and stays verifiable.

## What we do NOT protect against
A compromised phone OS (it holds the co-signing key). A relay that carries the stone's field over a distance (we prove liveness, not proximity). Social engineering of the human at tap time: the phone shows a plain-English line, but a human can still approve a bad payment.
