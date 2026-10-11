# TAP vault

A lock between an AI agent and the things that cost money.

The agent gets an allowance and a `request()` function. It never gets a key. Anything over the allowance, or to a recipient the human has not trusted, is held until the human taps their phone on a pocket stone. On Solana the treasury is an SPL token account owned by a 2-of-2 multisig `[agent, phone]`. The vault holds the phone key and co-signs only after a ceremony. Without that signature the Token program refuses the transfer. That refusal is Solana's, not ours.

Status: Solana Crypto World's Fair prototype. Devnet only. No mainnet, no real funds.

## What is in this repo

| file | what | tests |
|---|---|---|
| `vault.js` | the lock: allowance ledger, pending intents, ceremony binding, escalating lockout, agent/phone handle split | `vault.test.js` (24) |
| `canon.js` | canonical encoding of an intent so the challenge covers every field at every depth | `canon.test.js` (22) |
| `executors.js` | `openrouter` (API spend), `sol_transfer` (native SOL, one key), `spl_multisig_transfer` (co-signs from the 2-of-2 treasury) | `executors.test.js` (8, mock connection) |
| `squads.js` | `squads_vault_transfer`: Squads v4 vault [agent, phone] with an on-chain spending limit as the allowance; after a ceremony the vault reads the agent's proposal on chain, refuses on mismatch, co-approves with the phone key | `squads.test.js` (9, mock connection) |
| `e2e-squads-devnet.js` | the Squads path on devnet: allowance lands with no tap, over-limit and bad-destination refused by Squads, 1-of-2 refused, the tap path, the lying-proposal refusal | run it |
| `shamir.js` | 2-of-3 GF(2^8) secret sharing primitive, with a perfect-secrecy test | `shamir.test.js` (9) |
| `cosign.js` | phone co-signs only the exact broadcast bytes vs the STORED ceremony intent; TAP1 receipt memo | `cosign.test.js` (23) |
| `squads-type.test.js` | owner/type checks before decoding a Squads account as a vault transfer | `squads-type.test.js` (2) |
| `e2e-devnet.js` | the one end-to-end path on devnet, plus three refusals (see below) | run it |
| `devnet-2of2.js`, `devnet-refusal.js` | earlier standalone multisig scripts, kept for history; superseded by `e2e-devnet.js` | |
| `MATH.md` | the forging math, the binding argument, the physics, the device boundary | |

Not in this repo: the stone firmware (ESP32, solenoid, HMAC over magnetic pulses) and the phone app (magnetometer decode, ceremony UI). Both are maintained separately by Lodestone. Everything here that says "stone" is a model of the stone: it returns 16 bits of `HMAC(K, "mag" || challenge)` and the phone accepts Hamming distance at most 1. The end-to-end script uses that model and labels it `SIMULATED STONE`.

## Run it

```
npm install          # @solana/web3.js, @solana/spl-token
npm test             # 98 pass: vault 24, canon 22, shamir 9, executors 8, squads 10, cosign 23, squads-type 2. No network.
npm run e2e          # devnet, SPL 2-of-2 path. Creates devnet-keys.json (mode 600, gitignored) on first run; airdrops if needed.
npm run e2e:squads   # devnet, Squads v4 path (below). Same keys. Refuses any RPC that is not devnet.
```

Each test file is plain Node with `assert`; `node vault.test.js` runs one suite. Every vault test is something the agent tries, and the vault has to refuse it in code.

## The end-to-end path (`e2e-devnet.js`)

One run, fresh multisig, mint and treasury each time:

