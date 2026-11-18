"""What the panoramas show and the school plan does not: storeys, roofs, wall materials, doors, extra paths.

Source: 720 云《西安翻译学院全景校园》(作者「全景漫游」, a2bjzOkfrk4), viewed scene by scene in the original
player on 2026-11-13 — the 5 aerial scenes (全景西译、东区校园、西区校园、田径场、高尔夫训练场) and the 41 outdoor
ground scenes. Nothing was downloaded; only the observations below were written down. The other works found by the
720 云 search are older or sit behind a "watch an ad or pay" gate and were not used.

`src` says how each fact is known:
  航拍   seen in an aerial panorama            地面   seen in a ground panorama
  团队   marked by the team on screenshots of the map (doors, 2026-11-18; a few side doors, 2026-11-17)
  类推   same building type as surveyed ones (the dorm doors seen in the panoramas sat in a gable end; no dorm uses
         this any more: the team marked every dorm's doors)
  推定   not visible in any panorama: the door is put on the side that faces the nearest path
Positions stay in the coordinate space of the school plan, which is a schematic; a door is "on this side of this
building", not a surveyed point.
"""
FLOOR = 3.3   # metres per storey for housing; teaching and public buildings carry their own height below

PALETTE = {   # wall and roof materials -> colours used by the 3D model
    'wall': {'whitetile': '#ece8de', 'brick': '#a5523f', 'brownfin': '#a56f48', 'grey': '#c4c7c8', 'beige': '#dbcfb6',
             'stone': '#9c7d5f', 'glass': '#86b4d1', 'terracotta': '#b85a3f', 'redpanel': '#c24d38', 'white': '#f2f0ea',
             'pink': '#d8bfb0', 'timber': '#b98656', 'shed': '#cfd3d2', 'yellow': '#e9d9a8'},
    'roof': {'concrete': '#b7b4ab', 'dark': '#77777a', 'red': '#c8343b', 'blue': '#4a97d6', 'white': '#e8e8e4',
             'tile': '#80858b', 'orange': '#cc7a45', 'metal': '#9fb2bf', 'green': '#7fae7a'},
}

def b(floors, wall, roof='flat', tone='concrete', h=None, src='航拍', glass=0.0, trim=None, note=''):
    return dict(floors=floors, wall=wall, roof=roof, roofTone=tone, height=round(h if h else floors * FLOOR, 1),
                src=src, glass=glass, trim=trim, note=note)

E_DORM = lambda src='航拍': b(6, 'whitetile', tone='concrete', trim='brownfin', src=src, note='6 层，白色面砖，山墙端为棕色竖向格栅；正门在长边（团队标注）')
W_DORM = lambda src='航拍': b(6, 'brick', tone='dark', src=src, note='6 层红砖板楼，平屋顶；正门在长边（团队标注）')

