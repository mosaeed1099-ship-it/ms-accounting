#!/usr/bin/env bash
# =============================================================================
# Build Script — MS Accounting Frontend
# Concatenates js/src/* files and injects into frontend/index.html
# Usage: bash scripts/build.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/js/src"
OUTPUT="$ROOT/frontend/index.html"
TEMPLATE="$ROOT/frontend/index.template.html"

# ── Order matters — must match runtime dependency order ──────────────────────
SOURCE_FILES=(
  "01-core.js"
  "02-monthly-fees.js"
  "03-tail.js"
)

echo "╔══════════════════════════════════════════════════╗"
echo "║  MS Accounting — Build Script                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. Verify all source files exist
echo "▶ Checking source files..."
for f in "${SOURCE_FILES[@]}"; do
  if [[ ! -f "$SRC_DIR/$f" ]]; then
    echo "  ❌ Missing: js/src/$f"
    exit 1
  fi
  lines=$(wc -l < "$SRC_DIR/$f")
  echo "  ✅ js/src/$f ($lines lines)"
done
echo ""

# 2. Concatenate JS sources
echo "▶ Concatenating sources..."
COMBINED_JS=$(mktemp)
for f in "${SOURCE_FILES[@]}"; do
  cat "$SRC_DIR/$f" >> "$COMBINED_JS"
done
COMBINED_LINES=$(wc -l < "$COMBINED_JS")
echo "  Combined JS: $COMBINED_LINES lines"
echo ""

# 3. Inject into HTML template
echo "▶ Building frontend/index.html..."
python3 << PYEOF
import sys

with open('$TEMPLATE') as f:
    template = f.read()

with open('$COMBINED_JS') as f:
    js_content = f.read()

# Strip exactly one trailing newline (template placeholder adds one already)
if js_content.endswith('\n'):
    js_content = js_content[:-1]

# Replace the placeholder with actual JS
output = template.replace('/* __BUILD_JS_PLACEHOLDER__ */', js_content)

if '/* __BUILD_JS_PLACEHOLDER__ */' in template and '/* __BUILD_JS_PLACEHOLDER__ */' not in output:
    print("  ✅ JS injected into template")
else:
    print("  ❌ Placeholder not found in template!", file=sys.stderr)
    sys.exit(1)

with open('$OUTPUT', 'w') as f:
    f.write(output)
PYEOF

rm "$COMBINED_JS"

# 4. Verify output
OUTPUT_LINES=$(wc -l < "$OUTPUT")
echo "  Output: frontend/index.html ($OUTPUT_LINES lines)"
echo ""

# 5. Quick sanity checks
echo "▶ Sanity checks..."
errors=0

checks=(
  "loadMonthlyFees"
  "mfOpenWA"
  "deleteFormationCase"
  "_vatRender"
  "loadHealthCheck"
  "_SL"
)

for check in "${checks[@]}"; do
  if grep -q "$check" "$OUTPUT"; then
    echo "  ✅ $check"
  else
    echo "  ❌ MISSING: $check"
    ((errors++))
  fi
done

echo ""
if [[ $errors -eq 0 ]]; then
  echo "✅ Build successful — frontend/index.html is ready"
else
  echo "❌ Build failed — $errors checks failed"
  exit 1
fi
