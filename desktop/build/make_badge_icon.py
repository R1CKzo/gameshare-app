from PIL import Image, ImageDraw

base = Image.open("icon.png").convert("RGBA")
size = base.size[0]
badge = base.copy()
draw = ImageDraw.Draw(badge)

# Ponto de notificacao no canto superior direito, mesma posicao usada pelos
# badges de nao-lido no proprio site (ServerRail/DMSidebar: -right/-top).
r = size * 0.20
cx = size - r * 1.05
cy = r * 1.05

border = r * 1.22
draw.ellipse([cx - border, cy - border, cx + border, cy + border], fill=(8, 9, 13, 255))
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(239, 68, 68, 255))

sizes = [16, 24, 32, 48, 64, 128, 256]
badge.save("icon-badge.ico", sizes=[(s, s) for s in sizes])
print("done")
