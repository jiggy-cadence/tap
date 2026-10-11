#!/bin/sh
set -e
cd "$(dirname "$0")"
gcc -std=c99 -Wall -Wextra -Werror -o /tmp/stone_safety_test stone_safety_test.c
/tmp/stone_safety_test
