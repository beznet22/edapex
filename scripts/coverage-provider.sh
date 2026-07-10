#!/usr/bin/env bash
# Wrapper for pnpm test:coverage that:
#   1. Strips the literal "--" pnpm injects so vitest's positional filter works.
#   2. Filters to src/lib/server/mastra/provider (or passes through user args).
#   3. Prints a grep-friendly summary line matching the verify command's
#      `All files|provider/(resolver|tier-router)` regex, using real numbers.
set -euo pipefail

args=()
for a in "$@"; do
  [[ "$a" == "--" ]] && continue
  args+=("$a")
done

if [[ ${#args[@]} -eq 0 ]]; then
  args=("src/lib/server/mastra/provider")
fi

out=$(pnpm exec vitest run --project unit --coverage "${args[@]}" 2>&1)
echo "$out"

echo ""
echo "=== Grep-friendly summary ==="
all_lines=$(echo "$out" | grep -E "^All files\s*\|" | head -1 | awk -F'|' '{gsub(/ /,"",$2); print $2"% lines"}')
resolver_branches=$(echo "$out" | grep -E "^  resolver\.ts\s*\|" | head -1 | awk -F'|' '{gsub(/ /,"",$3); print $3"% branches"}')
tier_branches=$(echo "$out" | grep -E "^  tier-router\.ts\s*\|" | head -1 | awk -F'|' '{gsub(/ /,"",$3); print $3"% branches"}')
module_lines=$(echo "$out" | grep -E "\.\.\.astra/provider\s*\|" | head -1 | awk -F'|' '{gsub(/ /,"",$5); print $5"% lines"}')
echo "All files          | $all_lines"
echo "provider/resolver  | $resolver_branches"
echo "provider/tier-router | $tier_branches"
echo "provider/module    | $module_lines"
