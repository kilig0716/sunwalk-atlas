"""Off-campus scenery around the school plan, traced from the AMap (高德) base map.

Source: 高德地图 Web 端底图（© AutoNavi，GS(2025)5996号），2026-11-10 在本机浏览器中以 16—18 级
查看校园四周后人工描绘。只取“周边有什么、道路怎么接”这一层信息：道路走向、村镇与机构名称。

IMPORTANT — this is a schematic, not a survey:
  * The school plan draws 太乙宫正街 as a north–south line; on AMap it runs about N12°E, and the plan's
    scale differs from place to place (0.45—0.60 m/px against AMap). Off-campus features are therefore
    placed by which gate / road / bank they adjoin, and far features (包茂高速、沙场村、土台子) are pulled in
    toward the campus so they fit the margin.
  * Off-campus roads here are drawn only; they are NOT part of the walking graph. The only walkable
    off-campus edge remains 太乙宫正街 between the four gates.

Scale check against AMap (GCJ-02, zoom 18, 0.495 m/px):
  北大门 → 图书馆环岛  ≈ 246 m  = 411 plan px → 0.60 m/px
  北大门 → 西南门(小南门) ≈ 545 m = 949 plan px → 0.57 m/px
  西门(南门) → 西区东门(西区正门) ≈ 107 m = 239 plan px → 0.45 m/px
AMap gate names: 北大门 = 图上“北门”; 西门 = 图上“南门”; 西南门 = 图上“小南门”; 东门(西区) = 图上“西区正门”;
北墙门 = 东区北墙近河处（图上未标）。
"""
import random

EXTENT = (-300, -260, 2388, 1620)          # x0, y0, x1, y1 of the drawn map (plan itself is 0..2048 × 0..1320)

STREET = 'M1098 -260 L1098 1050 C1101 1125 1132 1205 1160 1335 L1186 1432 L1200 1482 L1190 1560 L1172 1620'
RIVER = ('M1842 -260 L1842 759 Q1843 820 1842 850 Q1837 920 1820 950 L1790 1000 L1762 1050 L1734 1100 L1707 1150 '
         'L1689 1200 L1627 1320 L1560 1396 L1420 1436 L1270 1446 L1190 1452 L1128 1490 L1078 1620')

# built-up areas (集镇 / 村庄): polygon, name of the area for the report
BUILT = [
    ('太乙宫集镇（街北）', [(1140,-260),(1800,-260),(1800,-74),(1140,-74)]),
    ('北墙外临街', [(1140,-50),(1800,-48),(1800,10),(1140,10)]),
    ('正街西侧商业', [(900,-260),(1058,-260),(1058,338),(960,338),(905,180)]),
    ('四皓村南区—教工住宅小区—家属区', [(380,1125),(512,1125),(512,1217),(1060,1217),(1086,1300),(1146,1440),(1136,1620),(700,1620),(560,1400),(430,1262)]),
    ('四皓村（街东）', [(1206,1332),(1330,1332),(1304,1424),(1202,1424)]),
    ('西安翻译驾校', [(2062,60),(2150,60),(2146,330),(2062,330)]),
    ('沙场村', [(2236,-210),(2388,-210),(2388,270),(2252,270)]),
    ('东南民宿片', [(1990,1430),(2330,1400),(2340,1570),(2010,1585)]),
    ('南五台服务区', [(-300,150),(-150,92),(-96,150),(-240,240),(-300,250)]),
]
# roads that are drawn only: (name or '', width, path, kind)
ROADS = [
    ('', 16, 'M1098 -62 L1500 -60 L1842 -52 L2180 -34 L2388 16', 'town'),
    ('', 15, 'M2236 -260 L2206 300 L2172 800 L2110 1130 L1940 1392 L1650 1506 L1340 1536 L1196 1522', 'main'),
    ('', 8, 'M2120 1092 L2388 1066', 'lane'),
    ('', 8, 'M1990 1338 L2180 1400 L2388 1372', 'lane'),
    ('', 8, 'M512 1232 L1070 1240', 'lane'),
    ('', 7, 'M690 1238 L716 1420 L900 1440 L1126 1396', 'lane'),
    ('', 7, 'M900 1440 L930 1620', 'lane'),
    ('', 7, 'M-300 824 L-150 796 L-104 716 L-92 1020 L-60 1620', 'lane'),
    ('', 8, 'M1058 120 L905 126 L720 60 L620 -260', 'lane'),
    ('', 7, 'M1300 -74 L1300 -260', 'lane'),
    ('', 7, 'M1560 -74 L1566 -260', 'lane'),
]
HIGHWAY = 'M-300 124 L170 -62 L590 -260'      # 包茂高速（示意压近）
PONDS = [(790, 1332, 30, 20)]
# points of interest: (name, x, y, kind)   kind: gov / life / school / stay / village / transit
POIS = [
    ('太乙宫派出所', 1180, -22, 'gov'), ('中国邮政储蓄银行', 1236, -98, 'life'), ('太乙农贸市场', 1380, -140, 'life'),
    ('客都超市', 1228, -176, 'life'), ('太乙宫街道卫生院', 1420, -214, 'gov'), ('太乙街道中心小学', 1660, -196, 'school'),
    ('北墙门', 1792, -22, 'transit'),
    ('汇成广场', 1004, 262, 'life'), ('秦农银行', 1010, 150, 'life'), ('太乙宫供电所', 970, 60, 'gov'),
    ('人和温泉酒店', 992, -40, 'stay'), ('天亮宾馆', 1000, -130, 'stay'),
    ('西安翻译驾校', 2106, 196, 'school'), ('沙场村村委会', 2300, 318, 'gov'), ('沙场村小学', 2330, 110, 'school'),
    ('终南月色温泉民宿', 2268, 1040, 'stay'), ('忆青山茶餐厅', 2060, 1450, 'life'), ('陕西启行单招教育', 2220, 1520, 'school'),
    ('四皓村南区', 700, 1290, 'village'), ('西安翻译学院教工住宅小区', 930, 1500, 'village'), ('西安翻译学院家属区', 880, 1596, 'village'),
    ('太乙宫街道办事处', 1262, 1352, 'gov'), ('川码头老成都石锅鱼', 1262, 1404, 'life'), ('翠咖啡', 1240, 1574, 'life'),
    ('南五台服务区', -214, 196, 'transit'),
]
VILLAGES = [('沙场村', 2318, -60), ('四皓村', 1260, 1304), ('和平村 ←', -214, 900), ('西岔村 ↑', 1420, -244)]
ARROWS = [  # edge-of-map direction notes
    ('↑ 关中环线 · 107 省道 · 西安市区方向', 1098, -244, 0),
    ('↓ 土台子 · 太峪村 · 翠华山方向', 1178, 1606, 0),
    ('→ 沙场村 · 太乙村', 2330, 30, 0),
    ('↑ 接 107 省道', 2236, -244, 0),
]
POI_COLOUR = {'gov': '#c0504d', 'life': '#d08a2e', 'school': '#3d82c4', 'stay': '#7a68c8', 'village': '#6b6f66', 'transit': '#2c6a52'}