BUILDINGS = {
    # ---- 东区宿舍 ----
    **{f'east-{n}': E_DORM() for n in (1, 2, 4, 5, 6, 7, 8)},
    **{f'east-{n}': E_DORM('类推') for n in (13, 14, 15, 16, 17, 18)},
    'east-9-10': E_DORM(), 'east-11-12': E_DORM(),
    # ---- 西区宿舍 ----
    **{f'west-{n}': W_DORM() for n in (1, 2, 3, 4, 5, 6, 7, 8)},
    **{f'west-{n}': W_DORM() for n in (10, 11, 12, 13)},
    **{f'west-{n}': W_DORM('类推') for n in (14, 15, 16, 17)},
    'intl-dorm': b(6, 'white', tone='red', trim='redpanel', note='白色外墙，檐口红色饰带'),
    # ---- 教师公寓 ----
    'staff-5': b(7, 'brick', tone='concrete', trim='whitetile', note='沿太乙宫正街的南北向板楼'),
    'staff-1': b(5, 'brick', src='地面'), 'staff-2': b(6, 'brick', src='类推'), 'staff-3': b(6, 'brick', src='类推'), 'staff-4': b(6, 'brick', src='类推'),
    # ---- 东区教学与公共建筑 ----
    'library': b(7, 'grey', h=32, glass=.25, note='灰色石材，屋顶有构架；南面大台阶为主入口，东面另有入口'),
    'tech': b(8, 'grey', h=30, glass=.35, note='西面朝环岛的玻璃门厅，东面后花园另有入口'),
    'e-teach7': b(5, 'whitetile', h=20, tone='dark', note='弧形白色肋架，东端有圆形玻璃塔和环形顶'),
    'e-teach6': b(4, 'beige', h=16, trim='stone', src='平面图', note='6 号教学楼 A 楼：靠餐饮中心的一栋，团队平面图为 4 层；北面门厅朝内院，南面和东端另有门'),
    'e-teach6-e': b(3, 'beige', h=11.5, trim='stone', note='6 号教学楼东楼：3 层，屋顶有廊架，走廊朝内院'),
    'e-teach6-w': b(4, 'beige', h=14.5, trim='stone', note='6 号教学楼西楼：约 4 层'),
    'dining': b(5, 'grey', h=21, glass=.4, note='南北向长楼，东面弧形玻璃幕墙和大台阶，北端有两个白色环形雨篷'),
    'e-teach9': b(6, 'stone', h=24, note='棕色石材，西端圆柱形转角；内部是通高中庭'),
    'e-teach8': b(5, 'brick', h=22, glass=.35, note='半圆形红砖与玻璃，围着诒华广场'),
    'e-teach10': b(7, 'grey', h=26, src='地面', note='灰色 7 层 U 形，内院朝东，院内正中是玻璃门厅'),
    'conf': b(3, 'brick', h=16, src='地面', note='红砖，两层连续拱窗；南面拱形玻璃入口，北面大台阶，西端钟塔'),
    'gym': b(3, 'glass', roof='vault', tone='metal', h=18, glass=.7, src='地面', note='蓝色玻璃幕墙，银色弧形屋檐；西面大台阶'),
    'e-train1': b(2, 'terracotta', h=9.5, glass=.5, src='地面', note='陶土色板材与玻璃，两层长楼'),
    'e-train2': b(4, 'whitetile', h=14, src='推定'), 'e-train3': b(4, 'whitetile', h=14, src='推定'), 'e-train4': b(2, 'brick', h=8, src='推定'),
    'e-office2': b(4, 'brick', roof='hip', tone='red', h=14, note='红砖坡顶'), 'clinic': b(4, 'brick', roof='hip', tone='red', h=14, note='红砖坡顶'),
    'e-office3': b(2, 'brownfin', h=9, src='地面', note='低层棕色砖楼'), 'e-office4': b(4, 'whitetile', h=14, src='推定'),
    'e-office5': b(2, 'brownfin', h=8.5, src='地面', note='两层棕色砖楼，玻璃门厅加雨篷'),
    'e-office6': b(3, 'white', h=10.5, src='地面', trim='brownfin'), 'e-office7': b(4, 'whitetile', h=13, src='推定'),
    'guest': b(11, 'pink', h=36, note='临街高层，屋顶有太阳能板；天渡从它南侧起桥'),
    'foreign': b(4, 'brick', h=13, src='推定'), 'zhongnan': b(2, 'brick', roof='hip', tone='tile', h=8, src='推定'),
    'e-student-affairs': b(4, 'brick', h=13, src='地面'), 'e-shop': b(1, 'glass', roof='hip', tone='red', h=5, glass=.6, src='地面', note='红色坡顶玻璃小楼，带尖顶'),
    'e-dining-jian': b(2, 'shed', tone='metal', h=8), 'e-dining-shan': b(2, 'shed', tone='metal', h=8, src='推定'),
    'e-engineering-lab': b(2, 'shed', tone='metal', h=8, src='推定'), 'e-infrastructure-office': b(2, 'white', h=7, src='推定'),
    'e-garage-north': b(1, 'shed', tone='metal', h=5, src='推定'), 'e-garage-south': b(1, 'shed', tone='metal', h=5, src='推定'),
    'e-guard-north': b(1, 'timber', h=4, src='地面'), 'e-guard-small': b(1, 'white', h=4, src='推定'), 'e-flag-platform': b(0, 'white', h=1, src='推定'),
    # ---- 西区 ----
    'west': b(4, 'brick', roof='hip', tone='red', h=16, note='红砖，红色金属坡顶；北面白色门廊朝诒才路'),
    'w-teach2': b(4, 'brick', roof='hip', tone='red', h=16, note='红砖红顶；南面门廊朝诒才路'),
    'w-teach3': b(4, 'brick', roof='hip', tone='red', h=16, note='红砖红顶；南面白色雨篷朝诒才路'),
    'w-teach4': b(6, 'beige', h=21, note='米色 5—6 层，北面大雨篷朝诒芳园'),
    'w-teach5': b(6, 'brick', h=23, trim='beige', glass=.15, note='红砖配石材塔楼，U 形；东面门廊朝诒英广场'),
    'w-train5': b(4, 'brick', h=16, trim='beige', note='红砖，底层石材柱廊朝北面广场，多个门'),
    'w-office8': b(5, 'brick', h=17, tone='dark', note='沿街南北向，天渡西端坡道沿它落地'),
    'west-lib': b(3, 'grey', h=13, glass=.5, src='地面', note='现代三层，带钟的竖板“LIBRARY”；门朝北'),
    'west-dining': b(3, 'redpanel', h=13, glass=.2, note='红色板材方盒；南面木格栅门厅和大台阶'),
    'w-gym': b(2, 'white', h=9, src='推定'), 'express': b(1, 'shed', tone='metal', h=4, src='推定'),
    'w-yibo': b(3, 'brick', h=11, src='航拍'), 'w-carpentry': b(1, 'shed', tone='metal', h=5, src='推定'), 'w-greenhouse': b(1, 'glass', tone='white', h=4, glass=.8, src='推定'),
    'w-power': b(1, 'timber', h=6, src='地面'), 'w-gate-guard': b(1, 'white', h=4, src='地面'),
}

