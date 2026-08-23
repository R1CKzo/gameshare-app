from PIL import Image, ImageDraw

# Ponto vermelho isolado (fundo transparente) pro overlay do icone da
# barra de tarefas do Windows (BrowserWindow.setOverlayIcon) — diferente do
# icon-badge.ico, que e o logo inteiro com o ponto desenhado em cima (usado
# como icone completo da bandeja do sistema).
SIZE = 128
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
r = SIZE * 0.40
cx = cy = SIZE / 2
draw.ellipse(
    [cx - r, cy - r, cx + r, cy + r],
    fill=(239, 68, 68, 255),
    outline=(8, 9, 13, 255),
    width=int(SIZE * 0.07),
)
img.save("dot-badge.png")
print("done")
