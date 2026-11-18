"""Indoor map of 东区6号教学楼A楼 -> dist/assets/indoor-data.js

Source: the team's floor plan「6号楼A楼05」(PDF exported from Sweet Home 3D, 2026-11-09, four floors on one page).
The room rectangles below are the fill rectangles of that PDF in its own points, read with PyMuPDF; the four floors
were drawn at slightly different offsets and are shifted onto the first floor's frame here. Room names are the labels
printed on the plan (they are bitmaps in the PDF, so they were typed in by hand).

    scale: a 46.7 m2 classroom is 56.7 x 43.6 pt  ->  0.1374 m per pt  (the block is about 43 m x 16 m)
    orientation: the plan's north arrow points down the page, so the page is turned 180 degrees here (north up, east right)

What is NOT on the plan and is an assumption of this file: which stair joins which floors. The plan shows a stair in
the south middle on floors 1-2 and one in the north middle on floors 2-4; the route goes up the south stair to the
second floor and changes to the north stair there.
"""
import json
from pathlib import Path

M_PER_PT = 0.1374
W, H = 404.0, 204.0                       # the page frame that is turned round
def turn(x0, y0, x1, y1): return [round(W - x1, 1), round(H - y1, 1), round(x1 - x0, 1), round(y1 - y0, 1)]   # -> x, y, w, h
def pt(x, y): return [round(W - x, 1), round(H - y, 1)]

# cells of the plan (PDF pt, first-floor frame): south row, north row, middle column, end rooms
S, N, NW = (78.8, 122.4), (138.5, 182.1), (140.4, 184.0)
C1, C2, CM, C3, C4 = (109.2, 165.9), (167.6, 224.3), (226.1, 266.1), (267.0, 323.6), (324.7, 381.4)
WC, N3, N4 = (268.5, 296.1), (297.0, 324.6), (325.5, 382.2)
E_SMALL, W_SMALL = (91.0, 139.5, 107.0, 168.6), (383.6, 140.1, 399.6, 169.2)
CORRIDOR = 130.5                          # centre line of the corridor (y)

def room(i, name, kind, cx, cy, area, sub='', floor=1, side=None, door=None):
    x0, x1 = cx; y0, y1 = cy
    side = side or ('S' if y1 <= CORRIDOR else 'N')          # which side of the corridor (plan frame: S = towards the dining centre)
    d = door or ((x0 + x1) / 2, y1 if side == 'S' else y0)   # where one steps in from the corridor
    return dict(id=i, name=name, sub=sub, kind=kind, floor=floor, area=area, rect=turn(x0, y0, x1, y1), door=pt(*d), at=pt(d[0], CORRIDOR),
                side='南' if side == 'S' else '北')

def floor1():
    return [
        room('6109', '6109', 'media', C1, S, 46.7, '多媒体教室'), room('6110', '6110', 'media', C2, S, 46.7, '多媒体教室'),
        room('6111', '6111', 'media', C3, S, 46.7, '多媒体教室'), room('6112', '6112', 'class', C4, S, 46.7, '教室'),
        room('6108', '6108', 'class', C1, N, 46.7, '教室'), room('6107', '6107', 'media', C2, N, 46.7, '多媒体教室'),
        room('wc1', '卫生间', 'wc', WC, NW, 18.0, '女'), room('6A12', '6A12', 'office', N3, NW, 27.0, '校企共建 科大讯飞办公室'),
        room('6A11', '6A11', 'office', N4, NW, 46.7, '教学资料室'),
        room('临12', '临12', 'small', E_SMALL[0::2], E_SMALL[1::2], 9.0, '', side='N'), room('临11', '临11', 'small', W_SMALL[0::2], W_SMALL[1::2], 9.0, '', side='N'),
    ]
def floor2():
    return [
        room('6208', '6208', 'media', C1, S, 46.7, '多媒体教室', 2), room('6209', '6209', 'media', C2, S, 46.7, '多媒体教室', 2),
        room('6210', '6210', 'media', C3, S, 46.7, '多媒体教室', 2), room('6211', '6211', 'media', C4, S, 46.7, '多媒体教室', 2),
        room('6207', '6207', 'class', C1, N, 46.7, '教室', 2), room('6213', '6213', 'class', C2, N, 46.7, '教室', 2),
        room('wc2', '卫生间', 'wc', WC, NW, 18.0, '男', 2), room('6A22', '6A22', 'office', N3, NW, 27.0, '', 2), room('6212', '6212', 'class', N4, NW, 46.7, '教室', 2),
        room('临22', '临22', 'small', E_SMALL[0::2], E_SMALL[1::2], 8.0, '', 2, side='N'), room('6A21', '6A21', 'small', W_SMALL[0::2], W_SMALL[1::2], 8.0, '教授办公室', 2, side='N'),
    ]
def floor3():
    return [
        room('6309', '6309', 'class', C1, S, 46.7, '教室', 3), room('6310', '6310', 'media', C2, S, 46.7, '多媒体教室', 3),
        room('6312a', '6312', 'class', CM, S, 37.2, '教室（图上与西邻同号）', 3), room('6312', '6312', 'class', C3, S, 46.7, '教室', 3),
        room('6A32', '6A32', 'office', C4, S, 46.7, '“译创”大学生创业就业工作室 · 辅导员办公室（二）', 3),
        room('6308', '6308', 'class', C1, N, 46.7, '教室', 3), room('6307', '6307', 'class', C2, N, 46.7, '教室', 3),
        room('wc3', '卫生间', 'wc', WC, NW, 18.0, '女', 3), room('6A33', '6A33', 'office', N3, NW, 27.0, '校企共建 博瑞集信办公室', 3), room('6313', '6313', 'class', N4, NW, 46.7, '教室', 3),
        room('6A34', '6A34', 'small', E_SMALL[0::2], E_SMALL[1::2], 8.0, '公共计算机资料室', 3, side='N'), room('临31', '临31', 'small', W_SMALL[0::2], W_SMALL[1::2], 8.0, '', 3, side='N'),
    ]
