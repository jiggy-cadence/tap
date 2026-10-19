#!/usr/bin/env bash
# ONE gate for the whole repo. Run before every push; must print ALL GREEN.
# Fresh-clone safe (installs deps once), no network, no keys. Exit 1 on any failure.
cd "$(dirname "$0")"; fail=0; total=0
run() { local name="$1"; shift; if out=$("$@" 2>&1); then printf '  ✓ %-28s %s\n' "$name" "$(echo "$out" | grep -Eo '[0-9]+/[0-9]+ pass|[0-9]+ passed, 0 failed|ALL [A-Z ]+' | tail -1)"; else printf '  ✗ %-28s FAILED\n%s\n' "$name" "$(echo "$out" | tail -8)"; fail=1; fi; total=$((total+1)); }
[ -d vault/node_modules ] || (cd vault && npm install --silent >/dev/null 2>&1)
[ -d stone/node_modules ] || [ ! -f stone/package.json ] || (cd stone && npm install --silent >/dev/null 2>&1)
echo "vault"; run "npm test" bash -c "cd vault && npm test --silent"
echo "stone"; for f in stone/*.test.js; do run "$f" node "$f"; done
echo "sdk / expo / page / evidence"; for f in sdk/*.test.js expo/*.test.js page/*.test.js evidence/*.test.js; do run "$f" node "$f"; done
echo "firmware host tests"; if command -v gcc >/dev/null; then run "firmware/test/run.sh" sh firmware/test/run.sh; else echo "  - gcc missing, skipped"; fi
run "firmware/bench self-test" python3 firmware/bench/make_requests.py --self-test
echo "secret-print guard v2 (deny-by-default: any print sink x secret-ish name; public outputs allowlisted)"
# leak = a print SINK whose ARGUMENT carries the secret value (printHex(var), Serial.print(var))
# or prints its BITS. Printing the WORD "key" in a refusal/help message is honest UI, not a leak.
GUARD_HITS=$(grep -nE 'printHex\s*\(\s*[^,)]*(key|nk|sk|seed|priv|secret|entropy|digest|answer|mag)[^,)]*|Serial\.(print|println)\s*\(\s*[^F(]*(key|nk|sk\b|seed|priv|secret|entropy|digest|answer|magbits)' firmware/*.ino | grep -viE 'spub|SSIG|tapId')
if [ -n "$GUARD_HITS" ]; then echo "$GUARD_HITS"; echo "  ✗ firmware prints a secret"; fail=1; else echo "  ✓ no secret prints in firmware"; fi
[ $fail = 0 ] && echo "ALL GREEN ($total suites)" || { echo "RED — do not push"; exit 1; }
