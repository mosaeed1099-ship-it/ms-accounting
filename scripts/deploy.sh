#!/usr/bin/env bash
# =============================================================================
# Deploy Script — MS Accounting
# الأمر الوحيد المسموح به للنشر. يمر بالترتيب:
#   1) build من js/src
#   2) pre_deploy_check
#   3) git commit + push
#
# Usage: bash scripts/deploy.sh "commit message"
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "❌ يجب تحديد رسالة الـ commit"
  echo "   Usage: bash scripts/deploy.sh \"وصف التغيير\""
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  MS Accounting — Deploy Pipeline                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build ─────────────────────────────────────
echo "▶ [1/3] Building from js/src..."
if ! bash scripts/build.sh; then
  echo ""
  echo "⛔ Build فشل — لا يتم النشر"
  exit 1
fi
echo ""

# ── Step 2: Pre-deploy checks ─────────────────────────
echo "▶ [2/3] Running pre_deploy_check..."
if ! bash .claude/pre_deploy_check.sh; then
  echo ""
  echo "⛔ Pre-deploy check فشل — لا يتم النشر"
  exit 1
fi
echo ""

# ── Step 3: Commit + Push ─────────────────────────────
echo "▶ [3/3] Committing and pushing..."
git add frontend/index.html js/src/
git diff --staged --quiet && { echo "⚠️  لا يوجد تغييرات للـ commit"; exit 0; }

git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push origin main
echo ""
echo "✅ Deploy pipeline اكتمل بنجاح"
