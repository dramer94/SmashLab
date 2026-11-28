import json, subprocess, sys
from PIL import Image, ImageDraw
video, data_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(data_json))
labels = {'far0': 'Far 1', 'far1': 'Far 2', 'near0': 'Near 1', 'near1': 'Near 2'}
rows = []
for key in ['far0', 'far1', 'near0', 'near1']:
    tiles = []
    for p in d['picks'][key]:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(p['t']), '-i', video, '-frames:v', '1', 'ww.png'])
        im = Image.open('ww.png').convert('RGB')
        h = p['h']; w = h * 0.7
        box = (int(p['x'] - w / 2), int(p['y'] - h * 0.95), int(p['x'] + w / 2), int(p['y'] + h * 0.08))
        tiles.append(im.crop(box).resize((140, 210)))
    rows.append((key, tiles))
W = 200 + 140 * 4
img = Image.new('RGB', (W, 220 * len(rows)), (15, 18, 30)); dr = ImageDraw.Draw(img)
for r, (key, tiles) in enumerate(rows):
    y = r * 220
    side, slot = key[:-1], int(key[-1])
    col = (d.get('colors') or {}).get(side, [None, None])[slot]
    dr.text((10, y + 70), labels[key], fill=(255, 255, 255))
    if col:
        dr.rectangle([10, y + 95, 60, y + 135], fill=col, outline=(255, 255, 255))
        dr.text((70, y + 108), 'shirt', fill=(180, 180, 180))
    for i, t in enumerate(tiles):
        img.paste(t, (200 + i * 140, y + 5))
img.save(out)
