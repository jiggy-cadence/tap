#!/usr/bin/env bash
# ONE gate for the whole repo. Run before every push; must print ALL GREEN.
# Fresh-clone safe (installs deps once), no network, no keys. Exit 1 on any failure.
cd "$(dirname "$0")"; fail=0; total=0
# Sum every "N/N pass" (or "N/N <word>", "N foo tests pass", "N passed, 0 failed")
# so a multi-suite runner like vault's npm test reports its true total, not only the last file.
summarize() {
  local out="$1" n d
  # Sum every "N/N pass" and also "N/N <word>" (e.g. vowfield prints "12/12 vowfield").
  if echo "$out" | grep -Eq '[0-9]+/[0-9]+ (pass|[A-Za-z]+)'; then
    echo "$out" | grep -Eo '[0-9]+/[0-9]+ (pass|[A-Za-z]+)' | awk -F'[+/ ]' '{p+=$1; t+=$2} END{if(t>0) printf "%d/%d pass", p, t}'
    return
  fi
  # "N receipt tests pass" / "N SEAL tests pass" / "N … tests pass"
  n=$(echo "$out" | grep -Eo '[0-9]+[[:space:]]+[A-Za-z ]*tests? pass' | awk '{s+=$1} END{if(s>0) print s}')
  if [ -n "$n" ]; then printf '%d/%d pass' "$n" "$n"; return; fi
  # "N passed, 0 failed"
  d=$(echo "$out" | grep -Eo '[0-9]+ passed, 0 failed' | tail -1)
  if [ -n "$d" ]; then echo "$d"; return; fi
  # bare PASS lines (fallback)
  n=$(echo "$out" | grep -cE '^PASS( |$)' || true)
  if [ "${n:-0}" -gt 0 ]; then printf '%d/%d pass' "$n" "$n"; return; fi
  # "ALL …"
  echo "$out" | grep -Eo 'ALL [A-Z ]+' | tail -1
}
run() { local name="$1"; shift; if out=$("$@" 2>&1); then printf '  ✓ %-28s %s\n' "$name" "$(summarize "$out")"; else printf '  ✗ %-28s FAILED\n%s\n' "$name" "$(echo "$out" | tail -8)"; fail=1; fi; total=$((total+1)); }
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
