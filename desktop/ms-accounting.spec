# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for MS Accounting Desktop App
# Run from project root:  pyinstaller desktop/ms-accounting.spec

import os, sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

project_root = os.path.dirname(SPECPATH)
desktop_dir  = os.path.join(project_root, 'desktop')
backend_dir  = os.path.join(project_root, 'backend')

# ── Collect entire packages that PyInstaller often misses submodules for ──────
passlib_datas, passlib_bins, passlib_hidden = collect_all('passlib')
uvicorn_datas, uvicorn_bins, uvicorn_hidden = collect_all('uvicorn')

a = Analysis(
    [os.path.join(desktop_dir, 'launcher.py')],
    pathex=[backend_dir],
    binaries=passlib_bins + uvicorn_bins,
    datas=passlib_datas + uvicorn_datas + [
        # Bundle the entire backend directory inside the executable
        (backend_dir, 'backend'),
    ],
    hiddenimports=passlib_hidden + uvicorn_hidden + [
        # SQLAlchemy
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.postgresql',
        'sqlalchemy.ext.declarative',
        'sqlalchemy.orm',
        # FastAPI / Pydantic
        'fastapi', 'fastapi.middleware', 'fastapi.middleware.cors',
        'fastapi.staticfiles', 'fastapi.responses',
        'pydantic', 'pydantic_settings',
        # Security
        'jose', 'jose.jwt', 'jose.exceptions', 'jose.constants',
        'cryptography', 'cryptography.fernet',
        'cryptography.hazmat.primitives', 'cryptography.hazmat.backends',
        # Email
        'email.mime', 'email.mime.text', 'email.mime.multipart', 'email.mime.base',
        # Scheduler
        'apscheduler', 'apscheduler.schedulers.background',
        'apscheduler.triggers.interval', 'apscheduler.triggers.cron',
        # App modules (ensure all routers and models are included)
        'app', 'app.models', 'app.routers', 'app.core', 'app.database', 'app.config',
        'app.models.user', 'app.models.client', 'app.models.invoice',
        'app.models.task', 'app.models.document', 'app.models.tax',
        'app.models.activity', 'app.models.lead', 'app.models.quotation',
        'app.models.establishment', 'app.models.obligation', 'app.models.collection',
        'app.models.accounting', 'app.models.eta', 'app.models.settlement',
        'app.models.payroll', 'app.models.fixed_asset', 'app.models.postal',
        'app.models.statement', 'app.models.timesheet', 'app.models.client_contact',
        # Other deps
        'multipart', 'aiofiles', 'openpyxl', 'pandas', 'PIL', 'reportlab',
        'requests', 'httpx',
        # stdlib helpers sometimes missed
        'email.mime.nonmultipart', 'email.encoders',
        'multiprocessing.resource_tracker', 'multiprocessing.popen_fork',
        'multiprocessing.popen_spawn_posix',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'IPython', 'notebook', 'resend'],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ms_accounting_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,   # No terminal window (logs go to server.log via launcher.py)
    icon=os.path.join(desktop_dir, 'electron', 'assets', 'icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ms_accounting_server',
)
