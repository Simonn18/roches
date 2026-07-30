#!/usr/bin/env python3
"""
Enlève le fond sombre des images de pièces et/ou change leur couleur.
À lancer depuis la racine du projet :

    python3 scripts/remove_black_bg.py          # enlever le fond noir
    python3 scripts/remove_black_bg.py --recolor  # enlever fond + changer couleur

Après chaque run, incrémente SPRITE_VERSION dans render.js pour que
le navigateur recharge les nouvelles images.
"""
from PIL import Image
import os
import re
import sys

PIECES_DIR = os.path.join(os.path.dirname(__file__), '..', 'game', 'assets', 'pieces')
RENDER_JS = os.path.join(os.path.dirname(__file__), '..', 'game', 'src', 'render.js')

THRESHOLD = 55          # pixels avec R,G,B tous < 55 → fond (sera rendu transparent)
RECOLOR_TO = (255, 255, 255)  # couleur cible pour l'option --recolor


def remove_black_background(img_path, output_path=None, threshold=THRESHOLD):
    """Rend transparents tous les pixels sombres (fond quasi-noir)."""
    img = Image.open(img_path).convert('RGBA')
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < threshold and g < threshold and b < threshold:
                pixels[x, y] = (r, g, b, 0)

    out = output_path or img_path
    img.save(out, 'PNG')
    return img


def recolor_pieces(img_path, output_path=None, new_color=RECOLOR_TO):
    """
    Change la couleur des pixels non-transparents (la pièce elle-même)
    vers la couleur cible, en préservant la luminosité relative.
    """
    img = Image.open(img_path).convert('RGBA')
    pixels = img.load()
    w, h = img.size

    nr, ng, nb = new_color

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue  # ne pas toucher au fond transparent
            # On remplace la teinte mais on garde la luminosité pour préserver
            # les ombres et reflets. La pièce prend la nouvelle couleur.
            brightness = (r + g + b) / 3
            factor = brightness / 255
            pixels[x, y] = (
                int(nr * factor),
                int(ng * factor),
                int(nb * factor),
                a
            )

    out = output_path or img_path
    img.save(out, 'PNG')
    return img


def bump_sprite_version():
    """Incrémente SPRITE_VERSION dans render.js pour invalider le cache navigateur."""
    if not os.path.exists(RENDER_JS):
        print("  ⚠ render.js introuvable, SPRITE_VERSION non modifié")
        return
    with open(RENDER_JS, 'r') as f:
        content = f.read()
    match = re.search(r'const SPRITE_VERSION = (\d+);', content)
    if not match:
        print("  ⚠ SPRITE_VERSION introuvable dans render.js")
        return
    old = int(match.group(1))
    new = old + 1
    content = content.replace(
        f'const SPRITE_VERSION = {old};',
        f'const SPRITE_VERSION = {new};'
    )
    with open(RENDER_JS, 'w') as f:
        f.write(content)
    print(f"  ✓ SPRITE_VERSION: {old} → {new}")


def main():
    do_recolor = '--recolor' in sys.argv

    if not os.path.isdir(PIECES_DIR):
        print(f"Dossier introuvable : {PIECES_DIR}")
        sys.exit(1)

    pngs = sorted(f for f in os.listdir(PIECES_DIR) if f.lower().endswith('.png'))
    if not pngs:
        print("Aucun PNG trouvé.")
        return

    print(f"Seuil fond noir : R,G,B < {THRESHOLD} → transparent")
    if do_recolor:
        print(f"Recolorisation  : pièces → RGB{RECOLOR_TO}")
    print(f"Fichiers ({len(pngs)}) :")

    for f in pngs:
        path = os.path.join(PIECES_DIR, f)
        remove_black_background(path)
        if do_recolor:
            # Crée un nouveau fichier -2.png (ex: cavalier-1.png → cavalier-1-2.png)
            out_name = f.rsplit('.', 1)[0] + '-2.png'
            out_path = os.path.join(PIECES_DIR, out_name)
            recolor_pieces(path, out_path)
            print(f"  ✓ {f}  +  {out_name}")
        else:
            print(f"  ✓ {f}")

    bump_sprite_version()
    print("\nTerminé. SPRITE_VERSION auto-incrémenté, recharger le navigateur.")


if __name__ == '__main__':
    main()
