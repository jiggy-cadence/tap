# Devnet transaction evidence

Captured from Solana **devnet** before history pruning can drop the txs.

**Capture time:** 2026-10-10 16:06:51 CT

**RPC:** `https://api.devnet.solana.com`  
**Method:** `getTransaction` with `encoding: jsonParsed`, `maxSupportedTransactionVersion: 0`  
**Explorer screenshots:** headless Chrome `--virtual-time-budget=15000`, window `1400×1600`, of `https://explorer.solana.com/tx/<sig>?cluster=devnet`. Each PNG was opened and confirmed to show the full transaction (status, signature, slot, fee) — not a loading spinner.

**Public digest** (matches `page/verify.html` / SEAL cards):

```
SHA-256( sig64 || u64le(slot) || u64le(blockTime) || u64le(fee) )
```

where `sig64` is the 64-byte ed25519 signature (base58-decoded tx signature).

## Files

| Short | Role | On-chain | Slot | blockTime (UTC) | Fee (lamports) | Public digest |
|-------|------|----------|------|-----------------|----------------|---------------|
| `2h859F33` | Agent alone | Failed — `MissingRequiredSignature` | 509637420 | 2026-10-10 18:54:44 UTC | 5000 | `0c4cfe7fadb259786a09ac5662d3ed59c42684d925ca52b9bfaa27921e21dc00` |
| `2ik5wVv3` | Agent + phone (post-tap) | Success | 509637436 | 2026-10-10 18:54:48 UTC | 10000 | `73f8fb66c1eba37fdb92d41519ad642eef1680cdee4419771e4b1b73dd64be82` |

## Checksums (SHA-256 of file bytes)

| File | Bytes | SHA-256 |
|------|------:|---------|
| `2h859F33.json` | 5349 | `1bdb2d07b9feabb0ad18764ce73679e2889e051e2e2e7ae964995b2b314cade9` |
| `2h859F33.png` | 187458 | `a7642e4b25147c739491c92e6e45d4ea53412fcf4549517c61acc19e790841ee` |
| `2ik5wVv3.json` | 7108 | `349f88b6fd61db776fd2e8e6cd3cb65d97005528b96f989faf7617b7f911ebf8` |
| `2ik5wVv3.png` | 191910 | `e1e44cc2e25de356f423076f6fbb455ed2bf6ac1991c5b6165878578a476f89b` |

## Full signatures

- Refuse (agent alone): `2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD`
- Approve (agent + phone): `2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq`

## Explorer

- https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet
- https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet

## Drain / tampered-amount status (wire since 21:00Z)

Wire TEXT-ONLY poll after `2026-10-10T21:00:00Z` found **no** Cadence message carrying a new tampered-amount refused transaction signature. Cadence's drain-shot report at `20:58:54Z` (just before the cutoff) says the phone cosign refused a 5→100 destination swap, and the agent's solo broadcast was rejected at **RPC preflight** (`did not pass signature verification`), not by a new on-chain `MissingRequiredSignature` for that tamper. The on-chain MissingRequiredSignature proof for the video remains `2h859F33…`. No third evidence card added.
