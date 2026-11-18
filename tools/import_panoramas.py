"""把你自己保存（或向原作者要来）的全景照片导入本地素材包，页面只读本地文件，不连 720 云。

用法：
    python -B tools/import_panoramas.py <素材文件夹>      导入并刷新清单
    python -B tools/import_panoramas.py                   只刷新清单（扫描 dist/assets/pano）
    python -B tools/import_panoramas.py --list            列出还缺照片的场景（编号 + 名称）

素材文件夹里每个场景放下面任意一种（<场景> 可以是场景编号，如 15468040，也可以是场景名，如 图书馆）：
    <场景>.jpg / .png / .webp          一张 2:1 的全景展开图（等距柱状投影）
    <场景>/ 目录，内含六个面           文件名里带 _f _r _b _l _u _d（如 mobile_f.jpg），或直接叫 f.jpg … d.jpg

输出：dist/assets/pano/<编号>/{f,r,b,l,u,d}.webp（1024 像素）+ thumb.webp，以及清单 dist/assets/pano-local.js。
本工具不下载任何东西。照片版权属于原作者，放进参赛作品前请先取得许可并保留署名。
"""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'dist' / 'assets'
PANO = ASSETS / 'pano'
FACES = 'frblud'
SIZE = 1024
EXT = ('.jpg', '.jpeg', '.png', '.webp')


def load_scenes():
    t = (ASSETS / 'scenes.js').read_text(encoding='utf8')
    return t, json.loads(t[t.index('{'):t.rindex('}') + 1])


def strip_remote():
    """scenes.js 只留本地需要的字段：去掉全部 720 云网址。"""
    t, d = load_scenes()
    changed = False
    for k in ('source', 'manifest'):
        if k in d: d.pop(k); changed = True
    d.setdefault('credit', '720 云作品《西安翻译学院全景校园》，作者「全景漫游」，作品编号 a2bjzOkfrk4')
    for s in d['scenes']:
        for k in ('href', 'thumbnailUrl', 'cubeSource'):
            if k in s: s.pop(k); changed = True
    if changed or 'credit' not in t:
        (ASSETS / 'scenes.js').write_text('window.CAMPUS_TOUR = ' + json.dumps(d, ensure_ascii=False, indent=1) + ';\n', encoding='utf8')
    return d


def face_dirs(face, n):
    """Unit view directions for one cube face; conventions match dist/panorama.js (f = 正前, r = 右, u 的下边接 f)."""
    t = (np.arange(n) + .5) / n * 2 - 1
    a, b = np.meshgrid(t, t)
    one = np.ones_like(a)
    x, y, z = {'f': (a, -b, one), 'r': (one, -b, -a), 'b': (-a, -b, -one), 'l': (-one, -b, a), 'u': (a, one, b), 'd': (a, -one, -b)}[face]
    return x, y, z


def equirect_to_faces(img):
    src = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = src.shape[:2]
    out = {}
    for f in FACES:
        x, y, z = face_dirs(f, SIZE)
        lon = np.arctan2(x, z); lat = np.arctan2(y, np.hypot(x, z))
        u = (lon / (2 * np.pi) + .5) * w - .5; v = (.5 - lat / np.pi) * h - .5
        u0 = np.floor(u).astype(int); v0 = np.clip(np.floor(v).astype(int), 0, h - 1)
        fu = (u - u0)[..., None]; fv = np.clip(v - v0, 0, 1)[..., None]
        v1 = np.clip(v0 + 1, 0, h - 1); ua = u0 % w; ub = (u0 + 1) % w
        px = (src[v0, ua] * (1 - fu) + src[v0, ub] * fu) * (1 - fv) + (src[v1, ua] * (1 - fu) + src[v1, ub] * fu) * fv
        out[f] = Image.fromarray(np.clip(px + .5, 0, 255).astype(np.uint8))
    return out


def find_faces(folder):
    got = {}
    for p in folder.iterdir():
        if p.suffix.lower() not in EXT: continue
        m = re.search(r'(?:^|[_\-.])([frblud])$', p.stem.lower())
        if m: got[m.group(1)] = p
    return got if len(got) == 6 else None


def save(scene_id, faces):
    dest = PANO / str(scene_id); dest.mkdir(parents=True, exist_ok=True)
    for f, im in faces.items():
        im = im.convert('RGB')
        if im.size != (SIZE, SIZE): im = im.resize((SIZE, SIZE), Image.LANCZOS)
        im.save(dest / f'{f}.webp', quality=78, method=5)
    faces['f'].convert('RGB').resize((320, 320), Image.LANCZOS).crop((0, 50, 320, 290)).save(dest / 'thumb.webp', quality=72)


def write_manifest():
    ids = sorted(int(p.name) for p in PANO.iterdir() if p.is_dir() and p.name.isdigit() and all((p / f'{f}.webp').exists() for f in FACES)) if PANO.exists() else []
    (ASSETS / 'pano-local.js').write_text('// 由 tools/import_panoramas.py 生成：本地素材包里已有六面全景的场景编号。\nwindow.PANO_LOCAL = ' + json.dumps(ids) + ';\n', encoding='utf8')
    return ids


def main(argv):
    d = strip_remote()
    scenes = d['scenes']
    by_name = {}
    for s in scenes: by_name.setdefault(s['name'], []).append(s['id'])
    ids = {s['id'] for s in scenes}
    if '--list' in argv:
        have = set(write_manifest()) | {s['id'] for s in scenes if s.get('cube')}
        for s in scenes:
            if s['id'] not in have: print(s['id'], s['name'])
        print(f'还缺 {len(scenes) - len(have & ids)} / {len(scenes)} 个场景的全景照片'); return
    done, skipped = [], []
    if argv:
        src = Path(argv[0])
        if not src.is_dir(): sys.exit(f'找不到文件夹：{src}')
        for p in sorted(src.iterdir()):
            key = p.stem if p.is_file() else p.name
            sid = int(key) if key.isdigit() and int(key) in ids else (by_name.get(key) or [None])[0] if len(by_name.get(key, [])) == 1 else None
            if sid is None:
                skipped.append(f'{p.name}（{"场景名重复，请改用编号" if len(by_name.get(key, [])) > 1 else "认不出是哪个场景"}）'); continue
            try:
                if p.is_dir():
                    files = find_faces(p)
                    if not files: skipped.append(f'{p.name}（目录里没有凑齐六个面）'); continue
                    save(sid, {f: Image.open(q) for f, q in files.items()})
                elif p.suffix.lower() in EXT:
                    im = Image.open(p)
                    if abs(im.width / im.height - 2) > .05: skipped.append(f'{p.name}（不是 2:1 的全景展开图）'); continue
                    save(sid, equirect_to_faces(im))
                else: continue
                done.append(sid)
            except Exception as e: skipped.append(f'{p.name}（{e}）')
    have = write_manifest()
    print(f'本次导入 {len(done)} 个；本地素材包共 {len(have)} 个场景有六面全景（另有 {sum(1 for s in scenes if s.get("cube"))} 个随工程自带）。')
    for s in skipped: print('  跳过', s)


if __name__ == '__main__':
    main(sys.argv[1:])
