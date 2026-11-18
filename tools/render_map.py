"""Draw the illustrated base map (dist/assets/campus.svg) in the visual language of the school plan.

Buildings use the plan's colour code (宿舍粉、教学蓝、综合楼橙、图书馆砖红、教工米黄、生活橄榄、体育青),
roads are grey paving sized by importance, 太乙宫正街 is drawn as an asphalt street outside the campus,
and roadside trees are placed only where the 720 云 summer panoramas measured tree canopy.
"""
import math, random
from html import escape
import surroundings

def fmt(p): return ','.join(f'{n:g}' for n in p)

CAMPUS_WEST = [(25,265),(550,265),(622,345),(1062,345),(1062,1205),(512,1205),(512,1110),(25,1110)]
CAMPUS_EAST = [(1137,12),(2048,12),(2048,1320),(1202,1320),(1186,1240),(1162,1150),(1137,1062)]
STREET = surroundings.STREET   # extended beyond the plan to the map margin
RIVER = surroundings.RIVER
WIDTH = {'axis': 18, 'lane': 11, 'narrow': 8, 'bridge': 11}
WIDE = {'诒才路': 30, '诒文大道': 22, '诒德大道': 22, '诒和路': 20, '诒强路': 16, '诒萌路': 15, '诒滨路': 14, '诒颖路': 15, '诒雅路': 15}
PAVED = {'e-plaza-hua', 'e-plaza-ming', 'w-gate-plaza', 'w-square'}
EXTRA_PAVED = [  # paved yards visible on the plan that are not destinations
    [(398,700),(548,700),(548,792),(398,792)],          # 西区图书馆—供电中心前铺装
    [(1565,776),(1800,776),(1800,860),(1565,860)],      # 诒清园与诒趣园之间广场
    [(1476,468),(1522,468),(1522,612),(1476,612)],      # 东区餐饮中心东侧场地
    [(1148,795),(1200,795),(1200,813),(1148,813)],      # 天渡东端落桥平台（校内）
    [(990,792),(1054,792),(1054,814),(990,814)],        # 天渡西端落桥平台（校内）
]
FENCES = ['M1141 786V822', 'M1058 784V822']  # 落桥平台与街道之间的围墙：街面不能上桥
GREEN_PATCHES = [  # planted ground drawn on the plan (trees scattered inside, avoiding roads/buildings)
    ([(1760,935),(2008,935),(2008,1290),(1700,1290),(1700,1230)], 120),   # 外教楼、终南学社园林
    ([(1140,960),(1236,960),(1236,1222),(1186,1222),(1160,1140)], 40),    # 东16—18 西侧绿地
    ([(1236,1245),(1420,1245),(1420,1312),(1236,1312)], 26),              # 3号教师公寓北侧绿地
    ([(25,860),(80,860),(80,1105),(25,1105)], 20),                        # 西14—17 西侧林带
    ([(25,560),(200,560),(200,858),(25,858)], 34),                        # 高尔夫球训练场周边
]
BUILD = {'宿舍': ('#e5aca8', '#b97f7b'), '教学': ('#a3cbe4', '#6f9fbe'), '教工': ('#f1dbb4', '#c9ad7f'),
         '生活': ('#cbcb9e', '#9c9a6c'), '运动': ('#71c6d8', '#3f9db1'), '交通': ('#8bd1c2', '#55a596'), '景观': ('#efe6d0', '#c8bb98')}
OFFICE = ('#f1ca79', '#c99d47'); LIBRARY = ('#ea967f', '#bf6c56'); GUARD = ('#ecc57d', '#c79d4f')


def inside(x, y, poly):
    odd = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax: odd = not odd
    return odd


def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b; vx, vy = bx - ax, by - ay
    L = vx * vx + vy * vy
    t = 0 if not L else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / L))
    return math.hypot(px - ax - t * vx, py - ay - t * vy)


