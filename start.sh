#!/bin/bash
set -e

echo "🚀 MS Accounting System - بدء التشغيل..."

# ── Backend ──
echo "📦 تثبيت dependencies الـ Backend..."
cd backend

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "✅ Backend جاهز — بدء التشغيل على http://localhost:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cd ..

# ── Frontend ──
echo "📦 تثبيت dependencies الـ Frontend..."
cd frontend

# Install Node if needed via nvm or direct
if command -v npm &> /dev/null; then
    npm install -q
    echo "✅ Frontend جاهز — بدء التشغيل على http://localhost:5173"
    npm run dev &
    FRONTEND_PID=$!
else
    echo "⚠️  npm غير موجود — شغّل الـ Frontend يدويًا:"
    echo "   cd frontend && npm install && npm run dev"
fi

cd ..

echo ""
echo "════════════════════════════════════════"
echo "  MS Accounting System — Running!"
echo "  Backend API:  http://localhost:8000"
echo "  Frontend App: http://localhost:5173"
echo "  API Docs:     http://localhost:8000/docs"
echo "  Login:        admin@ms-accounting.com"
echo "  Password:     Admin@123"
echo "════════════════════════════════════════"

wait $BACKEND_PID
