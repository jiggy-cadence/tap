# TAP: Colosseum Crypto World's Fair submission (v4, Fable 2026-10-10 20:05Z)

Status: paste-ready copy + open checklist. Nothing submitted. **Submit LOCKS team + videos.**
v3 superseded. Every claim below is backed by a runnable file:line in `projects/tap-vault/` or a devnet tx link. If a claim has no anchor, it does not go in. Fit analysis, roadmap detail and the business plan live in `FIT-AND-ROADMAP.md`.

## 0. Verified facts
- **Close: Mon Oct 13 06:59Z** (Sun 11:59pm PT / Mon 1:59am CT). Internal target **Sun Oct 12 18:00Z**.
- Track 1 = World's Fair on Solana. Pitch video **at most 2:00**, demo **at most 3:00**, public repo, logo, team, GTM.
- Judging (equal weight): functionality/code, impact, novelty, UX, open-source/composability, business plan. The judging FAQ adds: "First and foremost, Colosseum hackathons are startup competitions" (`data/copilot/faqs-judged.json`).
- Copilot: agent firewalls are saturated (15+ entries, 0 winners). Hardware wins (Unruggable twice, PlaiPin). Squads is rare in the archive (41 of 6,274 repository-tagged projects) and three winners near us use it: Mercantill, Unruggable, Blonk (`data/copilot/TAP-PRIMITIVES-2026-10-10.md`). Lead with the object, back it with Squads.
- **(Historical snapshot, superseded: current per-suite counts are in README and `./check.sh`.) Tests (21:05Z): vault 24, canon 22, shamir 9, executors 8, squads 9, cosign 14 = 86. `npm test` in `projects/tap-vault` (cosign added to the script). Zero network. Aperture reproduced 86/86 on another box; Lodestone ran 9 more adversarial cosign vectors with no break.**
- **Phone co-signer reads the chain bytes, not the agent (`cosign.js`).** It decodes the serialized Solana message itself, default-deny: exactly one SPL TransferChecked (compute-budget is the only allowed extra), and fee payer/source/mint/dest/multisig/amount/decimals must equal the STORED tapped intent. Contract: `cosign(msgBytes, storedIntent, phone)`; the intent never crosses the agent boundary.
- **Drain shot, devnet (`devnet-drain-shot.js`, 20:58Z):** tapped intent = 5 tUSD to Bob; agent builds 100 tUSD to Mallory → phone REFUSED (`destination mismatch`); agent-alone broadcast rejected at RPC signature preflight (not the token program — the on-chain refusal proof is 2h859F above); honest 5 landed, end balances treasury 95 / bob 5 / mallory 0: https://explorer.solana.com/tx/2coKQTw8s5qVCzgyPVfAKxrnzVfNbGyxz8v3CWS9Ga9WfkoY3d5dN91B5fiESvkZgimAQMrqBpMirroXAvYa7zyw?cluster=devnet
- **On-chain artifacts, SPL path, one run of `e2e-devnet.js` (18:54Z), re-read via `getTransaction` 18:56Z:**
  - Agent alone, refused by the SPL Token program: `meta.err = {"InstructionError":[0,"MissingRequiredSignature"]}`, slot 509637420, one signer:
    https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet
  - Ceremony then vault co-sign then agent broadcast, landed: 5 tUSD, `meta.err = null`, slot 509637436, two signers (agent, phone), treasury 100 to 95:
    https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet
  - Multisig `H4betTf7AV9RoiJuK2KTHg7yChzWWKPyVzmyp8JGoA8s`, treasury `5uSFonb1cFUeMCqPq99wnFrEEoDuK6VtgQLQUSVsn4u5`, mint `HoaQNimCM3RavWjHtJEhuSGuTddo1Q2TiMAjRMmgjSG6` with a separate mint authority (`e2e-devnet.js:69,74`).