1. Setup: 2-of-2 SPL multisig `[agent, phone]`; a `tUSD` mint whose authority is a **separate** `mintAuthority` key (the agent cannot mint its way around the treasury); a treasury token account owned by the multisig, funded with 100 tUSD.
2. **(A) Agent alone, on chain.** The agent signs a 50 tUSD transfer from the treasury and broadcasts it with `skipPreflight` so the refusal has a public signature. Checked with `getTransaction().meta.err`, which must be `{"InstructionError":[0,"MissingRequiredSignature"]}`.
3. **(B) Attestation swap.** The agent requests 1 tUSD and 90 tUSD. The simulated stone answers the 1 tUSD challenge. The agent replays that answer against the 90 tUSD intent. The vault refuses: the challenge is derived from the intent, so a tap for one amount is a random guess for another.
4. **(C) Guessed attestation.** Refused; the fail counter goes up and never comes back down.
5. **The path.** `vault.agent.request(5 tUSD to mallory)` returns `needs_ceremony` with the text the human sees. The simulated stone answers the challenge. `vault.phone.approve()` verifies it and runs the **stored** intent: `spl_multisig_transfer` builds a `TransferChecked` from the treasury and signs with the phone key, which exists only inside the vault's secrets. The agent adds its own signature (it is the fee payer and the other multisig member) and broadcasts. Checked with `getTransaction().meta.err === null` and the token balances: treasury 100 to 95, mallory 0 to 5. Then the same approval is replayed and refused.

Nothing passes because "the client did not throw". Every on-chain result is read back from the chain and decoded before it counts.

### Verified devnet artifacts (run of 2026-10-10 18:54Z)

| what | link |
|---|---|
| multisig 2-of-2 [agent, phone] | https://explorer.solana.com/address/H4betTf7AV9RoiJuK2KTHg7yChzWWKPyVzmyp8JGoA8s?cluster=devnet |
| tUSD mint (authority `69poTUrcuJTbwWbQcmJwbYvuowcZfFoFcB9pgAyfnBD8`, not the agent) | https://explorer.solana.com/address/HoaQNimCM3RavWjHtJEhuSGuTddo1Q2TiMAjRMmgjSG6?cluster=devnet |
| treasury (owned by the multisig) | https://explorer.solana.com/address/5uSFonb1cFUeMCqPq99wnFrEEoDuK6VtgQLQUSVsn4u5?cluster=devnet |
| agent alone, refused: `MissingRequiredSignature`, slot 509637420, one signer | https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet |
| ceremony then co-sign, landed: 5 tUSD, slot 509637436, two signers (agent, phone) | https://explorer.solana.com/tx/2ik5wVv3cviq4uhdvVht3NJkguqY5d1MgvbAdicEuR99a6t9C8vYZ6okjjEBnTKzKrorjHHYpccjNgBMyhbjFtHq?cluster=devnet |

Keys for that run: agent `5wQ8upNjHi9cg3vAkCBwbhTHzmS4L7rEBqekB6A2AywY`, phone `CchTXNULQcZtTRQjJeJEQikPaFgR8YUz5bEGZdYhezhs`. Both signatures are visible on the success tx; only the agent's is on the refused one.

## The Squads v4 path (`e2e-squads-devnet.js`)

The SPL path above cannot cover native SOL and keeps the allowance inside the vault. The Squads path moves the allowance on chain: the treasury is a Squads v4 multisig `[agent, phone]`, threshold 2, with a spending limit for the agent (`0.05 SOL/day` to a listed destination). Under the limit the agent spends alone and no tap happens. Over the limit, or to anyone not listed, the agent must open a proposal and the phone must approve it. The vault holds the phone key and approves only after a ceremony, and only after reading the proposal from the chain and checking it says exactly what the human was shown (`squads.js:23-37,69-77`).

One run, fresh multisig each time, verified from `getTransaction().meta.err` with Squads error codes decoded by name (`squads.js:40-51`):

| step | what | on-chain result |
|---|---|---|
| (A1) | agent alone, 0.02 SOL to alice, under the limit | landed, `meta.err = null`. The allowance, enforced by Squads, no tap |
| (A2) | agent alone, 0.20 SOL to alice | `Custom 6026` = `SpendingLimitExceeded` |
| (A3) | agent alone, 0.01 SOL to mallory (not listed) | `Custom 6025` = `InvalidDestination` |
| (B) | agent opens a 0.10 SOL proposal, approves it itself, executes | `Custom 6008` = `InvalidProposalStatus` (1 of 2) |
| path | `request` then ceremony then the vault reads the proposal, matches it, phone approves; agent executes | approval landed with two signers (agent, phone); execute landed, vault -0.10, mallory +0.10 |
| (C) | agent opens a 0.25 SOL to mallory proposal but tells the vault "0.01 SOL to alice" on that index; human taps for that | vault: `intent mismatch`, phone signs nothing; execute refused `InvalidProposalStatus` |

