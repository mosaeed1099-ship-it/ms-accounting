"""
Generate placeholder app icons for MS Accounting.
Run once: python desktop/make_icons.py
Requires: pip install pillow
"""
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Install Pillow: pip install pillow")
    raise

OUT = Path(__file__).parent / 'electron' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)


def draw_icon(size):
    """Draw the MS Accounting icon at the given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded background
    r = size // 8
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=r,
                            fill=(26, 36, 114))  # #1a2472

    # White "MS" text
    try:
        font_size = size // 3
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
    except Exception:
        font = ImageFont.load_default()

    text = 'MS'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255))

    # Small "A" for Accounting
    try:
        sm_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size // 6)
    except Exception:
        sm_font = font

    sub = 'Accounting'
    bbox2 = draw.textbbox((0, 0), sub, font=sm_font)
    sw = bbox2[2] - bbox2[0]
    draw.text(((size - sw) // 2 - bbox2[0], ty + th + 2), sub,
              font=sm_font, fill=(100, 200, 255))

    return img


# ─── PNG variants ──────────────────────────────────────────────────────────────
for sz, name in [(512, 'icon.png'), (32, 'icon-tray.png'), (256, 'icon-256.png')]:
    img = draw_icon(sz)
    img.save(OUT / name, 'PNG')
    print(f'✅  {OUT / name}')

# ─── .ico (Windows) ────────────────────────────────────────────────────────────
ico_imgs = [draw_icon(s) for s in (256, 128, 64, 48, 32, 16)]
ico_imgs[0].save(OUT / 'icon.ico', format='ICO',
                 sizes=[(s, s) for s in (256, 128, 64, 48, 32, 16)],
                 append_images=ico_imgs[1:])
print(f'✅  {OUT / "icon.ico"}')

# ─── .icns (macOS) — save as PNG, rename; proper .icns needs iconutil ─────────
draw_icon(512).save(OUT / 'icon.icns.png', 'PNG')
print(f'ℹ️   {OUT / "icon.icns.png"}  → rename to icon.icns or run:')
print('     python desktop/make_icons.py  # then iconutil on macOS if needed')

# ─── DMG background placeholder ──────────────────────────────────────────────
bg = Image.new('RGBA', (540, 380), (241, 245, 249))
d = ImageDraw.Draw(bg)
d.text((140, 180), 'MS Accounting', fill=(26, 36, 114))
bg.save(OUT / 'dmg-background.png', 'PNG')
print(f'✅  {OUT / "dmg-background.png"}')

print('\nAll icons generated. Replace with high-quality artwork before shipping.')
