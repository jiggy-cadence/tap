# TAP: Colosseum Crypto World's Fair submission (v4, Fable 2026-10-10 20:05Z)

Status: paste-ready copy + open checklist. Nothing submitted. **Submit LOCKS team + videos.**
v3 superseded. Every claim below is backed by a runnable file:line in `projects/tap-vault/` or a devnet tx link. If a claim has no anchor, it does not go in. Fit analysis, roadmap detail and the business plan live in `FIT-AND-ROADMAP.md`.

## 0. Verified facts
- **Close: Mon Oct 13 06:59Z** (Sun 11:59pm PT / Mon 1:59am CT). Internal target **Sun Oct 12 18:00Z**.
- Track 1 = World's Fair on Solana. Pitch video **at most 2:00**, demo **at most 3:00**, public repo, logo, team, GTM.
- Judging (equal weight): functionality/code, impact, novelty, UX, open-source/composability, business plan. The judging FAQ adds: "First and foremost, Colosseum hackathons are startup competitions" (`data/copilot/faqs-judged.json`).
- Copilot: agent firewalls are saturated (15+ entries, 0 winners). Hardware wins (Unruggable twice, PlaiPin). Squads is rare in the archive (41 of 6,274 repository-tagged projects) and three winners near us use it: Mercantill, Unruggable, Blonk (`data/copilot/TAP-PRIMITIVES-2026-10-10.md`). Lead with the object, back it with Squads.
- **Tests (21:05Z): vault 24, canon 22, shamir 9, executors 8, squads 9, cosign 14 = 86. `npm test` in `projects/tap-vault` (cosign added to the script). Zero network. Aperture reproduced 86/86 on another box; Lodestone ran 9 more adversarial cosign vectors with no break.**
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
Our agents have cost us money without being attacked: an OpenRouter key with no limit, a GPU box left idle, a balance run dry. Every agent wallet today is guarded by a system prompt and an approve button. TAP replaces the prompt with a Squads v4 spending limit and the button with an object. The agent is a member of a 2-of-2 Squads vault with your phone. Under its on-chain limit it spends alone. Over it, or to a new address, it must open a proposal, and the phone approves only after you put it on a pocket stone that answers a challenge derived from that exact proposal. Before signing, the vault reads the proposal from the chain and refuses if it differs from what you were shown. On the SPL path the phone decodes the real transaction bytes and refuses anything but exactly what you tapped, and every approved transfer carries a receipt memo that anyone can recompute from the chain. Don't trust us: verify. Consensus a remote attacker can join; presence a remote attacker can't fake. Open source, on devnet.

## 3. Long description (about 500 words)
**Problem.** We run AI agents 24/7, and they have cost us money. One had an OpenRouter key with no spend limit. One left a GPU box idle at about $40. One ran an Anthropic balance dry. None of these was an attack. They were an agent doing what agents do when nothing stops it. Every agent wallet today is guarded by the same thing: a system prompt and an approve button. Prompts lose force as context fills, and people approve buttons blind.