- **On-chain artifacts, Squads v4 path, one run of `e2e-squads-devnet.js` (19:43Z), re-read via `getTransaction` 19:46Z, Squads error codes decoded by name (`squads.js:40-51`):**
  - Squads multisig [agent, phone], threshold 2, no config authority: https://explorer.solana.com/address/7PVFYKMouwiJJog4pxihapyVmw5NcKbT3dDgfLp9ddFz?cluster=devnet. Spending limit 0.05 SOL/day, member agent, destination alice: https://explorer.solana.com/address/F9vk8HZi6J2FjkhEcU2uoTtQCLnKbcS7cELJZA1ZowqK?cluster=devnet
  - (A1) agent alone, 0.02 SOL under the limit, landed, no tap, slot 509649416: https://explorer.solana.com/tx/4xFgywQbGhNCQBXeoVoMZ2hEY2hyMre5JujCc5DD4QDXv9hZPdVabeaRdUPbBLDEYwkjSopBkXToeivN6HqPBhP4?cluster=devnet
  - (A2) agent alone, 0.20 SOL, `Custom 6026` = SpendingLimitExceeded, slot 509649420: https://explorer.solana.com/tx/n3SJPjPVhbtb3VztvbokZaYpnPPkA5PFuKsd1s72tkaBV6NdJTg4ijXxEJ1nvG5GQKFn2iQt1x68rsqNoSxSzmM?cluster=devnet
  - (A3) agent alone, to an unlisted address, `Custom 6025` = InvalidDestination, slot 509649455: https://explorer.solana.com/tx/2kZYFuD5jUXouzn9GomY1hFxxg2cHe3ssiizptvQ6BMcSgFCHXXTRan6bjQjUGhti3aUaFXJM5psYQKmr6yoRpgy?cluster=devnet
  - (B) agent self-approves its proposal and executes, `Custom 6008` = InvalidProposalStatus (1 of 2), slot 509649462: https://explorer.solana.com/tx/2PqwXcd1iekgdXT8anfUtnUgZEn9DMVh5UoGFJwb8WZnJdVT9LawwqFahMU7h6CKAarcEQgYswUNBEAAiV5cicxJ?cluster=devnet
  - Ceremony, vault reads the proposal on chain and matches it, phone approves, two signers, slot 509649468: https://explorer.solana.com/tx/3namKP2ZKNLwNePBLwRHq7j2bjCf7prsVT97sGbgvZkZYhA3jJP5GPQsATG8xKNxVAuZJ6i3CRP71DdRWjSZ8HcX?cluster=devnet
  - Agent executes, vault -0.10, mallory +0.10, slot 509649482: https://explorer.solana.com/tx/4QWSmfeHpNEnYYBbGokkkkDidkHDnJsytetcBUBFCiJmi4DdUztpdr1dYxqgNAaWMx5BqJnRan5LhT4z7w7mjov6?cluster=devnet
  - (C) the lie: proposal says 0.25 SOL to mallory, agent tells the vault 0.01 to alice; vault refuses `intent mismatch` before signing (`squads.js:77`); execute refused InvalidProposalStatus, slot 509649533: https://explorer.solana.com/tx/5uXEXZexewBwAwjG1j2qEQpThQUXBR5zQ3X8qQXSs4oVtFvW3gQg8rRQiVhqquGe2eA8xC34p46pVGq5tRWivLNV?cluster=devnet
- **The stone in both e2e runs is SIMULATED** (`e2e-devnet.js:35-39`, `e2e-squads-devnet.js:40-44`, labelled). Firmware and phone app are maintained separately by Lodestone and are not in this repo. Vault, executors, SPL multisig, Squads program, Token program, System program are real.

## 1. Name + one-liner
**TAP: your agent's allowance is a Squads rule. Anything bigger needs a tap on a stone.**
Alt: *Prompts are suggestions. TAP is a lock.*

## 2. Short description (about 120 words)
Our own agents have cost us money with no attacker involved: a key with no limit, an idle GPU, a drained balance. Today an agent wallet is guarded by a prompt and an approve button. TAP replaces both. The agent shares a 2-of-2 vault with your phone (SPL multisig or Squads v4). Under its on-chain allowance it spends alone. Anything bigger needs a tap: your phone on a pocket stone, answering a challenge bound to that exact payment. The phone decodes the real transaction bytes and refuses anything else, and every approved transfer carries a receipt anyone can recompute from the chain. Don't trust us: verify. Open source, live on devnet.

## 3. Long description (about 500 words)
**Problem.** We run AI agents around the clock, and they have cost us money with no attacker involved: an OpenRouter key with no spend limit, a GPU box left idle, a drained balance. Every agent wallet today is guarded by a system prompt and an approve button. Prompts lose force as context fills, and people approve buttons blind.