# Buildings that are in the panoramas but not destinations: the staff family compound that the plan leaves as
# one blank block between the north and south gates, and two towers. Footprints are approximate.
def box(l, t, r, bt): return [[l, t], [r, t], [r, bt], [l, bt]]
def ring(l, t, r, bt, w):   # four wings around a court
    return [box(l, t, r, t + w), box(l, bt - w, r, bt), box(l, t + w, l + w, bt - w), box(r - w, t + w, r, bt - w)]
def ngon(cx, cy, r, n=10):
    import math
    return [[round(cx + r * math.cos(2 * math.pi * i / n), 1), round(cy + r * math.sin(2 * math.pi * i / n), 1)] for i in range(n)]

SCENERY = [
    dict(id='fam-tower', category='教工', polygon=box(1222, 312, 1262, 398), **b(8, 'white', tone='red', trim='redpanel', note='院内 8 层楼，檐口红色，南面有红色雨篷和停车场')),
    *[dict(id=f'fam-school-{i}', category='教工', polygon=p, **b(3, 'white', tone='orange', h=10, note='橙色檐口的回字形院落，院内是操场')) for i, p in enumerate(ring(1282, 420, 1358, 504, 16))],
    dict(id='fam-block', category='教工', polygon=box(1208, 430, 1262, 450), **b(4, 'white', trim='glass', note='4 层白色住宅')),
    *[dict(id=f'fam-court-a{i}', category='教工', polygon=p, **b(1, 'brick', roof='hip', tone='tile', h=4.5, note='灰瓦红墙的四合院')) for i, p in enumerate(ring(1212, 522, 1286, 586, 12))],
    *[dict(id=f'fam-court-b{i}', category='教工', polygon=p, **b(1, 'brick', roof='hip', tone='tile', h=4.5, note='灰瓦红墙的四合院')) for i, p in enumerate(ring(1296, 522, 1356, 586, 12))],
    dict(id='fam-house', category='教工', polygon=box(1306, 600, 1342, 624), **b(2, 'white', roof='hip', tone='red', h=7, note='红色坡顶小楼')),
    dict(id='conf-tower', category='教学', polygon=box(1598, 633, 1614, 649), **b(9, 'brick', roof='spire', tone='orange', h=38, src='地面', note='钟塔，金色塔尖')),
    dict(id='e7-tower', category='教学', polygon=ngon(1519, 315, 9), **b(6, 'glass', roof='ring', tone='white', h=24, glass=.8, note='7 号教学楼东端的圆形玻璃塔，白色环形顶')),
]
COMPOUND = [[1138, 302], [1335, 302], [1335, 350], [1376, 350], [1376, 441], [1363, 441], [1363, 619], [1376, 619], [1376, 658], [1310, 658], [1310, 688], [1222, 688], [1222, 655], [1138, 655]]

# ---- doors: (kind, side, position along that side 0..1 from west / north, label, src) ----
# kind: main 正门 · back 后门 (marked by the team) · side 侧门 (another door seen in a panorama or on the floor plan)
def d(kind, side, t=.5, label=None, src='地面'):
    return dict(kind=kind, side=side, t=t, label=label or ({'N': '北', 'S': '南', 'E': '东', 'W': '西'}[side] + {'main': '门', 'back': '侧后门', 'side': '侧门'}[kind]), src=src)

