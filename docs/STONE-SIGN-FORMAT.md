# STONE-SIGN-FORMAT: Stage 1 stone-attested approval (FROZEN v1)

Status (2026-10-11): **code + host tests + ESP32 compile. NOT run on hardware, NOT wired in Expo Go, no devnet run.**
Frozen by Aperture, attacked by Lodestone on the wire (06:22Z). His strikes are folded in below and marked [L].

## The signed message: exactly 150 bytes, fixed layout, no length fields
| Offset | Len | Field |
|---|---|---|
| 0 | 12 | ASCII `TAP-stone-v1` (domain tag) |
| 12 | 1 | version `0x01` (the phone enforces both the tag and this byte) [L] |
| 13 | 1 | cluster: `01` mainnet-beta, `02` devnet, `03` testnet |
| 14 | 32 | vault (Squads multisig) pubkey, i.e. the stored intent's `multisig` |
| 46 | 32 | `sha256(exact tx messageBytes)`, the same bytes the phone co-signs |
| 78 | 32 | `sha256(utf8 tapId)` (tapId = the 128-bit CSPRNG hex minted at ceremony start, C13) |
| 110 | 8 | counter, u64 **little-endian**, strictly increasing, written to NVS **before** the signature exists |
| 118 | 32 | stone Ed25519 pubkey (binds the key, so a key swap is detectable) |

Signature: Ed25519 (RFC 8032, TweetNaCl on the stone) over those 150 bytes. Ed25519 has no context parameter, so the embedded prefix is the domain separation. **Rule [L]: this stone key signs only this format.** Any other protocol that reuses the key needs its own prefix and version.

Magnet pattern: the `10101010` preamble, then 16 bits **LSB-first** of `HMAC-SHA256(K_mag, "TAP-stonemag-v1" || sha256(msg150))`. The phone accepts a Hamming distance of ≤1, the same t as today. `K_mag` is the stone's 32-byte magnet key, the existing `key <64hex>` session key; it was renamed from K_pair [L]. The pattern binds the whole 150-byte blob, not just the txid. This replaces the older `HMAC(K, txid‖nonce)` line in NEXT-FEATURE [L].

## Stone (firmware/solenoid_blink.ino + stone_sign.{h,c})
`ssign <194 hex>` = cluster(1) ‖ vault(32) ‖ txHash(32) ‖ tapIdHash(32). The stone then:
1. Refuses `TOUCH_HELD` if BOOT/GPIO0 is already down or the GPIO4 touch pad is already touched when the request arrives (so a taped-down button doesn't count) [L].
2. Prints `TOUCH` and waits up to 10 s for a BOOT press or pad touch, each debounced ~30 ms. No press → `REFUSED NO_TOUCH`.
3. Runs `stone_sign_request`: key, then cluster 1..3, then non-zero inputs, then touch, then counter+1 **persisted and read back** from NVS, then sign. On any failure no signature exists.
4. Prints `SSIG <counter> <sig 128 hex> <msg 300 hex>`. Hex comes out uppercase, so the phone lowercases it. Everything printed is public. The seed is never printed, and check.sh guards against that.
5. Pulses the pattern.

## Phone check order (expo/stone-gate.js, called by expo/cosign-adapter.js, never by agent code)
The pairing `{ stonePubkey, magKey, counterAtPairing }` is read from the phone's storage key `tap.stonePairing.v1`, **never from the caller**. Once a stone is paired, every co-sign needs it. Evidence is untrusted. Each check fails closed with a named code (plain English in `expo/reasons.js`):

| # | Check | Code |
|---|---|---|
| 0 | pairing readable / present | `CORRUPT_STONE_PAIRING` / `NO_STONE_PAIRING` |
| 1 | sig and felt field both present | `REFUSED_STONE_ABSENT` (stone lifted) |
| 2 | claimed pubkey == paired pubkey | `REFUSED_STONE_KEY_MISMATCH` |
| 3 | claimed cluster == the **phone's active cluster**. messageBytes carry no cluster, so devnet evidence would otherwise replay on mainnet [L] | `REFUSED_STONE_CLUSTER_MISMATCH` / `NO_ACTIVE_CLUSTER` |
| 4 | claimed txHash == phone's own sha256(msgBytes) | `REFUSED_STONE_WRONG_TX` |
| 5 | claimed tapIdHash == sha256(phone's own tapId) [L] | `REFUSED_STONE_TAPID_MISMATCH` |
| 6 | evidence arrived ≤60 s after the phone's "touch your stone" prompt (both timestamps stamped by the phone). The stone has no clock [L] | `REFUSED_STONE_STALE` |
| 7 | counter > max(lastSeen for **this stone pubkey**, counterAtPairing) [L] | `REFUSED_STONE_REPLAY` |
| 8 | evidence msg (if sent) is exactly 150 B and equals the phone's rebuild. The phone rebuilds the message from **its own** values, then verifies Ed25519 | `REFUSED_STONE_BAD_SIG` |
| 9 | pattern within t=1. A valid signature with the wrong pattern means the real stone signed but isn't under this phone [L] | `REFUSED_STONE_REMOTE` |
| 10 | existing cosign.js rules, then persist the used tap and the stone counter **before** releasing the phone signature | `REFUSED_PERSIST_FAILED` |

Checks 2 to 7 only produce named refusals. The security comes from #8: the signature is checked against bytes the phone built itself, so lying in any claimed field can at most change which refusal you get. Pinning cluster and vault at pairing would add nothing beyond WRONG_TX plus check 3 [L].

## Honest limits (Stage 1)
- **A fully hijacked phone is not stopped.** The phone is the verifier. Only Stage 2 (stone as a Squads member) moves the check on chain.
- **Relay is not stopped.** An accomplice holding a phone on the real stone can relay the field (C4). The pattern stops a *replayed* pattern, not a *live relayed* one. Only distance bounding (UWB) addresses that.
- **Chip key extraction (WROOM-32D) is not stopped.** The seed sits in plaintext NVS. Without flash encryption and Secure Boot V2, and ideally an S3/C3 or ATECC608, "the stone signed" means "firmware on an unhardened chip signed" (H4).
- Touch is the BOOT button **or** a capacitive pad on GPIO4 (T0), either counts. A pad proves a conductive body touched it, not which person. Ed25519 time and stack use on the stone are **UNMEASURED** (about 29 ms is a published ESP32 figure).
- With no pairing stored, the adapter keeps the pre-Stage-1 behaviour and reports `stoneAttested:false`. Deleting the pairing needs write access to phone storage, which is the hijacked-phone case above.

## Tests (where the claims are checked)
- `firmware/test/stone_sign_test.c`: FIPS SHA-256, RFC 4231 HMAC and RFC 8032 Ed25519 known answers. Also: no touch → no sig and no counter burned; persist failure → no sig; strict counter; layout offsets; weak seed refused.
- `firmware/test/stone_vectors.json`: emitted by the C host build. `run.sh` fails if the build drifts from it.
- `stone/stone-sig.test.js`: the JS verifier matches the firmware byte-for-byte (msg, sig, pubkey, magBits). It cross-checks with OpenSSL Ed25519 and compiles and re-emits the C build live.
- `expo/stone-gate.test.js`: adversarial tests (forged sig, agent key, key swap, other tx, lied labels, other tapId, devnet→mainnet replay, stale counter, bootstrap, freshness, stone lifted, remote pattern, storage failures).
