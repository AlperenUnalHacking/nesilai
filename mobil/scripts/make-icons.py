# NesilAI uygulama ikonu üretici
# mobil/logo.png dosyasını launcher ikonları olarak (olduğu gibi, köşeler dosyadan)
# tüm yoğunluklara üretir. Splash ekranlarını da koyu tema arka planıyla üretir.
# Kullanım: mobil/ klasöründen  ->  python scripts/make-icons.py
from PIL import Image
import os, sys

# Klasik launcher ikon boyutlari (px)
SIZES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}


def sq_crop(src):
    """Logoyu merkezden kare olarak kirpar (dikdortgen ise)."""
    w, h = src.size
    side = min(w, h)
    return src.crop(((w - side) // 2, (h - side) // 2,
                     (w + side) // 2, (h + side) // 2))


def main():
    mobil_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_path = os.path.join(mobil_root, 'logo.png')
    res_dir = os.path.join(mobil_root, 'android', 'app', 'src', 'main', 'res')

    if not os.path.exists(src_path):
        sys.exit('HATA: ' + src_path + ' bulunamadi')

    src = Image.open(src_path).convert('RGBA')
    logo = sq_crop(src)

    # 1) Launcher ikonlari: logo oldugu gibi (koseler dosyanin kendisinden gelir)
    for density, size in SIZES.items():
        icon = logo.resize((size, size), Image.LANCZOS)
        out_dir = os.path.join(res_dir, 'mipmap-' + density)
        os.makedirs(out_dir, exist_ok=True)
        icon.save(os.path.join(out_dir, 'ic_launcher.png'))
        icon.save(os.path.join(out_dir, 'ic_launcher_round.png'))
        print('uretildi: mipmap-%s (%dpx)' % (density, size))

    # 2) Acilis ekrani (splash): koyu tema arka plani (#0a0a0d) + ortada logo
    BG = (10, 10, 13, 255)  # --bg: #0a0a0d
    splash_sets = {
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480),
        'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960),
        'drawable-land-xxxhdpi': (1920, 1280),
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
    }
    for folder, (w, h) in splash_sets.items():
        splash = Image.new('RGBA', (w, h), BG)
        logo_size = min(w, h) // 4
        logo_scaled = logo.resize((logo_size, logo_size), Image.LANCZOS)
        off = ((w - logo_size) // 2, (h - logo_size) // 2)
        splash.paste(logo_scaled, off, logo_scaled)
        out_dir = os.path.join(res_dir, folder)
        os.makedirs(out_dir, exist_ok=True)
        splash.convert('RGB').save(os.path.join(out_dir, 'splash.png'))
        print('uretildi: %s (%dx%d)' % (folder, w, h))

    print('ikonlar hazir OK')


if __name__ == '__main__':
    main()
