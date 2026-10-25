import re
import base64
import os
import struct

def main():
    svg_path = 'frontend/public/favicon.svg'
    out_dir = 'desktop/assets'
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, 'icon.png')
    out_ico = os.path.join(out_dir, 'icon.ico')

    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    match = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', svg_content)
    if not match:
        print('PNG base64 not found in favicon.svg')
        return

    png_bytes = base64.b64decode(match.group(1))
    with open(out_png, 'wb') as f:
        f.write(png_bytes)
    print(f'Wrote {out_png} ({len(png_bytes)} bytes)')

    # Create a valid Windows .ico file containing the PNG directly (Vista+ standard)
    # ICONDIR: idReserved (2), idType (2 = 1 for icon), idCount (2 = 1)
    # ICONDIRENTRY: bWidth (1), bHeight (1), bColorCount (1), bReserved (1),
    #               wPlanes (2), wBitCount (2), dwBytesInRes (4), dwImageOffset (4)
    # Width 0 means 256px
    icondir = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png_bytes), 6 + 16)
    with open(out_ico, 'wb') as f:
        f.write(icondir + entry + png_bytes)
    print(f'Wrote {out_ico} ({os.path.getsize(out_ico)} bytes)')

if __name__ == '__main__':
    main()
