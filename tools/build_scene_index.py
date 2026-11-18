"""Link all 140 panoramas of the 720 云 work to buildings / roads on the atlas.

    python -B tools/build_scene_index.py        (run after build_detail.py)

Inputs : dist/assets/atlas-data.js, dist/assets/scenes.js, tools/scene_links.json
Output : dist/assets/scene-index.js   (window.SCENE_INDEX)

tools/scene_links.json holds, for each scene, the scenes its hotspots lead to (ids only), read from the
tour manifest. These walk-through links are what places the indoor scenes: e.g. 「11号公寓楼6人间」 is entered
from 「诒品坊餐厅」 → 西11公寓;「人工智能实验室入口」 from 「科技楼一层大厅」 → 科技楼.
"""
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
def load(name):
    raw = (root / 'dist/assets' / name).read_text(encoding='utf8')
    return json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
A = load('atlas-data.js'); T = load('scenes.js')
LINKS = {int(k): v for k, v in json.loads((root / 'tools/scene_links.json').read_text(encoding='utf8')).items()}
places = {p['id']: p for p in A['places']}
measured = {s['id']: s for s in A['panoramas']}
OVERVIEW = 15468023

def R(a, b): return list(range(a, b + 1))
# place id -> scenes inside the building (indoor)
INDOOR = {
    'library': [15468040, 15468041, 15468056, 15468042, 15468043, 15468046, 15468044, 15468045, 15468047, 15468048, 15468049,
                15468050, 15468051, 15468052, 15468053, 15468054, 15468055],
    'tech': [15468057, 15468058, 15468059, 23260859, 23260861, 23260863, 23260864, 23260866, 23260853],
    'e-office5': [15468034, 15468035],
    'e-teach9': [15468062, 15468064],
    'gym': [15468073],
    'e-train1': [15468079, 15468080, 15468081],
    'e-teach10': [15468083],
    'conf': [23260846, 23260848, 23260850, 23260852],
    'e-train2': [23260854, 23260855, 23260856, 23260857, 23260858, 23260860, 23260865],
    'e-train3': R(16046113, 16046121) + [16046126],
    'w-teach5': R(15468096, 15468102),
    'w-train5': [15468105, 15468117, 15468116, 15468113, 15468114, 15468106, 15468115, 15468107, 15468108, 15468109, 15468110,
                 15468111, 15468112, 15468118],
    'west-lib': R(15468122, 15468125),
    'west-dining': [15468128, 15468129],
    'east-9': [16046125], 'east-10': [16046124], 'west-1': [16046123], 'west-11': [16046122],
}
# outdoor scenes standing at / in front of a place
OUTDOOR = {
    15468029: 'gate', 15468030: 'gate', 15468033: 'e-office5', 15468037: 'e-startup-street', 15468039: 'library',
    23260862: 'tech', 15468061: 'e-teach9', 15468069: 'e-plaza-ming', 15468025: 'track', 15468072: 'gym', 15468075: 'e-ball',
    15468076: 'e-plaza-hua', 15468077: 'e-teach8', 15468078: 'e-train1', 15468082: 'e-teach10', 23260845: 'conf',
    23260847: 'conf', 23260849: 'conf', 23260851: 'conf', 15468086: 'gate-south', 15468089: 'west-gate', 15468090: 'w-teach3',
    15468091: 'w-fang-garden', 15468092: 'w-teach4', 15468093: 'west', 15468094: 'w-square', 15468095: 'w-teach5',
    15468103: 'w-train5', 15468120: 'west-lib', 15468121: 'west-lib', 15468130: 'west-lib', 15468126: 'w-ball',
    15468127: 'west-dining', 15468131: 'w-golf', 15468028: 'w-golf',
}
# scenes on a road / in an area without one building: (x, y, zone)
LOOSE = {
    15468031: (1450, 282, '东区'), 15468032: (1350, 94, '东区'), 15468036: (1548, 94, '东区'), 15468038: (1628, 152, '东区'),
    15468060: (1548, 480, '东区'), 15468070: (1811, 450, '东区'), 15468071: (1874, 450, '东区'), 15468085: (1450, 701, '东区'),
    15468119: (574, 760, '西区'), 16046112: (937, 760, '西区'),
    15468066: (1560, 606, '东区'), 15468068: (1560, 606, '东区'), 15468067: (1560, 606, '东区'),      # 诒德楼：由诒德大道、钟塔广场进入，楼栋待核
    15468087: (1180, 690, '东区'), 15468088: (1180, 690, '东区'),                                   # 艺术设计实验教学中心：由东区南门进入，楼栋待核
}
AERIAL = {15468023: '全校', 15468024: '东区', 15468026: '西区'}
NOTES = {
    'w-train5': '由「诒英广场」进入，对应图上 5 号实训楼（外国语言与文化实践教学中心）',
    15468066: '诒德楼：由诒德大道、钟塔广场进入，对应楼栋待现场核对', 15468068: '诒德楼（楼栋待核）', 15468067: '诒德楼（楼栋待核）',
    15468087: '由东区南门进入，对应楼栋待现场核对', 15468088: '由东区南门进入，对应楼栋待现场核对',
}

