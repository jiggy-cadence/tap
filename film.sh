#!/usr/bin/env bash
# One command to film the TAP demo. Each beat waits for ENTER so you can narrate (FILM_NOPAUSE=1 to run straight).
# Big terminal font. First run installs deps and creates throwaway devnet keys (git-ignored). If the devnet faucet
# errors ("airdrop … Internal error", it is flaky), paste the printed agent address into https://faucet.solana.com and rerun.
set -e
cd "$(dirname "$0")/vault"
[ -d node_modules ] || { echo "installing (first run)…"; npm install --silent; }
# first run: devnet-2of2.js creates throwaway devnet keys (git-ignored), airdrops the agent, and proves the on-chain refusal
[ -f devnet-keys.json ] || { echo "creating devnet keys (first run)…"; node devnet-2of2.js; }
beat() { printf '\n\033[1;33m━━━ %s ━━━\033[0m\n' "$1"; [ -n "$FILM_NOPAUSE" ] || read -r -p "  (enter) " _; }
beat "1 · The tests: every attack must fail for its NAMED reason"
npm test --silent 2>&1 | grep -E "pass|FAIL"
beat "2 · A real AI agent, prompt-injected, on Solana devnet"
node agent-demo.js
SIG=$(node -e 'const l=require("./agent-demo-last-run.json").log.find(x=>x.startsWith("LANDED"));console.log(l?l.match(/tx\/([1-9A-HJ-NP-Za-km-z]+)/)[1]:"")')
beat "3 · Don't trust us: verify the receipt from chain data alone"
[ -n "$SIG" ] && node verify-receipt.js "$SIG" || echo "(no landed tx this run)"
beat "4 · Canary: a transaction without a receipt must FAIL the check"
node verify-receipt.js 2coKQTw8s5qVCzgyPVfAKxrnzVfNbGyxz8v3CWS9Ga9WfkoY3d5dN91B5fiESvkZgimAQMrqBpMirroXAvYa7zyw || true
beat "5 · On-chain refusal, agent alone (open in browser)"
echo "https://explorer.solana.com/tx/2h859F33kaLQ7RUtHXpWNdxz5UDmcTZUbyQzcyT3GrXKeX65b1UMAoFvxwfsJkYh2GNNkABJTaJqKmB2rVYobMrD?cluster=devnet"
[ -n "$SIG" ] && echo "https://explorer.solana.com/tx/$SIG?cluster=devnet   ← this run's receipt-carrying payment"
printf '\n\033[1;32mPrompts are suggestions. TAP is a lock.\033[0m\n'
