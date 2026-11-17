#!/usr/bin/env bash
# check.sh's summary line must not relabel failures as passes (panel 2026-11-17).
cd "$(dirname "$0")"; fail=0; n=0
is() { local got; got=$(printf '%s\n' "$2" | bash check.sh --summarize); n=$((n+1))
  if [ "$got" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: got '$got', want '$3'"; fail=1; fi; }
is "sums pass counts"                 $'6/6 pass\n15/15 pass'      "21/21 pass"
is "other suite words still count"    "12/12 vowfield"             "12/12 pass"
is "'3/10 failed' is not a pass total" "3/10 failed"               ""
is "failed count is left out of the sum" $'7/7 pass\n3/10 failed'  "7/7 pass"
is "N != M is not labelled pass"      "3/10 pass"                  "3/10 NOT ALL PASSING"
is "N tests pass form"                "9 receipt tests pass"       "9/9 pass"
[ $fail = 0 ] && echo "$n/$n pass" || { echo "check.sh summary self-test FAILED"; exit 1; }
