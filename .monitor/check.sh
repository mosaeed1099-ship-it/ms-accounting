#!/bin/bash
# MS Accounting — Silent Monitor & Auto-Fix
# Runs every 30 min via crontab

REPO="/Users/render/ms-accounting"
SITE="https://mosaeed1099-ship-it.github.io/ms-accounting/"
API="https://ms-accounting-api-production.up.railway.app/health"
LOG="$REPO/.monitor/monitor.log"
MAX_LOG=500  # lines to keep

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

# ── 1. GitHub Pages check ──────────────────────────────
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$SITE" 2>/dev/null)

if [ "$CODE" = "200" ]; then
  log "GH:OK"
else
  log "GH:ERROR($CODE) — fixing..."
  cd "$REPO" || exit 1
  git subtree split --prefix frontend -b gh-pages-deploy >> "$LOG" 2>&1 \
    && git push origin gh-pages-deploy:gh-pages --force >> "$LOG" 2>&1 \
    && git branch -D gh-pages-deploy >> "$LOG" 2>&1 \
    && log "GH:FIXED ✅" \
    || log "GH:FIX_FAILED ❌"
fi

# ── 2. Railway API check ───────────────────────────────
RESULT=$(curl -s --max-time 30 "$API" 2>/dev/null)

if echo "$RESULT" | grep -q '"ok"'; then
  log "API:OK"
else
  log "API:WARN — response: $RESULT"
fi

# ── Keep log small ─────────────────────────────────────
if [ -f "$LOG" ]; then
  tail -n $MAX_LOG "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
