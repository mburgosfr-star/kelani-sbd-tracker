from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "marketing"

BLACK = (5, 5, 5)
PANEL = (16, 14, 12)
PANEL_2 = (24, 20, 16)
WHITE = (248, 248, 248)
MUTED = (166, 166, 166)
YELLOW = (250, 204, 21)
ORANGE = (249, 115, 22)
LINE = (82, 62, 22)

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def add_noise_gradient(img):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    w, h = img.size
    d.ellipse((-280, -260, 520, 520), fill=(250, 204, 21, 28))
    d.ellipse((w - 520, h - 420, w + 260, h + 280), fill=(249, 115, 22, 22))
    d.rectangle((0, h - 5, w, h), fill=(250, 204, 21, 130))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def paste_contained(canvas, img_path, box):
    if not img_path.exists():
        return
    img = Image.open(img_path).convert("RGBA")
    target = (box[2] - box[0], box[3] - box[1])
    img = ImageOps.contain(img, target, Image.Resampling.LANCZOS)
    x = box[0] + (target[0] - img.width) // 2
    y = box[1] + (target[1] - img.height) // 2
    canvas.alpha_composite(img, (x, y))

def draw_logo(canvas, box):
    paste_contained(canvas, ROOT / "public" / "kelani-banner.png", box)

def feature_panel(canvas, x, y, w, h):
    draw = ImageDraw.Draw(canvas)
    rounded(draw, (x, y, x + w, y + h), 34, PANEL, LINE, 2)

    heading_font = font(31, True)
    item_font = font(25, False)
    draw.text((x + 42, y + 40), "Train independently.", font=heading_font, fill=WHITE)
    draw.text((x + 42, y + 82), "Do not train blindly.", font=heading_font, fill=YELLOW)

    items = [
        ("Adaptive SBD programming", ORANGE),
        ("Offline-first and private", YELLOW),
        ("No account or subscription", WHITE),
        ("Meet planning and readiness", ORANGE),
    ]
    item_y = y + 168
    for label, color in items:
        draw.ellipse((x + 44, item_y + 9, x + 58, item_y + 23), fill=color)
        draw.text((x + 78, item_y), label, font=item_font, fill=WHITE)
        item_y += 62

def chips(draw, x, y, labels, chip_font):
    for label in labels:
        bbox = draw.textbbox((0, 0), label, font=chip_font)
        cw = bbox[2] - bbox[0] + 34
        ch = bbox[3] - bbox[1] + 20
        rounded(draw, (x, y, x + cw, y + ch), 18, (12, 12, 12), LINE, 1)
        draw.text((x + 17, y + 9), label, font=chip_font, fill=YELLOW)
        x += cw + 12

def social(size, out_name, linkedin=False):
    w, h = size
    canvas = Image.new("RGBA", size, BLACK + (255,))
    canvas = add_noise_gradient(canvas)
    draw = ImageDraw.Draw(canvas)

    margin = int(w * 0.065)
    logo_h = int(h * 0.13)
    draw_logo(canvas, (margin, int(h * 0.105), margin + int(w * 0.22), int(h * 0.105) + logo_h))

    title_font = font(56 if w >= 1280 else 52, True)
    sub_font = font(27 if w >= 1280 else 25, False)
    chip_font = font(22, True)

    y = int(h * 0.32)
    title = "Offline-first\npowerlifting tracker"
    for line in title.split("\n"):
        draw.text((margin, y), line, font=title_font, fill=WHITE)
        y += int(h * 0.105)

    y += int(h * 0.015)
    draw.text((margin, y), "Structured Squat · Bench Press · Deadlift training", font=sub_font, fill=MUTED)
    y += int(h * 0.085)
    chips(draw, margin, y, ["Free", "Open source", "No ads", "No tracking"], chip_font)

    panel_x = int(w * 0.59)
    panel_y = int(h * 0.17)
    feature_panel(canvas, panel_x, panel_y, int(w * 0.36), int(h * 0.66))

    canvas.convert("RGB").save(OUT / out_name, quality=95)

def youtube_banner():
    w, h = 2560, 1440
    canvas = Image.new("RGBA", (w, h), BLACK + (255,))
    draw = ImageDraw.Draw(canvas)

    # Very restrained brand background.
    draw.ellipse((-360, -360, 560, 560), fill=(250, 204, 21, 22))
    draw.ellipse((w - 520, h - 420, w + 220, h + 220), fill=(249, 115, 22, 16))
    draw.rectangle((0, h - 6, w, h), fill=(250, 204, 21, 110))

    # YouTube safe area. Keep the real banner content here.
    safe_w, safe_h = 1546, 423
    safe_x = (w - safe_w) // 2
    safe_y = (h - safe_h) // 2

    # Centered, simple identity.
    logo_w = 660
    logo_h = 184
    logo_y = safe_y + 8
    draw_logo(canvas, (
        safe_x + (safe_w - logo_w) // 2,
        logo_y,
        safe_x + (safe_w + logo_w) // 2,
        logo_y + logo_h,
    ))

    title_font = font(76, True)
    sub_font = font(34, False)

    title = "Kelani SBD Tracker"
    subtitle = "Offline-first powerlifting tools for structured progress"

    tb = draw.textbbox((0, 0), title, font=title_font)
    sb = draw.textbbox((0, 0), subtitle, font=sub_font)

    title_x = safe_x + (safe_w - (tb[2] - tb[0])) // 2
    sub_x = safe_x + (safe_w - (sb[2] - sb[0])) // 2

    draw.text((title_x, safe_y + 218), title, font=title_font, fill=WHITE)
    draw.text((sub_x, safe_y + 314), subtitle, font=sub_font, fill=MUTED)

    # Thin brand underline.
    line_w = 520
    line_x = safe_x + (safe_w - line_w) // 2
    rounded(draw, (line_x, safe_y + 374, line_x + line_w, safe_y + 380), 3, YELLOW)

    canvas.convert("RGB").save(OUT / "youtube-channel-banner.png", quality=95)


social((1280, 640), "github-social-preview.png")
social((1200, 627), "linkedin-kelani-preview.png", linkedin=True)
youtube_banner()

(OUT / "README.md").write_text("""# Kelani marketing assets

Generated visual assets for Kelani public project spaces.

- `github-social-preview.png` — GitHub repository social preview.
- `linkedin-kelani-preview.png` — LinkedIn post/link image.
- `youtube-channel-banner.png` — YouTube channel banner.

These images use public Kelani brand assets and contain no personal training data.
""")

print("Generated marketing assets")
for name in ["github-social-preview.png", "linkedin-kelani-preview.png", "youtube-channel-banner.png"]:
    path = OUT / name
    print(path, Image.open(path).size)