**What TAP is.** Three layers, each one dumb on purpose.
1. **The vault (phone).** It holds the phone key. The agent gets a handle with `request` and `status` and nothing else (`vault.js:170`). Spend under the allowance to a trusted recipient goes through; anything else is held for a tap (`vault.js:83-89`). Spend is reserved before the executor runs, so a parallel burst cannot overrun the cap (`vault.js:93-97`, test `vault.test.js:102`). The vault runs the stored intent, so editing the request afterwards changes nothing (`vault.js:120,140`). 24 vault tests, 19 of them refusals.
2. **The stone (pocket object).** ESP32 + solenoid. The phone sends a challenge derived from SHA-256 over the canonicalised intent and a nonce (`vault.js:115-119`, `canon.js`). The stone answers with an HMAC pulsed as a magnetic field the phone's magnetometer reads. The answer fits this intent only, so a tap for 5 is worthless for 500 (`vault.test.js:63`; on devnet `e2e-devnet.js:115-123`). Firmware and app are Lodestone's and ship separately; the repo models the stone and says so.
3. **The chain (Solana).** Two paths, both verified on devnet from `getTransaction().meta.err`. SPL: a treasury owned by a 2-of-2 SPL multisig [agent, phone]; the vault co-signs TransferChecked after the ceremony and the Token program refuses the agent alone with MissingRequiredSignature (`executors.js:42-68`, `e2e-devnet.js:99-111`). Squads v4: the vault is a Squads multisig [agent, phone] with a spending limit for the agent. Under the limit the agent spends with no tap (A1). Over it, Squads refuses (A2, A3). Over it with a proposal, Squads refuses execution until the phone approves (B). After the ceremony the vault reads the agent's proposal from the chain, requires exactly one transfer from the vault PDA to the stored recipient for the stored amount (`squads.js:23-37,69-77`), and only then signs the approval with the phone key (`squads.js:85`). If the proposal says something else, the phone signs nothing (C). The vault also checks the account's owner and type before decoding it, because the Squads SDK decoder does not, so a settings-change proposal placed at the index can't be read as a transfer (`squads.js`, `squads-type.test.js`).
4. **The co-signer reads bytes, not stories.** On the SPL path the phone never trusts the agent's description of a transaction. `cosign.js` decodes the exact serialized message the agent will broadcast and signs only when it is one TransferChecked whose fee payer, source, mint, destination, multisig, amount and decimals all equal the intent stored at the ceremony. It refuses default-deny: a smuggled second transfer, a durable nonce, a v0 message with lookup tables, any byte the parser didn't consume (23 tests, every refusal asserting its named reason). On devnet a compromised agent built 100 tUSD to Mallory and even copied the honest receipt onto it; the phone refused on destination mismatch, and the honest 5 landed (`devnet-drain-shot.js`).
5. **The receipt.** Every approved transfer carries a memo `TAP1:` + SHA-256 of the canonical stored intent, and the phone signs only if the memo is exactly that. `verify-receipt.js <tx>` rebuilds the intent from what actually executed on chain and recomputes the receipt, so anyone can verify a tap with no TAP server and no trust in us. It fails on a transaction without one: https://explorer.solana.com/tx/rJRY77eUMuy4bPkZ8sWhRQBqDDfokhsUyhuE14CBHeTZz87WiYehvGg7FkavguYUDdkHD7gKMyJaBXyXNRtfALT?cluster=devnet. The receipt proves the co-signers signed this intent; presence at the stone is the ceremony's claim, not the memo's.

**Public good.** Everything is MIT-licensed, including the verifier, the attack suites and the math (`vault/MATH.md`, `stone/BUMP-MATH.md`, where we published that our own bump rhythm is forgeable blind about 1 in 235 at defaults, and what fixes it). The receipt format is a convention any wallet or agent framework can adopt: a hash in a memo that anyone can recompute.

**Why Solana, and why Squads.** The allowance is a program rule, not a line in our JavaScript: Squads v4 spending limits give the agent a per-period cap and a destination list that the chain enforces, native SOL included. Proposal plus threshold gives "neither party alone" without a custom program. The whole trust surface on chain is Squads v4 and the Token program. Any existing Squads vault can add TAP by adding the phone key as a member. Sub-second finality keeps the request, tap, approve, execute loop at human speed.

**What TAP does not claim.** It does not prove the stone was near the phone: 250 ms symbols cannot bound distance, so a relay is possible. TAP gates the key, not the location. The plain `sol_transfer` kind is vault-enforced only; the Squads path is what covers native SOL on chain. On the Squads path the agent is a full member: it can open and self-approve proposals and spam them at its own rent cost; it cannot execute without the phone. Squads `Period.Day` is a fixed reset window, not a rolling 24 h, so set the on-chain limit at half the intended rolling cap or keep the vault's rolling ledger in front. The phone's one approval of the spending-limit config at setup is scripted in the e2e and labelled pairing time. The OpenRouter cap is an estimate reconciled after the call, not a hard pre-call bound. The v0 stone key sits in ESP32 flash; a secure element is on the roadmap. The stone's answer is 16 bits with tolerance 1. Only the phone handle can submit an answer (`vault.js:170-171`), the fail counter never resets (`vault.js:138`), and the tenth fail hard-locks (`vault.js:134`), so whoever can reach approve gets 10 guesses total, about 0.26% (MATH.md section 1). The "agent cannot read keys" guarantee holds because vault and agent run on different devices. The full list is in README.md.