**What TAP is.** An allowance the chain enforces, and a tap for everything bigger.
1. **The chain.** The agent shares a 2-of-2 vault with your phone, either an SPL multisig or Squads v4. Under its Squads spending limit the agent spends alone. Over it, Squads refuses (`SpendingLimitExceeded`). Agent alone on the SPL path: the Token program refuses with `MissingRequiredSignature`. Every refusal is on devnet, decoded by name.
2. **The stone.** A pocket ESP32 and a solenoid. The phone sends a challenge bound to the exact payment; the stone answers as a magnetic pulse the phone's magnetometer reads (measured: ~800–1000 μT spikes). A tap for 5 is worthless for 500.
3. **The phone reads bytes, not stories.** `cosign.js` decodes the exact transaction the agent will broadcast and signs only one TransferChecked matching the intent stored at the tap. Default deny: a smuggled transfer, a durable nonce the tap didn't approve or whose authority isn't the phone (`cosign.test.js` 31/31; offline-signing devnet run in `vault/devnet-faraday.js`), a v0 message, bytes it didn't parse, a second spend of the same tap. On Squads the vault reads the proposal from the chain, checks its owner and type (the SDK doesn't), and refuses a lie before approving. On devnet a compromised agent built 100 to Mallory and copied the honest receipt onto it; the phone refused on destination, and the honest 5 landed.
4. **The receipt.** Every approved transfer carries a memo `TAP1:<tapId>:` + SHA-256 of the stored intent, and each tap is single-use (a replay with a fresh blockhash is refused). `verify-receipt.js <tx>` rebuilds the intent from what executed and recomputes it, with no TAP server: https://explorer.solana.com/tx/rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT?cluster=devnet

**Why Solana.** The allowance is a program rule, not our JavaScript. Any existing Squads vault adopts TAP by adding the phone as a member, and sub-second finality keeps request, tap, approve, execute at human speed. Consensus a remote attacker can join; presence a remote attacker can't fake.

**Public good.** MIT-licensed, including the verifier, the attack suites (113 tests in `vault/` alone, counted from the repo itself; every refusal asserts its named reason), and our math, including a weakness we published against ourselves: blind, the bump rhythm is forgeable about 1 in 235 at defaults, and `stone/BUMP-MATH.md` shows the fix. The receipt is a convention any wallet can adopt.

