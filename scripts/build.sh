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
  "01-infrastructure.js"    # API + auth + shell + navigate (1841 lines)
  "02-dashboard.js"         # Dashboard (601 lines)
  "03-clients.js"           # Clients (634 lines)
  "04-invoices.js"          # Invoices (320 lines)
  "05-tasks.js"             # Tasks (816 lines)
  "06-documents.js"         # Documents (600 lines)
  "07-vat.js"               # VAT / Tax (2429 lines)
  "08-crm.js"               # CRM / Leads (1379 lines)
  "09-formation.js"         # Formation (565 lines)
  "10-obligations.js"       # Obligations (969 lines)
  "11-rest.js"              # Remaining pages (10486 lines)
  "02-monthly-fees.js"      # Monthly Fees module (918 lines)
  "03-tail.js"              # Tail / language / daily-revenues (1246 lines)
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

# 5. Module-scope inline handler guard
# Catches: onXXX="varName=value" where varName directly assigns a module-scope variable
# Known dangerous patterns that must use window.setter instead
echo "▶ Module-scope inline handler guard..."
# Pattern: on*="_varName=value" — underscore-prefixed var directly assigned in inline handler
# Safe window setters are excluded by name prefix (_stlSet, _taskSet, _taskClear, _docSet, _docGo, _invItems)
MODULE_SCOPE_VIOLATIONS=$(grep -nE \
  'on(change|click|input|submit|keyup|keydown)="[^"]*_[a-zA-Z][a-zA-Z0-9_]*=[^=(]' \
  "$SRC_DIR"/{01-infrastructure,02-dashboard,02-monthly-fees,03-clients,03-tail,04-invoices,05-tasks,06-documents,07-vat,08-crm,09-formation,10-obligations,11-rest}.js \
  2>/dev/null \
  | grep -vE '(_stlSet|_taskSet|_taskClear|_docSet|_docGo|_invItems|window\._|oblDays)' \
  || true)

if [[ -n "$MODULE_SCOPE_VIOLATIONS" ]]; then
  echo "  ❌ Inline event handler writes module variable directly:"
  echo "$MODULE_SCOPE_VIOLATIONS" | head -10
  exit 1
else
  echo "  ✅ No direct module-variable assignments in inline handlers"
fi
echo ""

# 6. Quick sanity checks
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