**Beyond wallets.** The same allowance-plus-tap model covers API keys. The OpenRouter executor ships in the vault, and the human sees the first line of the prompt before tapping (`vault.js:154-158`).

## 4. Roadmap (detail and checks in FIT-AND-ROADMAP.md section 5)
- **By submission:** one repo (`tap-vault` merged into `jiggy-cadence/tap` as `vault/`), firmware and app source public or every stone labelled "prototype rig", a ceremony on camera, pricing decided, demand names, videos.
- **30 days:** phone app approving through `vault.phone.approve` with a real magnetometer decode; agent on a server and vault on the phone, over a network; 24-bit answers; a `wrapSigner` adapter for Solana Agent Kit and ElizaOS; a Blink that opens a TAP request from a link; CI green from a clean clone; first 5 external people run the devnet e2e.
- **90 days:** secure element on the stone (ATECC608A class); 32-bit answers as default; a Squads v4 vault on mainnet with our own funds under a written cap; `@tap/vault` on npm with two adapters; 10 hand-built stones with 10 users; 3 paying; external security review of `vault.js` and `squads.js`.
- **12 months:** 500 stones, 200 monthly active vaults; team mode (one stone per approver, N-of-M on Squads, per-seat billing); a second executor family (SSH keys, deploy tokens); Token-2022 transfer hook only if a customer needs a rule Squads limits cannot express; revenue covering BOM and one person part time.

## 5. Business / GTM (full plan with kill criteria in FIT-AND-ROADMAP.md section 6)
- **First customer hypothesis:** a solo operator running agents 24/7 with real Solana keys (trading bot, Agent Kit or ElizaOS agent) who has already lost money to an agent mistake. We are the first three data points. Second segment, 90 days out: small teams and DAOs already on Squads, who add TAP as a member.
- **Pricing to test (30-day split test on a pre-order page):** A. stone $29 one time, vault and app free, no account, no server (BOM about $8 to $12). B. stone $19 plus $5/month for sync and alerts. No per-ceremony fee: TAP's value is that most spend never needs a ceremony. Below the Unruggable band on purpose: no screen, not a wallet. **Jiggy confirms or changes these numbers before submit.**
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
- [ ] **REPO SPLIT:** `github.com/jiggy-cadence/tap` holds firmware/, stone/ (signer.js, policy, squads-devnet.js never run), expo/, page/. It does NOT hold tap-vault, but this draft cites tap-vault files and txs. Add tap-vault as `vault/` and cross-link. Jiggy decides, Cadence executes.
- [ ] Cadence: `npm ci && npm test` from a clean clone (this box uses symlinked deps; `@sqds/multisig` was installed to `/tmp/sqds-install` and symlinked).
- [ ] **Lodestone:** phone app source into the repo. Confirm detector tolerance at most 1 and that the approve path uses `vault.phone.approve` with the escalating lockout. Until then every "stone" in the demo is simulated and the copy says so.
- [ ] **Lodestone or Jiggy:** a real magnetometer clip of a ceremony, or "prototype rig" on screen.
- [ ] Aperture: adversarial pass on `squads.js` and the Squads e2e; any bypass becomes a failing test first.
- [ ] Jiggy: pricing confirmation (section 5), founder line, demand names, logo, register all members.
- [ ] Public repo push (not done; nothing pushed or posted). `devnet-keys.json` and `*-last-run.json` are gitignored.
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