DOORS = {   # buildings the team did not mark (see TEAM_DOORS): the panoramas and the team's floor plan
    'e-teach7': [d('main', 'E', .5, '东门（圆塔旁）'), d('side', 'S', .47, '南门', '团队')],
    # A 楼: the team's floor plan (2026-11-09) shows the hall and porch on the court side, a door by the stair on the
    # dining-centre side and a door at the east end of the corridor
    'e-teach6': [d('main', 'N', .5, '北门（门厅）', '平面图'), d('side', 'S', .5, '南门（楼梯旁）', '平面图'), d('side', 'E', .5, '东门（走廊尽头）', '平面图')],
    'e-teach6-e': [d('main', 'W', .5, '西门（朝内院）', '推定')], 'e-teach6-w': [d('main', 'E', .5, '东门（朝内院）', '推定')],
    'conf': [d('main', 'S', .4, '南门（钟塔入口）'), d('side', 'N', .5, '北门（大台阶）'), d('side', 'E', .5, '东门（终南讲堂）')],
    'gym': [d('main', 'W', .7, '西门（大台阶）'), d('side', 'S', .6, '南门', '团队')],
    'e-shop': [d('main', 'S', .5, '南门')],
}

# 2026-11-18: the team marked the main doors (red) and back doors (blue) of 63 buildings on eleven screenshots of the
# 3D map, and corrected one the same day (东18公寓: the main door is on the north side, opposite the one drawn). Each
# mark was read off against the footprints: which wall it sits on, and where along it (t). A marked building's doors
# are exactly the marked ones; what it had before goes - the dorm gable-end guesses, the doors put on the side facing
# the nearest path, and the panorama doors the team did not mark (图书馆东门, 西区2/3号教学楼南门, 5号实训楼北侧门,
# 东区5号综合楼北门).
_M = lambda side, t=.5, label=None: d('main', side, t, label, '团队')
_B = lambda side, t=.5, label=None: d('back', side, t, label, '团队')
TEAM_DOORS = {
    # 东区宿舍: the main doors are on the long sides, a few back doors in a gable end
    'east-1': [_M('N', .56)], 'east-2': [_M('N', .48)], 'east-4': [_M('S', .54), _B('E', .5, '东端后门')],
    'east-5': [_M('S', .51)], 'east-6': [_M('S', .57)], 'east-7': [_M('N', .54)], 'east-8': [_M('N', .56)],
    'east-9': [_M('N', .55)], 'east-10': [_M('N', .64), _B('W', .5, '西端后门')],
    'east-11': [_M('N', .67), _B('W', .5, '西端后门')], 'east-12': [_M('N', .65)],
    'east-13': [_M('S', .53), _B('W', .5, '西端后门')], 'east-14': [_M('N', .58), _B('W', .5, '西端后门')],
    'east-15': [_M('N', .55)], 'east-16': [_M('N', .6)], 'east-17': [_M('N', .55), _M('S', .56)],
    'east-18': [_M('N', .58)],   # drawn on the south side; the team corrected it to the opposite side
    # 西区宿舍
    'west-1': [_M('S', .57)], 'west-2': [_M('S', .57)], 'west-3': [_M('N', .52)], 'west-4': [_M('N', .55)],
    'west-5': [_M('S', .47)], 'west-6': [_M('N', .46)], 'west-7': [_M('N', .55)], 'west-8': [_M('N', .53)],
    'west-10': [_M('N', .57)], 'west-11': [_M('N', .54)], 'west-12': [_M('N', .53), _B('E', .5, '东端后门')],
    'west-13': [_M('S', .55)], 'west-14': [_M('N', .6), _B('E', .5, '东端后门')], 'west-15': [_M('S', .63), _B('E', .5, '东端后门')],
    'west-16': [_M('N', .52), _B('E', .5, '东端后门')], 'west-17': [_M('S', .57), _B('E', .5, '东端后门')],
    'intl-dorm': [_M('N', .6)],
    # 教师公寓
    'staff-1': [_M('N', .53)], 'staff-2': [_M('S', .5)], 'staff-4': [_M('N', .55)],
    # 东区教学与公共建筑 (labels kept where the marked door is one the panoramas showed)
    'library': [_M('S', .72, '南门（大台阶）'), _B('S', .31, '南侧后门')],   # the main door is in the recess of the south front
    'tech': [_M('W', .55, '西门（环岛）'), _B('N', .65), _B('E', .5, '东门（后花园）'), _B('S', .6)],
    'dining': [_M('E', .45, '东门（大台阶）'), _B('N', .5, '北门（朝 6 号楼 A 楼）'), _B('S', .5)],
    'e-teach8': [_M('E', .5, '东门（诒华广场）'), _M('W', .46, '西门（诒雅路）'), _B('E', .14, '东北后门'), _B('E', .89, '东南后门'), _B('W', .9, '西南后门')],
    'e-teach9': [_M('W', .5, '西门（圆柱门廊）'), _B('N', .27), _B('S', .57, '南门（诒鸣广场）')],
    'e-teach10': [_M('E', .5, '内院门厅'), _B('W', .11, '西北后门'), _B('W', .6), _B('W', .94, '西南后门'), _B('E', .17, '东北后门'), _B('E', .82, '东南后门')],
    'e-train1': [_M('W', .45)], 'e-train3': [_M('N', .58)], 'e-train4': [_M('S', .49)],
    'e-office2': [_M('S', .54), _B('E', .6, '东端后门')], 'e-office3': [_M('S', .53), _M('E', .5)],
    'e-office4': [_M('S', .56)], 'e-office5': [_M('S', .65)], 'clinic': [_M('N', .54), _B('E', .5, '东端后门')],
    'e-engineering-lab': [_M('S', .51), _B('W', .45, '西端后门')], 'e-student-affairs': [_M('S', .57)],
    'e-infrastructure-office': [_M('N', .72)],
    # 西区
    'west': [_M('N', .6, '北门（门廊）'), _B('W', .52)],   # the back door is the small porch on the west side
    'west-lib': [_M('W', .47), _B('N', .6)], 'west-dining': [_M('S', .5, '南门（大台阶）'), _B('E', .5)],
    'w-teach2': [_M('N', .6), _B('W', .33)], 'w-teach3': [_M('N', .52), _B('W', .51)],
    'w-teach4': [_M('N', .51, '北门（大雨篷）')],   # in the recess of the north front
    'w-teach5': [_M('E', .5, '东门（门廊）'), _B('E', .11, '东北后门'), _B('E', .91, '东南后门')],
    'w-train5': [_M('N', .49, '北门（柱廊）')], 'express': [_M('N', .08), _B('N', .38)],
}
assert not set(TEAM_DOORS) & set(DOORS)
DOORS.update(TEAM_DOORS)
GABLE_DOOR_CATEGORIES = ('宿舍',)   # a dorm nobody marked: its door goes in the gable end nearer the path (none left since 2026-11-18)

