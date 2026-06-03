"""
MS Accounting Desktop Launcher
Entry point for PyInstaller bundle.
Sets up paths, SQLite DB, and starts FastAPI server.
"""
import sys
import os
import multiprocessing
import logging

# Required for PyInstaller on Windows
multiprocessing.freeze_support()

# ─── Resolve paths ────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller bundle
    BUNDLE_DIR = sys._MEIPASS
    BACKEND_DIR = os.path.join(BUNDLE_DIR, 'backend')
else:
    # Running in development (python desktop/launcher.py)
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    BACKEND_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), 'backend')

sys.path.insert(0, BACKEND_DIR)

# ─── Data directory (persists between app launches) ───────────────────────────
DATA_DIR = os.environ.get(
    'MS_DATA_DIR',
    os.path.join(os.path.expanduser('~'), '.ms-accounting')
)
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH    = os.path.join(DATA_DIR, 'ms-accounting.db')
UPLOAD_DIR = os.path.join(DATA_DIR, 'uploads')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

# ─── Environment variables (set BEFORE importing app modules) ─────────────────
os.environ.setdefault('DESKTOP_MODE',  '1')
os.environ.setdefault('DATABASE_URL',  f'sqlite:///{DB_PATH}')
os.environ.setdefault('UPLOAD_DIR',    UPLOAD_DIR)
os.environ.setdefault('BACKUP_DIR',    BACKUP_DIR)
os.environ.setdefault('SECRET_KEY',    'ms-accounting-desktop-secret-2024-xK9m')
os.environ.setdefault('DEBUG',         'false')

PORT = int(os.environ.get('PORT', '8765'))

# ─── File logging (critical for PyInstaller bundles with console=False) ────────
LOG_FILE = os.path.join(DATA_DIR, 'server.log')
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
_log = logging.getLogger('launcher')

def _redirect_stdio():
    """Redirect stdout/stderr to log file (needed with console=False)."""
    try:
        import io
        log_fh = open(LOG_FILE, 'a', buffering=1, encoding='utf-8')
        sys.stdout = log_fh
        sys.stderr = log_fh
    except Exception:
        pass

def main():
    _redirect_stdio()
    _log.info(f"Launcher started. BACKEND_DIR={BACKEND_DIR}")
    _log.info(f"sys.path[0]={sys.path[0]}")
    _log.info(f"Starting server on http://127.0.0.1:{PORT}")
    _log.info(f"Database: {DB_PATH}")
    try:
        import uvicorn
        _log.info("uvicorn imported OK")
        print(f"[MS Accounting] Starting on http://127.0.0.1:{PORT}")
        print(f"[MS Accounting] Database: {DB_PATH}")
        uvicorn.run(
            'main:app',
            host='127.0.0.1',
            port=PORT,
            log_level='info',
            access_log=False,
        )
    except Exception as e:
        _log.exception(f"Server crashed: {e}")
        raise


if __name__ == '__main__':
    main()
