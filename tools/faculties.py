"""4 学部 + 6 学院: which faculty or college uses which building.

Source: the team's《4学部+6学院》(a Word document exported to PDF on 2026-11-16). For every faculty and college it
lists the departments and the building numbers, and it has photos of the name boards at six building entrances
(西区2/3/4/5号楼, 东区8/10号楼). The building numbers are matched to the map by name:
  · “东区六号楼” is 6 号教学楼, which on the map is three separate blocks (A 楼, 东楼, 西楼);
  · “东区四号综合楼三层” and “东区五号综合楼一层” take one floor of those buildings only.
Buildings the list does not name (西区1号教学楼, the 实训楼, the other 综合楼 …) are left without a faculty.

Run:  python tools/faculties.py                → dist/assets/faculty-data.js
      python tools/faculties.py --photos PDF   → also re-extracts the board photos into dist/assets/faculty/
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist' / 'assets'
SOURCE = '团队提供的《4学部+6学院》（2026-11-16），楼号与门口标识牌照片对照'

# id, name, kind, colour, departments (as the document writes them), extra search words, buildings [(place, floor)], wording
UNITS = [
    dict(id='arts', name='人文与艺术学部', kind='学部', color='#c2507c',
         depts=['综合办', '凤凰数智传媒产业学院', '中文系', '艺术系', '设计系', '教育系', '人文与艺术教学中心'],
         keys=['人文', '艺术', '中文', '设计', '教育', '传媒', '凤凰', '数智传媒'],
         buildings=[('e-teach8', ''), ('w-teach5', '')], said='东区八号楼 西区五号楼'),
    dict(id='sci', name='理工学部', kind='学部', color='#3567c4',
         depts=['人工智能产业学院', '集成电路产业学院', '计算机科学系', '电子信息系', '工程管理系'],
         keys=['理工', '人工智能', 'AI', '集成电路', '计算机', '电子信息', '工程管理'],
         buildings=[('e-teach6', ''), ('e-teach6-e', ''), ('e-teach6-w', ''), ('e-teach7', '')], said='东区六号楼 东区七号楼'),
    dict(id='health', name='健康与体育学部', kind='学部', color='#13958a',
         depts=['医学系', '体育系'], keys=['健康', '医学', '体育'],
         buildings=[('e-teach10', '')], said='东区十号楼'),
    dict(id='econ', name='经济与管理学部', kind='学部', color='#c88a16',
         depts=['综合办', '专业素养教学中心', '专业教育教学中心', '产学研用融合中心'], keys=['经济', '管理', '经管', '产学研'],
         buildings=[('e-teach9', '')], said='东区九号楼'),
    dict(id='english', name='英文学院', kind='学院', color='#7b52bf',
         depts=['英语系', '翻译系', '商务英语系'], keys=['英语', '英文', '翻译', '商务英语', '商英'],
         buildings=[('w-teach4', ''), ('w-teach2', '')], said='西区四号楼 西区二号楼'),
    dict(id='lang', name='国际语言文化学院', kind='学院', color='#1b93be',
         depts=['日韩系', '德语系', '法语系', '西俄系'], keys=['日语', '韩语', '日韩', '德语', '法语', '西班牙语', '俄语', '西俄', '小语种'],
         buildings=[('w-teach3', ''), ('w-teach4', '')], said='西区三号楼 西区四号楼'),
    dict(id='marx', name='马克思主义学院', kind='学院', color='#c63a32',
         depts=[], keys=['马院', '马克思', '思政'],
         buildings=[('e-office4', '三层')], said='东区四号综合楼三层'),
    dict(id='inno', name='创新创业学院', kind='学院', color='#e46f2a',
         depts=[], keys=['创新', '创业', '双创'],
         buildings=[('e-office5', '一层')], said='东区五号综合楼一层'),
    dict(id='cont', name='继续教育学院', kind='学院', color='#5f9a32',
         depts=[], keys=['继续教育', '继教', '成人教育'],
         buildings=[('w-teach5', '')], said='西区五号楼'),
    dict(id='intl', name='国际交流学院', kind='学院', color='#a24ea8',
         depts=[], keys=['国际交流', '国交'],
         buildings=[('w-teach5', '')], said='西区五号楼'),
]

# the name boards photographed at the entrances (image xref in the PDF → building)
PHOTOS = {
    'w-teach5': (14, '西区5号楼门口立牌：人文与艺术学部'),
    'e-teach8': (15, '东区8号楼门口立牌：人文与艺术学部'),
    'e-teach10': (16, '东区10号楼门口立牌：健康与体育学部'),
    'w-teach4': (21, '西区4号楼门口标识：英文学院、国际语言文化学院'),
    'w-teach2': (19, '西区2号楼门口：英文学院办公楼'),
    'w-teach3': (22, '西区3号楼门口标识：国际语言文化学院'),
}
# numbered teaching buildings on the map that the document does not name
UNLISTED = ['west']


def atlas_places():
    t = (DEST / 'atlas-data.js').read_text(encoding='utf8')
    return {p['id']: p for p in json.loads(t[t.index('{'):t.rindex('}') + 1])['places']}


def extract_photos(pdf):
    """The board photos, re-encoded small (the card shows them about 130 px wide, the viewer up to 560 px)."""
    import io
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz
    from PIL import Image, ImageOps
    out = DEST / 'faculty'; out.mkdir(exist_ok=True)
    doc = fitz.open(pdf)
    for place, (xref, _) in PHOTOS.items():
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(doc.extract_image(xref)['image']))).convert('RGB')
        im.thumbnail((560, 560), Image.LANCZOS)
        im.save(out / f'{place}.webp', 'WEBP', quality=80, method=6)
        print('photo', place, im.size, (out / f'{place}.webp').stat().st_size // 1024, 'KB')


def build():
    places = atlas_places()
    for u in UNITS:
        for pid, _ in u['buildings']:
            assert pid in places, (u['name'], pid)
    for pid in [*PHOTOS, *UNLISTED]:
        assert pid in places, pid
    colours = [u['color'] for u in UNITS]
    assert len(set(colours)) == len(colours)
    named = {pid for u in UNITS for pid, _ in u['buildings']}
    teaching = [p for p in places.values() if p['name'].endswith('教学楼') or '教学楼' in p['name'] and p['category'] == '教学']
    missing = [p['id'] for p in teaching if p['id'] not in named and p['id'] not in UNLISTED]
    assert not missing, missing
    photos = {}
    for pid, (_, caption) in PHOTOS.items():
        f = DEST / 'faculty' / f'{pid}.webp'
        if f.exists():
            from PIL import Image
            with Image.open(f) as im:
                photos[pid] = dict(src=f'assets/faculty/{pid}.webp', w=im.size[0], h=im.size[1], caption=caption)
    data = dict(source=SOURCE, date='2026-11-16',
                units=[dict(id=u['id'], name=u['name'], kind=u['kind'], color=u['color'], depts=u['depts'], keys=u['keys'], said=u['said'],
                            buildings=[dict(place=pid, floor=fl) for pid, fl in u['buildings']]) for u in UNITS],
                photos=photos, unlisted=UNLISTED,
                note='楼号按名单和门口标识牌对应到地图上的楼；6 号教学楼的三栋都算“东区六号楼”。名单没有写到的楼（如西区1号教学楼、各实训楼）不标学部。')
    (DEST / 'faculty-data.js').write_text('window.CAMPUS_FACULTY = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
    print(len(UNITS), 'units ·', len(named), 'buildings ·', len(photos), 'photos ·', 'unlisted', UNLISTED)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if '--photos' in sys.argv:
        extract_photos(sys.argv[sys.argv.index('--photos') + 1])
    build()
