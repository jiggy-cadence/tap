# Squads v4 devnet 2-of-2 vault — runnable: `node squads-devnet.js`
Status (2026-10-10 1:31 PM CT): script written + syntax-checked; genesis-hash check confirmed devnet. Airdrop REFUSED by the public faucet (429 / Internal error), so nothing created on-chain yet. Fund the printed creator address via https://faucet.solana.com (devnet) and re-run. Needs Jiggy devnet yes/no (due Sun Oct 11, 7 AM CT). Spending limit is 0.125 SOL/day (not 0.25) per the fixed-period caveat below.
Goal: real "neither the stone nor the phone alone can move funds over the allowance", plus the Solana-track devnet tx Cadence wants.

## Keys (all devnet-only, fresh)
- `stone.json` — stone key (demo: generated on the box; real: generated on the ESP32, pubkey exported).
- `phone.json` — phone key (demo: box file; real: phone keystore / Seed Vault).
- `agent.json` — agent key: **NOT** a multisig member; only the spending-limit member.
- `creator.json` — fee payer for setup. `solana airdrop 2` on devnet (faucet is often rate-limited; fall back to faucet.solana.com).

## Steps
1. `npm i @sqds/multisig @solana/web3.js` (Squads v4 SDK; program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` — verify the ID in the v4 repo before use).
2. `multisig.rpc.multisigCreateV2` with `createKey` (fresh keypair), `threshold: 2`, members `[stone (Permissions.all()), phone (Permissions.all())]`, `timeLock: 0`, `configAuthority: null` (so config changes themselves need 2-of-2).
3. Derive vault PDA: `multisig.getVaultPda({ multisigPda, index: 0 })`. Fund it with ~0.5 devnet SOL from creator.
4. **Spending limit = the allowance**: config transaction `addSpendingLimit` with `mint: PublicKey.default` (SOL), `amount: 250_000_000` lamports, `period: Period.Day`, `members: [agent]`, `destinations: [alice]`. Create → `proposalApprove` by stone → by phone → `configTransactionExecute`.
   - Caveat: Squads `Period.Day` resets per period (fixed window from last reset), not a rolling 24h. Worst case at the boundary is up to 2× in a short span. Our off-chain policy.js is rolling; state this honestly or set the on-chain limit to 0.125/day so the on-chain worst case ≤ 0.25 in any 24h.
5. **Devnet tx A (allowance, no tap)**: agent calls `spendingLimitUse` for 0.05 SOL → Alice. Show on explorer (`?cluster=devnet`).
6. **Devnet tx B (needs tap)**: `vaultTransactionCreate` 0.5 SOL → Bob, `proposalCreate`; phone approves only after the TAP ceremony (signer.signMessage path); stone approves; `vaultTransactionExecute`. Show: with only one approval it stays pending — that's the "neither alone" shot.
7. **Drain attempt**: agent tries `spendingLimitUse` 10 SOL → Mallory → program error (over limit / destination not allowed). Film the explorer failure.

## Claims allowed after this works
- "Funds sit in a 2-of-2 Squads vault; stone + phone both required above the allowance." 
- Not before. Until then the funds are in one key held by signer.js.

## Open
- Squads proposal approvals are ed25519 txs signed by the member key — so the stone key must be able to sign a Solana tx (it can; ed25519). The TAP signer's `signMessage` already signs raw message bytes.
