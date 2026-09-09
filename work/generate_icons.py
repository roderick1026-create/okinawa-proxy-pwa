from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
icons = root / "icons"
icons.mkdir(exist_ok=True)

def make_icon(size, filename, safe=False):
    image = Image.new("RGB", (size, size), "#17324d")
    draw = ImageDraw.Draw(image)
    margin = int(size * (0.18 if safe else 0.10))
    draw.rounded_rectangle((margin, margin, size-margin, size-margin), radius=int(size*.18), fill="#fbf7ef")
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", int(size*.43))
        text = "🇯🇵"
    except OSError:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(size*.36))
        text = "JP"
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((size-(box[2]-box[0]))/2, (size-(box[3]-box[1]))/2-box[1]), text, font=font, fill="#17324d", embedded_color=True)
    image.save(icons / filename, "PNG", optimize=True)

make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(512, "icon-maskable-512.png", safe=True)
