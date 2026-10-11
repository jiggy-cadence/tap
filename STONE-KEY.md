# STONE-KEY — the stone as a real on-chain signer (post-Fair design, closes GAPS C1)

Status: **design only.** Nothing here has run. Today's on-chain proof is agent + phone (see SUBMISSION §2).

## Goal
A Squads v4 multisig whose payment approvals need **stone AND phone** (2-of-2 for the over-limit path), with the agent kept to the on-chain spending limit for small payments. The stone holds an Ed25519 key that never leaves the chip, and signs only after a local physical event.

## Why it is feasible on an ESP32
- Ed25519 sign ≈ **29 ms** in software on ESP32 @ 240 MHz (Oryx CycloneCRYPTO benchmark). Fine for a human tap. [V: published benchmark, not measured on our stone]
- Solana signs the raw message bytes with Ed25519, so the stone needs no Solana SDK: receive message bytes, parse, show/decide, sign 64 bytes.

## Flow
1. **Provision:** stone generates the key on-chip with `esp_fill_random()` while `bootloader_random_enable()` (or RF) is on, stores it in **encrypted NVS**, prints only the pubkey. Never typed, never committed.
2. **Enroll:** pubkey added as a Squads member with Vote permission; threshold 2 over {phone, stone}. The vault's existing "phone vote must be required" check is extended: **refuse unless both phone and stone votes are required** and no other member can reach threshold.
3. **Request:** agent builds the vault proposal; the phone parses it (existing `cosign.js` rules) and sends the *same message bytes* to the stone over USB/BLE.
4. **Stone decides locally:** re-parses the message with a minimal C decoder (one transfer, amount, recipient, Memo `TAP1:` receipt), checks it against the intent it got during the ceremony, requires a physical touch on the stone (button/cap-touch, not a serial command), then signs and returns the signature. Single-use counter in NVS, written before the signature leaves.
5. Phone + stone votes land; Squads executes.

## Hardening (in order of value)
1. **Physical-only approval.** No serial/BLE command may trigger a signature without a local touch. (DISTANCE.md finding: a USB-serial stone + phone left on it can self-approve.)
2. **Flash encryption + Secure Boot V2, release mode, UART download disabled.** Protects the key from casual flash readout and swapped firmware.
3. **Chip choice:** our board is ESP32-WROOM-**32D** (likely chip rev v1, D0WD). v1 has published voltage-glitch key extraction (CVE-2019-17391) and secure-boot bypass (CVE-2019-15894). v3 (WROOM-32E) fixed those but was broken by EMFI (CVE-2023-35818, WOOT'24) and AES side-channel (IACR 2023/090). Espressif states S2/C3/S3 and later have ROM fault-injection countermeasures (AR2023-005). **Post-Fair: move to ESP32-S3 or C3 and use the HMAC/DS peripherals for key protection.**
4. **Per-device unique key** (Espressif's own mitigation advice): one extracted stone ≠ all stones.
5. **Limits stay on-chain:** even a cloned stone + phone is capped by the Squads spending limit and time locks; the stone is defence in depth, not a vault.

## Honest claim (after this ships)
"An approval needs the phone and a physical touch on a stone whose key never leaves it. A thief with the stone and lab gear can extract the key; a remote attacker cannot."

## Minimal pre-Fair path
None that we should claim. A stone key that has never been enrolled, signed on devnet, and been verified is not a claim. Pre-Fair we only: generate a fresh demo key per run (C2), keep "agent + phone" wording, and point to this doc as the roadmap.