def floor4():
    big = (78.8, 183.4)
    return [
        # the two end rooms take the whole depth of the block; they are entered from the ends of the corridor
        room('6A41', '6A41', 'office', C1, big, 114.6, '图书阅览室 · 学院荣誉室', 4, side='S', door=(166.8, CORRIDOR)),
        room('6A43', '6A43', 'office', C2, S, 46.7, '工程管理系（二）', 4), room('团学青', '团学青办公室', 'office', CM, S, 37.2, '无门牌号', 4),
        room('无牌', '无门牌号', 'office', C3, S, 46.7, '图上未写用途', 4),
        room('6A46', '6A46', 'office', (325.9, 382.6), big, 114.6, '微创空间', 4, side='S', door=(325.0, CORRIDOR)),
        room('6A42', '6A42', 'office', C2, N, 46.7, '计算机科学系（二）', 4), room('wc4', '卫生间', 'wc', WC, NW, 17.4, '男', 4), room('6A45', '6A45', 'office', N3, NW, 27.0, '校企共建办公室', 4),
        # the two 操作间 open into the end rooms, not into the corridor
        dict(room('临42', '临42', 'small', (91.0, 107.0), (123.3, 170.5), 8.0, '操作间', 4, side='S', door=(108.2, 147)), at=pt(166.8, CORRIDOR), via='6A41'),
        dict(room('临41', '临41', 'small', (384.0, 400.0), (123.3, 170.5), 8.0, '操作间', 4, side='S', door=(383.2, 147)), at=pt(325.0, CORRIDOR), via='6A46'),
    ]

def outline(porch):
    # outer wall, clockwise in the plan frame, then turned
    p = [(107, 75.4), (384, 75.4), (384, 121.4), (401.5, 121.4), (401.5, 172.4), (384, 172.4), (384, 185.6)]
    if porch: p += [(269, 185.6), (269, 202), (225, 202), (225, 185.6)]
    p += [(107, 185.6), (107, 172.4), (89.4, 172.4), (89.4, 121.4), (107, 121.4)]
    return [pt(*q) for q in p]

S_STAIR, N_STAIR = (228.5, 82.0, 262.5, 122.4), (228.5, 138.5, 263.5, 181.0)
floors = []
for n, rooms in enumerate((floor1(), floor2(), floor3(), floor4()), 1):
    stairs = []
    if n <= 2: stairs.append(dict(id='S', label='南侧楼梯', rect=turn(*((235.0, 84.4, 255.0, 122.4) if n == 1 else S_STAIR)), at=pt(245, CORRIDOR), foot=pt(245, 122.4)))
    if n >= 2: stairs.append(dict(id='N', label='北侧楼梯', rect=turn(*N_STAIR), at=pt(246, CORRIDOR), foot=pt(246, 138.5)))
    f = dict(n=n, name=f'{n} 层', outline=outline(n == 1), rooms=rooms, stairs=stairs, corridor=[pt(91.5, CORRIDOR), pt(399.5, CORRIDOR)])
    if n == 1: f['hall'] = dict(name='大厅', area=45.8, rect=turn(225.6, 122.4, 267.4, 185.2))
    floors.append(f)

entrances = [
    dict(id='north', label='北门（门厅）', door='北门（门厅）', note='朝内院，有门廊', path=[pt(246.5, 199), pt(246.5, 185.6), pt(246.5, CORRIDOR)], mark=pt(246.5, 202)),
    dict(id='south', label='南门（楼梯旁）', door='南门（楼梯旁）', note='朝东区餐饮中心', path=[pt(244.5, 73), pt(244.5, 79.5), pt(261, 81.5), pt(261, CORRIDOR)], mark=pt(244.5, 70)),
    dict(id='east', label='东门（走廊尽头）', door='东门（走廊尽头）', note='朝诒德大道', path=[pt(86, CORRIDOR), pt(93, CORRIDOR)], mark=pt(84, CORRIDOR)),
]
data = {'e-teach6': dict(place='e-teach6', title='东区6号教学楼A楼', short='6A 号教学楼', size=[W - 85, H - 66], origin=[0, 0], view=[-2, -2, W - 80, H - 62],
    mPerUnit=M_PER_PT, floors=floors, entrances=entrances,
    transfer=dict(floor=2, text='在 2 层从南侧楼梯出来，穿过走廊到北侧楼梯'),
    source='团队提供的平面图「6号楼A楼05」（Sweet Home 3D 导出，2026-11-09）',
    caveats=['房间名称、面积照平面图抄录；3 层有两间都标着 6312，4 层有两间没有门牌号。', '楼梯位置照平面图画；哪部楼梯通哪几层图上没有写，这里按“南侧楼梯通 1—2 层、北侧楼梯通 2—4 层”处理。', '距离按图上面积推算的比例估计，未现场测量。'])}
# shift everything so the drawing starts near the origin
ox, oy = 0.0, 0.0
out = Path(__file__).resolve().parents[1] / 'dist' / 'assets' / 'indoor-data.js'
out.write_text('// generated by tools/build_indoor.py from the team\'s floor plan\nwindow.INDOOR = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
print('indoor:', sum(len(f['rooms']) for f in floors), 'rooms on', len(floors), 'floors ->', out.name, out.stat().st_size, 'bytes')