# ---- paths seen in the panoramas that the plan does not draw: (name, kind, coordinates, evidence) ----
EXTRA_PATHS = [
    ('诒丰园花坛小径', 'narrow', '882,927 882,872 844,872', '航拍《西区校园》：2 号、3 号教学楼之间的八角花坛和放射小径'),
    ('西1—4公寓间通道', 'narrow', '844,732 937,732 1022,732', '航拍《西区校园》：四栋板楼之间的草坪步道'),
    ('诒英广场横穿步道', 'lane', '562,1000 702,1000', '航拍与地面《诒英广场》：整片铺装广场可直接横穿'),
    ('诒静林小径', 'narrow', '574,787 640,787 693,787 779,787', '航拍《西区校园》：树林与西5、西6公寓之间带木廊架的小径'),
    ('西区图书馆东侧步道', 'narrow', '415,703 415,787', '地面《西区图书馆东侧》：沿石砌挡墙的小路'),
    ('图书馆东侧台阶', 'narrow', '415,758 484,758 484,734', '地面《西区图书馆东侧》：通往坡上的宽台阶'),
    ('西10—11公寓间通道', 'narrow', '206,1033 430,1033', '地面《公寓区》：板楼之间的条纹铺装步道'),
    ('公寓区小花园小径', 'narrow', '1548,154 1690,154', '地面《公寓区小花园》：东1与东4公寓之间的碎拼石小径和圆形花坛'),
    ('6号教学楼内院步道', 'narrow', '1465,341 1465,412', '航拍《东区校园》：三栋楼之间的铺装小院，从北侧步道进入'),
    ('东16—17公寓间通道', 'narrow', '1262,1001 1395,1001', '航拍：公寓板楼之间的通道'),
]