index = {}
def put(sid, **kw): index[sid] = {k: v for k, v in kw.items() if v not in (None, [], '')}
for pid, ids in INDOOR.items():
    p = places[pid]
    for sid in ids: put(sid, p=pid, x=p['x'], y=p['y'], i=1, z=p['zone'], t=NOTES.get(pid))
for sid, pid in OUTDOOR.items():
    p = places[pid]; m = measured.get(sid)
    put(sid, p=pid, x=m['x'] if m else p['x'], y=m['y'] if m else p['y'], z=p['zone'], t=NOTES.get(pid) if pid == 'w-train5' else None)
for sid, (x, y, z) in LOOSE.items():
    put(sid, x=x, y=y, z=z, i=1 if sid in NOTES else None, t=NOTES.get(sid))
for sid, z in AERIAL.items(): put(sid, z=z, a=1)
names = {s['id']: s['name'] for s in T['scenes']}
missing = [names[i] for i in names if i not in index]
assert not missing, missing
for sid, rec in index.items():
    n = [b for b in LINKS.get(sid, []) if b != OVERVIEW and b != sid and b in names]
    if n: rec['n'] = n

TOURS = [
    dict(id='east-axis', name='东区主轴线', desc='从北门进校，沿诒文大道、诒德大道走到钟塔和南门',
         stops=[15468029, 15468030, 15468031, 15468039, 15468060, 15468069, 23260849, 23260845, 15468085, 15468086]),
    dict(id='east-river', name='东区河畔运动线', desc='科技楼后花园出发，沿河看体育馆、田径场和篮球场',
         stops=[23260862, 15468070, 15468071, 15468072, 15468025, 15468075]),
    dict(id='west-loop', name='西区一圈', desc='西区正门进，诒才路、诒芳园、诒英广场到图书馆和诒品坊',
         stops=[15468089, 15468090, 15468091, 15468092, 15468093, 15468094, 15468095, 15468119, 15468120, 15468121, 15468126, 15468127]),
    dict(id='library-floors', name='图书馆逐层', desc='从图书馆广场上楼，二层到七层逐层看',
         stops=[15468039, 15468040, 15468056, 15468046, 15468047, 15468050, 15468053, 15468054]),
    dict(id='dorm-life', name='宿舍与生活', desc='东西区公寓样板间、美食街和餐厅',
         stops=[15468032, 15468036, 15468037, 16046125, 16046124, 16046123, 16046122, 15468127, 15468128]),
]
for t in TOURS:
    assert all(s in names for s in t['stops']), t['id']
by_place = {}
for sid, rec in index.items():
    if rec.get('p'): by_place.setdefault(rec['p'], []).append(sid)
out = dict(version='2026-11-10', source=T.get('credit', '720 云《西安翻译学院全景校园》'),scenes=index, tours=TOURS,
           counts=dict(total=len(index), located=sum(1 for r in index.values() if 'x' in r), places=len(by_place),
                       indoor=sum(1 for r in index.values() if r.get('i'))))
(root / 'dist/assets/scene-index.js').write_text('window.SCENE_INDEX = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
print(out['counts'])
