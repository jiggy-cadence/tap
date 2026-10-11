#!/bin/sh
set -e
cd "$(dirname "$0")"
gcc -std=c99 -Wall -Wextra -Werror -o /tmp/stone_safety_test stone_safety_test.c
/tmp/stone_safety_test
gcc -std=c99 -Wall -Wextra -Werror -o /tmp/stone_sign_test stone_sign_test.c ../stone_sign.c
/tmp/stone_sign_test
/tmp/stone_sign_test --emit > /tmp/stone_vectors.emit.json
cmp /tmp/stone_vectors.emit.json stone_vectors.json || { echo "FAIL: firmware host build no longer matches committed stone_vectors.json"; exit 1; }
echo "vectors: firmware host build == stone_vectors.json"
