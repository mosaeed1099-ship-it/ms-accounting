#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MS Accounting Desktop Builder — macOS / Linux
# Usage:
#   chmod +x desktop/build.sh
#   ./desktop/build.sh          # build for current OS
#   ./desktop/build.sh --win    # cross-compile for Windows (needs Wine on Linux)
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DESKTOP="$ROOT/desktop"
BACKEND="$ROOT/backend"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " MS Accounting Desktop Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Python backend → PyInstaller executable ───────────────────────────
echo ""
echo "📦 [1/4] Installing Python dependencies..."
pip3 install -q pyinstaller
pip3 install -q -r "$BACKEND/requirements.txt"

echo "🔨 [2/4] Building Python backend with PyInstaller..."
cd "$ROOT"
pyinstaller "$DESKTOP/ms-accounting.spec" \
    --distpath "$DESKTOP/backend-dist" \
    --workpath "$DESKTOP/build-tmp" \
    --noconfirm
echo "✅  Backend built → desktop/backend-dist/"

# ── Step 2: Generate icons (if Pillow available) ───────────────────────────────
echo ""
echo "🎨 [3/4] Generating icons..."
python3 "$DESKTOP/make_icons.py" 2>/dev/null || echo "⚠  Icon generation skipped (Pillow not installed)"

# ── Step 3: Electron → installer ──────────────────────────────────────────────
echo ""
echo "⚡ [4/4] Building Electron app..."
cd "$DESKTOP/electron"

if ! command -v node &>/dev/null; then
    echo "❌  Node.js not found. Install from https://nodejs.org/ and retry."
    exit 1
fi

npm install --silent

if [[ "$1" == "--win" ]]; then
    npm run build:win
elif [[ "$(uname)" == "Darwin" ]]; then
    npm run build:mac
else
    npm run build:linux
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  Build complete!"
echo "📁  Installer → dist/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