# ---- paths the team drew by hand on screenshots of the map (2026-11-17): (name, kind, coordinates, evidence) ----
# Read off three marked-up screenshots after fitting them to the plan with the dorm blocks as control points
# (mean fit error about 6 screenshot px = 4 plan px). Where a stroke ran along a wall it was moved 2-3 px into the gap.
_T = '团队 2026-11-17 在地图截图上手绘补充'
# drawn as ordinary campus lanes (11 px); tools/make_room.py moves the buildings beside them aside
TEAM_PATHS = [
    # 东区北部
    ('东6—7公寓间通道', 'lane', '1215,154 1331,154', _T), ('东7公寓西侧通道', 'lane', '1215,154 1215,207', _T), ('东7—8公寓间通道', 'lane', '1215,207 1340,207', _T),
    ('东5公寓南侧通道', 'lane', '1331,144 1548,144', _T), ('东区图书馆北侧通道', 'lane', '1340,168 1548,168', _T),
    ('东4公寓南侧通道', 'lane', '1548,141 1690,141', _T), ('东1公寓北侧通道', 'lane', '1548,170 1811,170', _T),
    ('东1—2公寓间通道', 'lane', '1690,137 1690,198', _T), ('东3号实训楼北侧通道', 'lane', '1690,137 1811,137', _T),
    ('科技楼北侧通道', 'lane', '1548,198 1811,198', _T), ('科技楼东侧步道', 'lane', '1760,198 1760,351', _T),
    ('科技楼南侧至9号教学楼步道', 'lane', '1681,359 1630,402', _T),
    ('七号教学楼西侧步道', 'lane', '1360,282 1360,341 1397,341', _T),
    ('6号教学楼A楼南侧通道', 'lane', '1420,463 1548,463', _T + '：餐饮中心与 6 号楼 A 楼之间，通到诒德大道'),
    ('车库间通道', 'lane', '1943,83 2002,83', _T), ('田径场西入口', 'lane', '1874,541 1897,541', _T),
    ('田径场南侧通道', 'lane', '1874,608 2016,608', _T),
    # 东区南部
    ('东区餐饮中心南侧通道', 'lane', '1388,630 1490,630 1490,621', _T), ('1号教师公寓北侧通道', 'lane', '1388,665 1531,665', _T),
    ('学生工作部西侧通道', 'lane', '1388,630 1388,700', _T),
    ('东12公寓东侧通道', 'lane', '1310,748 1405,748', _T), ('诒馨园西侧步道', 'lane', '1405,700 1405,777', _T),
    ('东11—13公寓间通道', 'lane', '1188,777 1405,777', _T),
    ('东13—14公寓间通道', 'lane', '1188,822 1255,822', _T), ('东14—15公寓间通道', 'lane', '1188,883 1255,883', _T),
    ('东16—17公寓间通道', 'lane', '1188,1001 1262,1001', _T), ('东17公寓西侧通道', 'lane', '1230,1001 1230,1137', _T),
    ('东17—18公寓间通道', 'lane', '1230,1066 1262,1066', _T),
    ('10号教学楼南侧通道', 'lane', '1395,1137 1548,1137', _T), ('4号教师公寓南侧通道', 'lane', '1230,1182 1431,1182', _T),
    ('篮球场间通道', 'lane', '1873,759 2016,759', _T), ('网球场北侧通道', 'lane', '1850,956 2016,956', _T),
    # 西区
    ('西6公寓南侧通道', 'lane', '779,837 705,837 705,927', _T), ('西1号教学楼南侧通道', 'lane', '834,1040 702,1040', _T),
    ('留学生公寓东侧通道', 'lane', '976,1114 976,1175', _T), ('西8公寓南侧通道', 'lane', '976,1175 712,1175 700,1188 510,1188', _T),
    ('西5号实训楼西侧通道', 'lane', '510,1188 510,1102', _T),
    ('西区网球场外侧步道', 'lane', '350,620 350,572 206,572', _T), ('乒乓球场北侧通道', 'lane', '348,787 206,787', _T),
    ('西16—17公寓间通道', 'lane', '206,908 82,908', _T), ('西区健身馆东侧通道', 'lane', '297,970 297,1102', _T),
    ('西12公寓东侧通道', 'lane', '350,895 350,970', _T),
]
