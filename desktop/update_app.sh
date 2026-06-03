#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# MS Accounting – تحديث شامل للموقع والبرنامج
# الاستخدام:  ./desktop/update_app.sh
# ══════════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo ""
echo "══════════════════════════════════════════"
echo "  MS Accounting – تحديث شامل"
echo "══════════════════════════════════════════"

# ─── 1. سحب أحدث كود من GitHub ────────────────────────────────────────────────
echo ""
echo "[1/4] 📥 سحب أحدث إصدار من GitHub..."
git pull origin main
echo "✅ الكود محدّث"

# ─── 2. رفع إلى Railway (تحديث الموقع) ───────────────────────────────────────
echo ""
echo "[2/4] 🚀 الموقع يتحدث تلقائياً عبر Railway..."
echo "      (أي push يحدث الموقع فوراً)"

# ─── 3. بناء PyInstaller bundle (بس لو الـ backend اتغير) ─────────────────────
BACKEND_CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep "^backend/" | wc -l | tr -d ' ')
SPEC_CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep "^desktop/.*\.spec$\|^desktop/launcher\.py" | wc -l | tr -d ' ')

if [ "$BACKEND_CHANGED" -gt 0 ] || [ "$SPEC_CHANGED" -gt 0 ] || [ ! -f "desktop/backend-dist/ms_accounting_server/ms_accounting_server" ]; then
    echo ""
    echo "[3/4] 🔨 Backend اتغير — إعادة بناء PyInstaller (~5 دقائق)..."
    pip3 install -q -r backend/requirements.txt apscheduler
    pyinstaller desktop/ms-accounting.spec \
        --distpath desktop/backend-dist \
        --workpath desktop/build-tmp \
        --noconfirm
    echo "✅ Backend bundle محدّث"
else
    echo ""
    echo "[3/4] ⏭️  Backend لم يتغير — تخطي إعادة البناء (توفير وقت)"
fi

# ─── 4. بناء Electron .dmg وتثبيته ──────────────────────────────────────────
echo ""
echo "[4/4] ⚡ بناء البرنامج الجديد..."

# نوع الـ Mac
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    BUILD_CMD="build:mac"
    DMG_PATTERN="*-arm64.dmg"
else
    BUILD_CMD="build:mac"
    DMG_PATTERN="MS Accounting-*.dmg"
    # Exclude arm64 for x64 Mac
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$ROOT/desktop/electron"
npm install --silent
npm run $BUILD_CMD

# تثبيت التطبيق
echo ""
echo "📲 تثبيت البرنامج الجديد..."

# إيقاف النسخة القديمة
pkill -f "MS Accounting" 2>/dev/null || true
sleep 2

# اختيار الـ DMG المناسب
if [ "$ARCH" = "arm64" ]; then
    DMG=$(ls "$ROOT/dist/"*arm64*.dmg 2>/dev/null | head -1)
else
    DMG=$(ls "$ROOT/dist/"*.dmg 2>/dev/null | grep -v arm64 | head -1)
fi

if [ -z "$DMG" ]; then
    echo "❌ لم يتم إيجاد ملف DMG"
    exit 1
fi

echo "📦 تثبيت من: $DMG"
hdiutil attach "$DMG" -nobrowse -quiet
VOLUME=$(ls /Volumes/ | grep "MS Accounting")
rm -rf "/Applications/MS Accounting.app"
cp -R "/Volumes/$VOLUME/MS Accounting.app" /Applications/
xattr -cr "/Applications/MS Accounting.app"
hdiutil detach "/Volumes/$VOLUME" -quiet

# تشغيل البرنامج المحدث
open "/Applications/MS Accounting.app"

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ التحديث اكتمل بنجاح!"
echo ""
echo "  🌐 الموقع: يتحدث تلقائياً عند كل push"
echo "  💻 البرنامج: محدّث ومشغّل"
echo "══════════════════════════════════════════"
echo ""