### Verified devnet artifacts (run of 2026-10-10 19:43Z, re-read independently 19:46Z)

| what | link |
|---|---|
| Squads multisig [agent, phone], threshold 2, configAuthority none | https://explorer.solana.com/address/7PVFYKMouwiJJog4pxihapyVmw5NcKbT3dDgfLp9ddFz?cluster=devnet |
| vault PDA | https://explorer.solana.com/address/7r9k1P8s7Yvb8RtR522NDS9rB32rz5BHc8NY69vtn1Rc?cluster=devnet |
| spending limit (0.05 SOL/day, member agent, destination alice) | https://explorer.solana.com/address/F9vk8HZi6J2FjkhEcU2uoTtQCLnKbcS7cELJZA1ZowqK?cluster=devnet |
| (A1) allowance, no tap, landed, slot 509649416 | https://explorer.solana.com/tx/4xFgywQbGhNCQBXeoVoMZ2hEY2hyMre5JujCc5DD4QDXv9hZPdVabeaRdUPbBLDEYwkjSopBkXToeivN6HqPBhP4?cluster=devnet |
| (A2) SpendingLimitExceeded, slot 509649420 | https://explorer.solana.com/tx/n3SJPjPVhbtb3VztvbokZaYpnPPkA5PFuKsd1s72tkaBV6NdJTg4ijXxEJ1nvG5GQKFn2iQt1x68rsqNoSxSzmM?cluster=devnet |
| (A3) InvalidDestination, slot 509649455 | https://explorer.solana.com/tx/2kZYFuD5jUXouzn9GomY1hFxxg2cHe3ssiizptvQ6BMcSgFCHXXTRan6bjQjUGhti3aUaFXJM5psYQKmr6yoRpgy?cluster=devnet |
| (B) InvalidProposalStatus, 1 of 2, slot 509649462 | https://explorer.solana.com/tx/2PqwXcd1iekgdXT8anfUtnUgZEn9DMVh5UoGFJwb8WZnJdVT9LawwqFahMU7h6CKAarcEQgYswUNBEAAiV5cicxJ?cluster=devnet |
| phone approval after the ceremony, two signers, slot 509649468 | https://explorer.solana.com/tx/3namKP2ZKNLwNePBLwRHq7j2bjCf7prsVT97sGbgvZkZYhA3jJP5GPQsATG8xKNxVAuZJ6i3CRP71DdRWjSZ8HcX?cluster=devnet |
| execute, vault -0.10, mallory +0.10, slot 509649482 | https://explorer.solana.com/tx/4QWSmfeHpNEnYYBbGokkkkDidkHDnJsytetcBUBFCiJmi4DdUztpdr1dYxqgNAaWMx5BqJnRan5LhT4z7w7mjov6?cluster=devnet |
| (C) the lie, execute refused, slot 509649533 | https://explorer.solana.com/tx/5uXEXZexewBwAwjG1j2qEQpThQUXBR5zQ3X8qQXSs4oVtFvW3gQg8rRQiVhqquGe2eA8xC34p46pVGq5tRWivLNV?cluster=devnet |

Squads caveat: `Period.Day` is a fixed window that resets, not a rolling 24 h, so the worst case at a boundary is two limits in a short span. Set the on-chain limit to half of what you mean, or add the vault's rolling ledger in front of it (the vault does this for its own kinds). The phone's one-time approval of the spending-limit config at setup is scripted in the e2e and labelled pairing time.

## Threat model

The attacker is the agent. It is a program with the vault's `agent` handle, running on a different machine from the vault, possibly prompt-injected, possibly running many requests in parallel. It wants to move more value than the human intended, to a place the human did not intend, without a tap.

What holds, and the test that says so:

- The agent has `request` and `status` only. No `approve`, no keys, no policy. `vault.test.js`: "the agent handle has no approve", "the agent cannot read the keys".
- The vault executes the stored intent, never what the caller sends at approve time. "the agent mutating its own intent object after the request changes nothing".
- The ceremony challenge is `SHA-256("chal" || SHA-256("TAP1" || canon(intent)) || nonce)`. A valid answer for intent A is a random guess for intent B. "TOCTOU: a tap for intent A cannot approve intent B", and (B) in the e2e.
- Single use, 30 s TTL (60 s in the e2e). "replay", "expired".
- Spend is reserved before the executor awaits, so a parallel burst cannot overrun the allowance. "concurrent burst cannot overrun the allowance".
- Guesses are counted for the life of the vault: cooldown from the third fail doubling each time, hard lock at the tenth, no reset on a successful tap. Total guesses before the hard lock: 10. With 16-bit answers and tolerance 1 that is a forge probability of at most 10 x 17 / 65536, about 0.26%, total. "forged ceremonies: escalating lockout, then hard lock", "a legit tap does not refill the guess budget".
- A tap blesses one send. The recipient is trusted for future allowance sends only if the intent carried `trust: true`, and then the human sees "TRUST this address" in the text they approve. "S5".
- The pending map is capped (64 by default) and expired entries are pruned. "S6".
- For AI calls the human sees the first line of the prompt and a hash of the whole thing, not only the price. "S8".
- Recipient must be a non-empty address string at the vault; the executor rejects anything that is not an on-curve pubkey. "S10", `executors.test.js` "bad recipient".
- `canon` refuses undefined, NaN, Date, Map, Set, class instances, symbol keys and sparse arrays, and tags bigint and bytes so they cannot collide with strings. `canon.test.js`.
- On the SPL path, the phone signature covers the serialized message. Changing the amount, mint, source or destination after the vault signs invalidates it (`executors.test.js`: "changing the amount invalidates the phone signature"), and omitting it gets `MissingRequiredSignature` from the Token program (e2e (A)).

## What TAP does not claim

- **It does not prove the stone was near the phone.** 250 ms symbols bound distance to about 37,000 km. A relay is possible. TAP gates the key, not the location.
- **The native SOL path (`sol_transfer`) is vault-enforced only.** Native SOL cannot be owned by an SPL multisig. The chain backs the SPL path and the Squads path (which does cover native SOL), not this one.
- **On the Squads path the agent is a full member.** It can open proposals and approve them alone; it cannot execute without the phone (e2e (B)). A hostile agent can also spam proposals; each costs it rent. Squads `Period.Day` resets on a fixed window, not rolling.
- **The OpenRouter cap is an estimate reconciled afterwards, not a hard pre-call bound.** Prompt tokens are estimated at chars/3, which undercounts CJK, emoji and dense code; the ledger is corrected to the provider's reported cost after the call. One call can overrun the cap by the size of that estimation error. `max_tokens` is passed through; whether it bounds reasoning tokens depends on the provider.
- **The stone is 16 bits with tolerance 1.** The lockout is what makes that acceptable. Without the lockout it is not (MATH.md shows 61% forge-in-a-day under a flat lockout). 24 to 32 bits are planned.
- **The stone key sits in ESP32 flash in v0.** No secure element yet.
- **The "agent cannot read the keys" guarantee needs two devices.** Inside one process a hostile agent could monkeypatch globals before the vault loads. Vault on the phone, agent on the server. `MATH.md` section 5.
- **Shamir is a primitive, not a recovery flow.** `shamir.js` splits and recombines bytes and the test proves per-share secrecy. Nothing in this repo yet splits a wallet seed across phone, stone and paper.
- **The stone and the phone app are simulated here.** The firmware and app live with Lodestone. Until they are in a public repo, the ceremony you can run from this repo is the HMAC model in `e2e-devnet.js`, not a magnetometer reading.
- **The agent still needs to cooperate to spend.** On the SPL path the agent adds its own signature after the vault signs. A refusing agent is a liveness problem, not a safety problem; the multisig means neither party can move funds alone.
- **Devnet only.** No mainnet deployment, no audit, no real funds have been at risk.

## Design notes

- The vault is one closure. Secrets and policy are captured at creation; the returned object is frozen; `vault.agent` is `{request, status}` and `vault.phone` is `{approve}`.
- Add a kind = add a branch in `costOf`/`describe` and an executor `(intent, secrets, policyForKind) => {result, actualCost?}`. The lock logic does not change.
- `spl_multisig_transfer` returns a phone-signed, agent-unsigned transaction rather than broadcasting. That keeps the agent key out of the vault entirely and matches the multisig shape: two parties, two signatures, two devices.

## License

MIT.