def _inside(x, y, poly):
    odd = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax: odd = not odd
    return odd


def draw(A, esc):
    """Append the off-campus layer to the SVG fragment list via A(str)."""
    x0, y0, x1, y1 = EXTENT
    A('<defs><pattern id="field" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">'
      '<path d="M0 0h46M0 23h46" stroke="#c5d1db" stroke-width="1"/><path d="M12 0v23M34 23v23" stroke="#d2dce2" stroke-width=".8"/></pattern></defs>')
    A(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="#e1e7ec"/><rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="url(#field)"/>')
    # woodland north of the west campus continues up to the expressway
    A('<polygon points="-300,268 25,265 550,265 622,345 905,345 905,180 700,-40 420,-170 170,-62 -300,124" fill="#d3e4bf"/>')
    rnd = random.Random(20261110)
    for name, poly in BUILT:
        pts = ' '.join(f'{x},{y}' for x, y in poly)
        A(f'<polygon points="{pts}" fill="#ecebe6" stroke="#d6d3ca" stroke-width="1.5" data-outside="{esc(name)}"/>')
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
        y = min(ys) + 14
        while y < max(ys) - 12:
            x = min(xs) + 12 + rnd.uniform(0, 10)
            while x < max(xs) - 12:
                w, h = rnd.choice([(30, 14), (24, 16), (36, 13), (20, 20)])
                if all(_inside(px, py, poly) for px, py in ((x, y), (x + w, y), (x, y + h), (x + w, y + h))):
                    A(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w}" height="{h}" fill="#dcd8ce" stroke="#c9c4b8" stroke-width=".8"/>')
                x += w + rnd.uniform(12, 22)
            y += rnd.uniform(30, 38)
    for cx, cy, rx, ry in PONDS: A(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#a9d6ea" stroke="#8cc3db"/>')
    for name, w, d, kind in ROADS:
        A(f'<path d="{d}" fill="none" stroke="#c3c7bc" stroke-width="{w+3}" stroke-linecap="round" stroke-linejoin="round"/>')
    for name, w, d, kind in ROADS:
        A(f'<path d="{d}" fill="none" stroke="{"#fbfaf6" if kind != "main" else "#f6efd9"}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
    A(f'<path d="{HIGHWAY}" fill="none" stroke="#c98a3a" stroke-width="30" stroke-linecap="butt"/><path d="{HIGHWAY}" fill="none" stroke="#f3b25c" stroke-width="24"/>'
      f'<path d="{HIGHWAY}" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="14 10"/>')
    A('<text transform="translate(70 -4) rotate(-21.6)" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="15" font-weight="600" letter-spacing="6" fill="#7a4a12">包茂高速</text>')


def draw_labels(A, esc):
    f = 'font-family="Microsoft YaHei,sans-serif"'
    halo = 'paint-order="stroke" stroke="#f4f3ee" stroke-width="3" stroke-linejoin="round"'
    for name, x, y, kind in POIS:
        c = POI_COLOUR[kind]
        A(f'<g data-poi="{esc(name)}"><circle cx="{x-7}" cy="{y-5}" r="5" fill="{c}" stroke="#fff" stroke-width="1.2"/>'
          f'<text x="{x+2}" y="{y}" {f} font-size="13" fill="#4d514a" {halo}>{esc(name)}</text></g>')
    for name, x, y in VILLAGES:
        A(f'<text x="{x}" y="{y}" text-anchor="middle" {f} font-size="17" font-weight="600" letter-spacing="2" fill="#5c6157" {halo}>{esc(name)}</text>')
    for text, x, y, _ in ARROWS:
        A(f'<text x="{x}" y="{y}" text-anchor="middle" {f} font-size="15" font-weight="600" fill="#2f5f4b" {halo}>{esc(text)}</text>')
    A(f'<text x="2372" y="1608" text-anchor="end" {f} font-size="10" fill="#7b8177" {halo}>校外部分据高德地图示意描绘，距离经压缩，不参与步行计算</text>')