def render(roads, structures, areas, edges, nodes, endpoints, gates, out_path, doors=(), ground=False):
    # ground=True draws the bare ground for the 3D model: no trees, no building blocks, no bridge deck, no titles
    from survey3d import COMPOUND, SCENERY
    scenery_ids = {s['id'] for s in SCENERY}
    svg = []
    A = svg.append
    def poly(points, fill, stroke='none', attrs=''):
        A(f'<polygon points="{" ".join(map(fmt, points))}" fill="{fill}" stroke="{stroke}" {attrs}/>')
    def path(d, stroke, w, extra=''):
        A(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>')
    def rect(x, y, w, h, fill, rx=0, extra=''):
        A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" {extra}/>')
    def label(x, y, t, size, color, weight=400, spacing=3, extra=''):
        A(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="{size}" font-weight="{weight}" letter-spacing="{spacing}" fill="{color}" {extra}>{escape(t)}</text>')

    road_w = lambda name, k: WIDE.get(name, WIDTH.get(k, 10))
    campus_roads = [(n, k, a, b) for n, k, a, b, role in roads if role == 'campus']
    blocks = [s[2] for s in structures]
    def clear(x, y, margin=3):
        if any(inside(x, y, b) for b in blocks): return False
        for n, k, a, b in campus_roads:
            if seg_dist(x, y, a, b) < road_w(n, k) / 2 + margin: return False
        return True

    EX = surroundings.EXTENT
    size = ' width="{}" height="{}"'.format(EX[2] - EX[0], EX[3] - EX[1]) if ground else ''   # an intrinsic size lets a canvas rasterise it
    A('<svg xmlns="http://www.w3.org/2000/svg"{} viewBox="{} {} {} {}"><title>西安翻译学院楼栋导航详图</title>'.format(size, EX[0], EX[1], EX[2] - EX[0], EX[3] - EX[1]))
    A('<g id="flat"/><style>#flat:target~.side{display:none}</style>')
    A('<defs><pattern id="grass" width="26" height="24" patternUnits="userSpaceOnUse"><path d="M3 8l2-3M15 19l2-3M20 6l1-3" stroke="#b9d3a5" stroke-width="1" opacity=".7"/></pattern>'
      '<pattern id="pave" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h12M0 0v12" stroke="#d9d3c4" stroke-width=".6"/></pattern></defs>')
    surroundings.draw(A, lambda v: escape(v, quote=True))   # 校外场景（高德描绘）
    for g in (CAMPUS_WEST, CAMPUS_EAST):
        poly(g, '#d6e7c3', '#bcd1aa', 'stroke-width="2"'); poly(g, 'url(#grass)')
    # gardens & planted areas, then paved squares and parking
    for area in areas:
        if area['place'] == 'w-green-belt':
            poly(area['polygon'], '#c8dfb3'); continue
        pid = area['place']
        if pid in PAVED: poly(area['polygon'], '#ebe6d9', '#d3ccba', f'data-area="{area["id"]}"'); poly(area['polygon'], 'url(#pave)'); continue
        if 'parking' in pid:
            poly(area['polygon'], '#c9cbc6', '#b4b7b0', f'data-area="{area["id"]}"')
            xs = [p[0] for p in area['polygon']]; ys = [p[1] for p in area['polygon']]
            for yy in range(int(min(ys)) + 8, int(max(ys)) - 4, 11):
                A(f'<path d="M{min(xs)+4} {yy}h{(max(xs)-min(xs))*.32:.0f}M{max(xs)-4} {yy}h-{(max(xs)-min(xs))*.32:.0f}" stroke="#fff" stroke-width="1"/>')
            continue
        colour = '#cfe3bb' if area['category'] == '景观' else '#d3e2cf' if 'startup' in pid else '#cfe0c6'
        if 'startup' in pid: colour = '#f3f0e6'
        poly(area['polygon'], colour, '#bcd3ab', f'data-area="{area["id"]}" stroke-width="1"')
    for pz in EXTRA_PAVED: poly(pz, '#ebe6d9', '#d3ccba'); poly(pz, 'url(#pave)')
    poly(COMPOUND, '#e4decd', '#cdc5b1', 'stroke-width="1.5" stroke-dasharray="6 4"')   # 教工家属院（围墙内，不通行）
    # water
    path(RIVER, '#bcd9b4', 62); path(RIVER, '#8ccbe0', 44); path(RIVER, '#b6e1ee', 28)
    path('M1800 -53 L1884 -50', '#c3c7bc', 19); path('M1800 -53 L1884 -50', '#fbfaf6', 16)   # 北侧集镇街跨河
    # 太乙宫正街: outside the campus, drawn as an asphalt street with sidewalks
    # curbs at x≈1062 / 1135 as on the plan; nothing paved between the east curb and 西译宾馆
    path(STREET, '#d4d6cf', 75); path(STREET, '#a3a8a2', 71); path(STREET, '#ffffff', 1.6, 'stroke-dasharray="16 12" opacity=".85"')
    # gate entrances: paving from the curb to the campus road
    gate_pos = {'gate': (1137, 282, '北门'), 'gate-south': (1137, 700, '南门'), 'gate-small': (1180, 1230, '小南门'), 'west-gate': (1062, 927, '西区正门')}
    entries = [(gate_pos[i][:2], tuple(nodes[endpoints[i]])) for i, p, n in gates]
    # campus roads: casing then paving
    for n, k, a, b in campus_roads:
        w = road_w(n, k); path(f'M{fmt(a)}L{fmt(b)}', '#adb3a6' if k != 'bridge' else '#a99b78', w + 3)
    for a, b in entries: path(f'M{fmt(a)}L{fmt(b)}', '#adb3a6', 21)
    for n, k, a, b in campus_roads:
        w = road_w(n, k); path(f'M{fmt(a)}L{fmt(b)}', '#eceae3' if k != 'bridge' else '#efe4c8', w)
    for a, b in entries: path(f'M{fmt(a)}L{fmt(b)}', '#eceae3', 18)
    # 诒文大道与诒德大道交口的雕塑环岛（原图）
    A('<circle cx="1548" cy="282" r="19" fill="#eceae3" stroke="#adb3a6" stroke-width="1.5"/><circle cx="1548" cy="282" r="12" fill="#7cb36a"/><ellipse cx="1548" cy="281" rx="3.5" ry="8" fill="#e8e4d6"/>')
    # sports grounds
    for x, y, w, h in [(1884,389,140,224),(1877,621,169,134),(1877,770,169,45),(1875,837,134,112),(369,569,166,133),(215,572,123,105)]:
        track = x == 1884
        rect(x, y, w, h, '#cf8f78' if track else '#5fae8c', w / 2 if track else 4)
        if track:
            for inset in (4, 8, 12): A(f'<rect x="{x+inset}" y="{y+inset}" width="{w-2*inset}" height="{h-2*inset}" rx="{w/2-inset}" fill="none" stroke="#f6e7d9" stroke-width="1.2"/>')
        m = 20 if track else 7
        rect(x + m, y + m * 1.7, w - m * 2, h - m * 3.4, '#6fb46f' if track else '#4f9f7c', 2)
        A(f'<rect x="{x+m}" y="{y+m*1.7}" width="{w-2*m}" height="{h-m*3.4}" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="{x+w/2}" cy="{y+h/2}" r="10" fill="none" stroke="#fff" stroke-width="1.3"/>')
        A(f'<path d="M{x+m},{y+h/2}h{w-m*2}" stroke="#fff" stroke-width="1"/>')
    for i in range(6): rect(232 + i * 17, 800, 9, 17, '#5c8fbf', 1)   # 乒乓球台
    # ---- trees ----
    rnd = random.Random(412); trees = []
    belt = next((a['polygon'] for a in areas if a['place'] == 'w-green-belt'), None)
    def scatter(polygon, n, rmin=5, rmax=10, margin=4):
        xs = [p[0] for p in polygon]; ys = [p[1] for p in polygon]; got = tries = 0
        while got < n and tries < n * 40:
            tries += 1
            x, y = rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys))
            if inside(x, y, polygon) and clear(x, y, margin):
                trees.append((x, y, rnd.uniform(rmin, rmax), rnd.random())); got += 1
    if belt: scatter(belt, 620, 6, 13)
    for area in areas:
        if area['category'] == '景观' and area['place'] not in PAVED and area['place'] != 'w-green-belt':
            poly_ = area['polygon']; xs = [p[0] for p in poly_]; ys = [p[1] for p in poly_]
            scatter(poly_, int((max(xs) - min(xs)) * (max(ys) - min(ys)) / 900) + 2, 4, 8)
    for pg, n in GREEN_PATCHES:
        if n: scatter(pg, n, 5, 11)
    scatter([(1268,306),(1332,306),(1332,348),(1372,348),(1372,412),(1268,412)], 22, 4, 9)   # 家属院花园
    scatter([(1140,460),(1205,460),(1205,650),(1140,650)], 14, 4, 8)
    # roadside trees where the panoramas measured canopy
    for e in edges:
        if e['role'] != 'campus' or e['kind'] in ('access', 'bridge', 'sky'): continue
        tv = e['shadeSrc']['canopy']
        if tv < .3: continue
        a, b = nodes[e['a']], nodes[e['b']]
        L = math.dist(a, b)
        if L < 6: continue
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L; nx, ny = -uy, ux
        w = road_w(e['name'], e['kind']); off = w / 2 + 5; step = max(9, 30 - 26 * tv)
        t = step / 2
        while t < L:
            for sgn in (1, -1):
                x, y = a[0] + ux * t + nx * off * sgn, a[1] + uy * t + ny * off * sgn
                if clear(x, y, 1.5): trees.append((x, y, 4.2 + 3.5 * tv, rnd.random()))
            t += step
    greens = ['#8fbf78', '#7cb36a', '#9ccb83', '#6ea85f', '#b5c96a']
    for x, y, r, k in ([] if ground else trees): A(f'<circle cx="{x+1.5:.1f}" cy="{y+2.5:.1f}" r="{r:.1f}" fill="#5e7f52" opacity=".22"/>')
    for x, y, r, k in ([] if ground else trees):
        c = greens[int(k * len(greens)) % len(greens)]
        A(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}"/><circle cx="{x-r*.3:.1f}" cy="{y-r*.3:.1f}" r="{r*.45:.1f}" fill="#ffffff" opacity=".14"/>')
    # ---- buildings ----
    for ident, cat, shape in structures:
        if ground:
            poly(shape, '#d8d4c8', '#bdb8aa', 'stroke-width="1"'); continue
        if ident.startswith(('e-office', 'w-office')) or ident == 'tech': fill, stroke = OFFICE
        elif ident == 'library': fill, stroke = LIBRARY
        elif 'guard' in ident: fill, stroke = GUARD
        else: fill, stroke = BUILD.get(cat, ('#e4e8df', '#b5c5c9'))
        poly([[x + 3, y + 5] for x, y in shape], '#566a5c', 'none', 'class="side" opacity=".32"')
        poly(shape, fill, stroke, f'stroke-width="1.3" data-building="{escape(ident)}"')
        if len(shape) == 4:
            x, y = shape[0]; r, b = shape[2]
            if r - x > 22 and b - y > 17: A(f'<rect x="{x+3.5}" y="{y+3.5}" width="{r-x-7}" height="{b-y-7}" rx="1" fill="none" stroke="#ffffff" stroke-opacity=".45"/>')
    # doors: brown = main door (正门), blue = back door (后门, marked by the team), grey = side door
    for dr in doors:
        w, h = (7, 3.6) if dr['kind'] == 'main' else (5, 2.8)
        if dr['side'] in 'EW': w, h = h, w
        A(f'<rect x="{dr["x"]-w/2:.1f}" y="{dr["y"]-h/2:.1f}" width="{w}" height="{h}" rx="1" fill="{ {"main": "#6b3f22", "back": "#3d6889"}.get(dr["kind"], "#7f8784") }" stroke="#fff" stroke-width=".8" data-door="{dr["kind"]}"/>')
    # 钟塔
    if not ground: A('<g transform="translate(1606 640)"><rect x="-6" y="-62" width="12" height="62" fill="#c7765a"/><rect x="-8" y="-70" width="16" height="10" fill="#a95d45"/><circle cx="0" cy="-52" r="4" fill="#f6efe0"/></g>')
    # ---- 西译天渡: one continuous deck, landings only on the campus side ----
    sky = [(a, b) for n, k, a, b, role in roads if role == 'skybridge']
    xs = [p[0] for s in sky for p in s]; y0 = sky[0][0][1]
    x0, x1 = min(xs), max(xs)
    for f in FENCES: A(f'<path d="{f}" stroke="#4b5a52" stroke-width="2.4" stroke-dasharray="3 2"/>')
    if not ground: path(f'M{x0} {y0}L{x1} {y0}', '#ffffff', 22); path(f'M{x0} {y0}L{x1} {y0}', '#3f78b0', 15); path(f'M{x0} {y0}L{x1} {y0}', '#d7e9f8', 8)
    for x in (() if ground else (x0, x1)):
        rect(x - 7, y0 - 13, 14, 26, '#3f78b0', 3)
        for k in range(4): A(f'<path d="M{x-5} {y0-9+k*6}h10" stroke="#d7e9f8" stroke-width="1.4"/>')
    if not ground: label((x0 + x1) / 2, y0 - 13, '西译天渡', 9, '#2f5f8f', 700, 2)
    # ---- gates on the campus boundary ----
    for ident, point, name in gates:
        gx, gy, t = gate_pos[ident]
        A(f'<path d="M{gx} {gy-14}V{gy+14}" stroke="#2c6a52" stroke-width="3"/><circle cx="{gx}" cy="{gy-14}" r="3.4" fill="#2c6a52"/><circle cx="{gx}" cy="{gy+14}" r="3.4" fill="#2c6a52"/>')
        if ident == 'gate-small':   # 学生不能通行：栏杆 + 禁行标志
            A(f'<path d="M{gx-9} {gy-14}V{gy+14}" stroke="#c0504d" stroke-width="4" stroke-dasharray="5 3"/><g transform="translate({gx-30} {gy})"><circle r="9" fill="#fff" stroke="#c0504d" stroke-width="3"/><path d="M-6 -6L6 6" stroke="#c0504d" stroke-width="3"/></g>')
    # ---- labels ----
    if not ground: A('<g transform="translate(95 122)" font-family="Microsoft YaHei,sans-serif"><path d="M0 -18h41" stroke="#4f7e66" stroke-width="4"/><text fill="#3f5f4f" font-size="31" font-weight="600" letter-spacing="3">西安翻译学院</text><text y="30" font-family="Arial,sans-serif" fill="#6f8478" font-size="14" letter-spacing="3">TAIYIGONG CAMPUS  /  WALKING ATLAS</text></g>')
    if not ground: label(500, 470, '西 区 林 带', 25, '#5f8a57'); label(482, 767, '西 校 区', 20, '#56705f'); label(1632, 900, '东 校 区', 22, '#56705f')
    A('<text transform="translate(1098 470) rotate(-90)" text-anchor="middle" font-family="Microsoft YaHei" font-size="17" font-weight="600" letter-spacing="6" fill="#ffffff">太乙宫正街（校外 · 商业街）</text>')
    surroundings.draw_labels(A, lambda v: escape(v, quote=True))
    A('<g fill="none" stroke="none">' + ''.join(f'<path data-road-name="{escape(n, quote=True)}" d="M{fmt(a)}L{fmt(b)}"/>' for n, k, a, b, role in roads) + '</g></svg>')
    out_path.write_text(''.join(svg), encoding='utf8')
    return trees
    return len(trees)
