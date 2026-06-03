# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for MS Accounting Desktop App
# Run from project root:  pyinstaller desktop/ms-accounting.spec

import os, sys

project_root = os.path.dirname(SPECPATH)
desktop_dir  = os.path.join(project_root, 'desktop')
backend_dir  = os.path.join(project_root, 'backend')

a = Analysis(
    [os.path.join(desktop_dir, 'launcher.py')],
    pathex=[backend_dir],
    binaries=[],
    datas=[
        # Bundle the entire backend directory inside the executable
        (backend_dir, 'backend'),
    ],
    hiddenimports=[
        # Uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.loops.uvloop',
        'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
        # SQLAlchemy dialects
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.postgresql',
        'sqlalchemy.ext.declarative',
        'sqlalchemy.orm',
        # FastAPI / Pydantic
        'fastapi', 'fastapi.middleware', 'fastapi.middleware.cors',
        'fastapi.staticfiles', 'fastapi.responses',
        'pydantic', 'pydantic_settings',
        # Security
        'passlib.handlers.bcrypt', 'passlib.handlers.sha2_crypt',
        'jose', 'jose.jwt', 'jose.exceptions',
        'cryptography',
        # Email
        'email.mime', 'email.mime.text', 'email.mime.multipart', 'email.mime.base',
        # Scheduler
        'apscheduler', 'apscheduler.schedulers.background',
        'apscheduler.triggers.interval', 'apscheduler.triggers.cron',
        # App modules (ensure all routers and models are included)
        'app.models', 'app.routers', 'app.core', 'app.database', 'app.config',
        'app.models.user', 'app.models.client', 'app.models.invoice',
        'app.models.task', 'app.models.document', 'app.models.tax',
        'app.models.activity', 'app.models.lead', 'app.models.quotation',
        'app.models.establishment', 'app.models.obligation', 'app.models.collection',
        'app.models.accounting', 'app.models.eta', 'app.models.settlement',
        'app.models.payroll', 'app.models.fixed_asset', 'app.models.postal',
        'app.models.statement', 'app.models.timesheet', 'app.models.client_contact',
        # Other
        'multipart', 'aiofiles', 'resend', 'openpyxl', 'pandas', 'PIL', 'reportlab',
        'requests', 'httpx',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'IPython', 'notebook'],
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
    console=False,   # No terminal window (set True for debugging)
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