**What TAP does not claim.** It gates the key, not the location: it can't prove distance, so a relay is possible. The receipt proves the co-signers signed this intent, not that a human stood at the stone. The stone key sits in ESP32 flash (secure element on the roadmap). The stone's answer is 16 bits at 1-bit tolerance, with a hard lock after 10 fails that survives restarts (≈0.26% ever; the phone app's decoder must use the same t=1). 32 bits is the next step (1 in 13M). The agent and vault must run on different devices. Full list in the README.

**Beyond wallets.** The same allowance-plus-tap model covers API keys; an OpenRouter executor ships in the vault.

## 4. Roadmap (detail and checks in FIT-AND-ROADMAP.md section 5)
- **Security stack (math and status per layer in `SECURITY-STACK.md`):** today 1 in 386 blind (16-bit magnet, hard lock) → v1.5 ≈3e-11 (32-bit magnet + keyed rhythm, firmware only) → v2 ≈3e-27 (+ ultrasonic). Secure element first for production, UWB for true distance, "TAP Pro" tripwires that refuse to sign if the room looks wrong. Every layer must pass ≥99% of honest taps on the bench before it ships.
- **By submission:** one repo (`tap-vault` merged into `jiggy-cadence/tap` as `vault/`), firmware and app source public or every stone labelled "prototype rig", a ceremony on camera, pricing decided, demand names, videos.
- **30 days:** phone app approving through `vault.phone.approve` with a real magnetometer decode; agent on a server and vault on the phone, over a network; 24-bit answers; a `wrapSigner` adapter for Solana Agent Kit and ElizaOS; a Blink that opens a TAP request from a link; CI green from a clean clone; first 5 external people run the devnet e2e.
- **90 days:** secure element on the stone (ATECC608A class); 32-bit answers as default; a Squads v4 vault on mainnet with our own funds under a written cap; `@tap/vault` on npm with two adapters; 10 hand-built stones with 10 users; 3 paying; external security review of `vault.js` and `squads.js`.
- **12 months:** 500 stones, 200 monthly active vaults; team mode (one stone per approver, N-of-M on Squads, per-seat billing); a second executor family (SSH keys, deploy tokens); Token-2022 transfer hook only if a customer needs a rule Squads limits cannot express; revenue covering BOM and one person part time.

## 5. Business / GTM (full plan with kill criteria in FIT-AND-ROADMAP.md section 6)
- **First customer hypothesis:** a solo operator running agents 24/7 with real Solana keys (trading bot, Agent Kit or ElizaOS agent) who has already lost money to an agent mistake. We are the first three data points. Second segment, 90 days out: small teams and DAOs already on Squads, who add TAP as a member.
- **Pricing to test (30-day split test on a pre-order page):** A. stone $29 one time, vault and app free, no account, no server. **BOM, honestly:** the filmed prototype costs ≈ $35–40 at retail (the Adafruit 1512 solenoid alone is $14.95, verified 2026-10-11; ESP32 devkit, ULN2003 and USB-C PD trigger make up the rest, prices not yet confirmed). $29 only works with a production board (ESP32-C3 module + small coil + MOSFET, target $8–12 at 1k units: an ESTIMATE, not quoted). Until then the stone is sold at cost or above, or pre-ordered against the production BOM. B. stone $19 plus $5/month for sync and alerts. No per-ceremony fee: TAP's value is that most spend never needs a ceremony. Below the Unruggable band on purpose: no screen, not a wallet. **Jiggy confirms or changes these numbers before submit.**
- **Distribution:** the adapter is the entry into Agent Kit and ElizaOS communities; Squads users add a member; filmable moments (the clack, the refusal on the explorer, the lying proposal refused); Jiggy's network (Texas Blockchain Council, DJ and creator audiences).
- **Kill criteria:** under 20 paid pre-orders in 30 days; under 3 of the first 10 users ever tap; a forge or relay against the real stone not fixable in 30 days; a wallet vendor ships a first-party physical approver (then TAP becomes the adapter and the hardware stops).
- **Demand validation:** TODO, needs Jiggy's real words. Name 3 to 10 people who said "I'd use this." No invented numbers.

## 6. Team (confirm before submit; submit locks it)
- Jiggy: founder, product/brand, submitter. TODO: one line in his words.
- Agents (Lodestone: architecture/hardware/art; Aperture: adversarial review; Cadence: specs, math, on-chain; Fable: judge review, e2e, Squads path, honesty pass). **Check the rules on whether agents can be listed.** If unclear, list humans and describe the agents as the build team's tooling. Every human member registers individually.

## 7. Pitch video (at most 2:00)
Script: `PITCH.md` in jiggy-cadence/tap (Aperture merged Cadence VOICEOVER.md; ~1:55). Shots: `SHOTLIST.md`.

## 8. Demo video (at most 3:00)
Script: `DEMO-SCRIPT.md` in jiggy-cadence/tap: npm test, then the devnet drain shot, then the explorer (2h859F refusal, rJRY77 receipt), then verify-receipt plus its canary, then Squads A1/A2/C, then the stone + art. Fresh-clone install verified 21:32Z.

## 9. Release blockers (owner, item)
- [x] Fable: SPL e2e path, separate mint authority, verified via getTransaction. Done 18:54Z.
- [x] Fable: S1 to S10 closed with failing-first tests. Done 19:20Z.
- [x] Fable: Squads v4 path (`squads.js`, 9 mock tests, `e2e-squads-devnet.js`), verified on devnet, re-read independently. Done 19:46Z.
- [x] Repo split: tap-vault is in `jiggy-cadence/tap` as `vault/`, cross-linked from README.md (commits 4cd6522, ee4b229).
- [x] Clean-clone gate: fresh `git clone` of github.com/jiggy-cadence/tap at a4232a3, `cd vault && npm ci`, then `bash check.sh` printed ALL GREEN (18 suites), node v20.19.2 / npm 9.2.0, no symlinked deps. Run by Aperture 2026-10-11 ~7:00 PM CT.
- [ ] **Lodestone:** phone app source into the repo. Confirm detector tolerance at most 1 and that the approve path uses `vault.phone.approve` with the escalating lockout. Until then every "stone" in the demo is simulated and the copy says so.
- [ ] **Lodestone or Jiggy:** a real magnetometer clip of a ceremony, or "prototype rig" on screen.
- [x] Aperture: adversarial pass on `squads.js`. Gap found: the executor checked the proposal but trusted that the multisig needs the phone, so on an existing vault with a configAuthority, threshold 1, or a third voter, the phone's approval was decoration. Failing test first, then fix: before signing it now reads the Multisig account and refuses unless configAuthority is none, the phone is a voting member, and all other voters together stay below threshold. The live devnet multisig 7PVFYK passes the new check (no config authority, threshold 2, 2 voters). Not a bypass of the demo setup, which was already 2-of-2.
- [ ] Jiggy: pricing confirmation (section 5), founder line, demand names, logo, register all members.
- [x] Public repo push: live at github.com/jiggy-cadence/tap. `devnet-keys.json` is gitignored. The five `vault/*-last-run.json` files are committed on purpose as evidence; checked 2026-10-11: they hold only public addresses, tx signatures and receipts (no key-named fields, no 32+ byte arrays).
- [ ] Videos done, then submit.

## 10. Scores (1 to 10, equal weight; reasoning in FIT-AND-ROADMAP.md section 4)
| criterion | v2 | v3 | v4 |
|---|---|---|---|
| Functionality / code | 4 | 7.5 | 8 |
| Impact | 5 | 6 | 6 |
| Novelty | 5 | 5.5 | 6 |
| UX | 4 | 5.5 | 5.5 |
| Open-source / composability | 5 | 7 | 7.5 |
| Business plan | 4 | 4 | 4.5 |
Overall about 6.5. What moves it next is human-only: a ceremony on camera, the app and firmware public, three named people who would pay.
