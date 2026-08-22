from PIL import Image, ImageDraw
import math

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# Fundo: quadrado arredondado com degrade roxo -> ciano, igual ao logo do site.
grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
top = (124, 58, 237)  # #7c3aed primary
bottom = (34, 211, 238)  # #22d3ee accent
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = round(top[0] + (bottom[0] - top[0]) * t)
    g = round(top[1] + (bottom[1] - top[1]) * t)
    b = round(top[2] + (bottom[2] - top[2]) * t)
    ImageDraw.Draw(grad).line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

mask = Image.new("L", (SIZE, SIZE), 0)
radius = int(SIZE * 0.22)
ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (SIZE - 1, SIZE - 1)], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# Icone: circulo com "raios" (o mesmo desenho usado no favicon da landing page).
draw = ImageDraw.Draw(img)
cx, cy = SIZE // 2, SIZE // 2
r_circle = SIZE * 0.15
stroke = int(SIZE * 0.045)
white = (255, 255, 255, 255)

draw.ellipse([cx - r_circle, cy - r_circle, cx + r_circle, cy + r_circle], outline=white, width=stroke)

ray_inner = SIZE * 0.22
ray_outer = SIZE * 0.32
for angle_deg in range(0, 360, 45):
    angle = math.radians(angle_deg)
    x1 = cx + ray_inner * math.cos(angle)
    y1 = cy + ray_inner * math.sin(angle)
    x2 = cx + ray_outer * math.cos(angle)
    y2 = cy + ray_outer * math.sin(angle)
    draw.line([(x1, y1), (x2, y2)], fill=white, width=stroke)

sizes = [16, 24, 32, 48, 64, 128, 256]
img.save("icon.ico", sizes=[(s, s) for s in sizes])
img.resize((512, 512), Image.LANCZOS).save("icon.png")
print("done")
