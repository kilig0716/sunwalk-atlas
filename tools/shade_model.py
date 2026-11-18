"""Summer shade model for every walkway segment.

Two independent sources, combined per segment and per hour (07:00 … 19:00, see HOURS; before sunrise and after
sunset there is no sun and the app counts no exposure):

1. Tree shade (林荫) — measured, then interpolated.
   * 39 ground-level scenes of the 720 云 work《西安翻译学院全景校园》(a2bjzOkfrk4, shot in summer
     with full foliage) were classified pixel by pixel on the upper hemisphere (sky / vegetation /
     structure, cos-weighted, azimuth-averaged). Measured 2026-11-09 from the player's own
     cube preview (256 px per face) inside a normal browser session.
   * hi band = elevation 55-90°, lo band = 18-50°.
   * Between scenes, the share of tree-crown pixels in the school plan (assets/school-plan.jpg)
     within ±24 px of the segment is the spatial covariate: a linear fit on the scenes, plus an
     inverse-distance correction of the scene residuals that fades out beyond ~200 px.
2. Building shade (楼荫) — computed.
   * Footprints from the atlas, heights from typical storeys per category (estimates, see HEIGHTS),
     sun position for 1 September (开学季) at 34.02°N, 108.95°E, Beijing time.

shade(t) = 1 - (1 - tree(t)) * (1 - building(t)). All values are scenario estimates.
"""
import math
from pathlib import Path

SCALE = 0.60  # metres per plan pixel (nominal, checked against AMap)
LAT, LON = 34.02, 108.95
DATE = (2026, 9, 1)
HOURS = (7, 8, 10, 12, 14, 16, 18, 19)   # daylight samples; 08 / 12 / 16 are the original three

# id, title, plan x, y, road, hi(sky, veg, bld), lo(sky, veg, bld)
SCENES = [
 (15468029,'东区北门',1175,282,'诒文大道',(.983,.006,.011),(.550,.074,.376)),
 (15468030,'进入校园',1250,282,'诒文大道',(1.0,0,0),(.471,.330,.199)),
 (15468031,'诒文大道',1450,282,'诒文大道',(.993,.007,0),(.448,.548,.005)),
 (15468032,'东区公寓区1',1350,94,'诒强路',(.427,.572,.001),(.278,.521,.201)),
 (15468036,'东区公寓区2',1548,94,'诒强路',(.890,.083,.027),(.403,.338,.259)),
 (15468037,'美食街区',1683,90,'诒强路',(.275,.711,.014),(.449,.334,.216)),
 (15468038,'公寓区小花园',1628,152,'东区北侧公寓花园',(.993,.007,0),(.415,.547,.038)),
 (15468039,'科技楼-图书馆广场',1548,262,'诒德大道',(.927,.046,.027),(.571,.219,.210)),
 (15468060,'诒德大道',1548,480,'诒德大道',(1.0,0,0),(.467,.157,.376)),
 (15468069,'诒鸣广场',1665,560,'诒鸣广场',(.872,.128,0),(.263,.736,.001)),
 (15468070,'诒滨路',1811,450,'诒滨路',(.764,.233,.002),(.512,.486,.001)),
 (15468071,'诒萌路',1874,450,'诒萌路',(.963,.037,0),(.677,.320,.003)),
 (15468072,'体育馆',1874,300,'诒萌路',(.887,.113,0),(.584,.290,.126)),
 (15468075,'篮球场',1953,700,'东区篮球场',(1.0,0,0),(.831,.169,0)),
 (15468076,'诒华广场',1480,850,'诒华广场',(1.0,0,0),(.814,.086,.099)),
 (15468077,'8号楼',1430,805,'八号楼东侧庭院',(.481,.216,.303),(.278,.307,.415)),
 (15468082,'十号教学楼',1520,1070,'十号楼东侧内院',(1.0,0,0),(.517,.201,.282)),
 (23260845,'钟塔',1606,628,'诒鸣广场',(.741,.259,0),(.595,.293,.112)),
 (23260847,'钟塔入口',1590,660,'会议中心',(1.0,0,0),(.754,.103,.142)),
 (23260849,'钟塔广场',1580,612,'诒鸣广场',(.978,0,.022),(.845,.045,.110)),
 (23260851,'终南讲堂外',1680,697,'诒和路',(.679,.316,.005),(.272,.495,.234)),
 (15468085,'诒和路',1450,701,'诒和路',(.657,.341,.001),(.313,.572,.115)),
 (15468086,'东区南门',1175,700,'诒和路',(.651,.344,.005),(.176,.781,.043)),
 (15468089,'西区正门',1030,927,'诒才路',(1.0,0,0),(.672,.136,.192)),
 (15468090,'诒才路-西区3号教学楼',965,927,'诒才路',(1.0,0,0),(.477,.347,.176)),
 (15468091,'诒芳园',905,985,'诒芳园弯路',(.284,.617,.098),(.273,.669,.058)),
 (15468092,'西区4号教学楼',905,1022,'西区四号楼北侧步道',(.742,.210,.048),(.342,.601,.057)),
 (15468093,'诒才路-西区1、2号教学楼',785,927,'诒才路',(.038,.957,.005),(.070,.598,.332)),
 (16046112,'公寓区',860,803,'西区北片公寓步道',(.795,.199,.006),(.696,.210,.094)),
 (15468094,'诒英广场',605,990,'诒英广场',(1.0,0,0),(.632,.141,.227)),
 (15468095,'西区5号楼-艺术与设计学院',560,1000,'诒英广场步道',(.553,.288,.159),(.510,.057,.433)),
 (15468119,'诒颖路',574,760,'诒颖路',(.538,.462,.001),(.361,.586,.053)),
 (15468120,'西区图书馆东侧',430,770,'西区图书馆南侧步道',(.945,.055,0),(.348,.644,.007)),
 (15468126,'西区篮球场',450,705,'西区运动场南侧步道',(1.0,0,0),(.857,.143,0)),
 (15468127,'诒品坊餐厅',455,889,'西区创业街中间通道',(.969,0,.031),(.600,.189,.210)),
 (15468130,'西区图书馆-羽毛球场',300,705,'西区运动场南侧步道',(1.0,0,0),(.875,.103,.023)),
 (15468131,'诒南山高尔夫球练习场',206,700,'西区生活区西侧步道',(.317,.679,.004),(.199,.709,.092)),
 (23260862,'科技楼后花园',1700,375,'科技楼后花园小径',(.968,.017,.015),(.656,.250,.094)),
]
# Not used: aerial overviews (全景西译, 东区校园, 西区校园, 田径场, 高尔夫训练场), an indoor
# statue hall (西译创始人雕像) and 西区图书馆 (camera above the plaza; reads as an aerial shot).
EXCLUDED = {15468023:'航拍',15468024:'航拍',15468026:'航拍',15468025:'航拍/场地中央',15468028:'航拍',
            15468058:'室内',15468121:'机位高于广场'}

HEIGHTS = {'宿舍':20,'教工':18,'教学':22,'生活':9,'运动':16,'交通':4,'景观':1}
from survey3d import BUILDINGS as _SURVEY, SCENERY as _SCENERY
_OLD_OVERRIDES = {'library':32,'tech':30,'conf':20,'staff-5':18,'e-teach9':24,'e-teach8':22,'gym':18,
                    'e-flag-platform':1,'e-guard-north':4,'e-guard-small':4,'w-gate-guard':4,'e-shop':5,
                    'w-carpentry':5,'w-greenhouse':4,'w-power':6,'e-infrastructure-office':6,'e-garage-north':5,'e-garage-south':5}


# storeys counted in the 720 云 panoramas replace the per-category guesses wherever a building was seen
HEIGHT_OVERRIDES = {**_OLD_OVERRIDES, **{k: v['height'] for k, v in _SURVEY.items()}, **{s['id']: s['height'] for s in _SCENERY}}

def tree_targets(hi, lo):
    """Tree shade for a walker: low sun needs the lo band; at noon a walker who keeps to the
    crowned side of the path gains part of the roadside canopy (factor 0.5)."""
    t_lo = lo[1]
    t_hi = hi[1] + 0.5 * lo[1] * (1 - hi[1])
    return t_lo, t_hi


def tree_for(elev, t_lo, t_hi):
    """Tree shade for a sun elevation: the lo band up to 45°, the hi band from 58°, blended between.
    Below the measured lo band (18°) the lo value is kept — an assumption, shade is probably higher."""
    k = max(0.0, min(1.0, (elev - 45) / 13))
    return t_lo + (t_hi - t_lo) * k


def sun_crossing(rising, date=DATE):
    """Beijing-time hour at which the sun's centre crosses the horizon (−0.83° with refraction)."""
    lo, hi = (3.0, 12.0) if rising else (12.0, 22.0)
    for _ in range(40):
        mid = (lo + hi) / 2
        up = sun_position(mid, date)[0] > -0.83
        if up == rising: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def sun_position(hour, date=DATE, lat=LAT, lon=LON, tz=8):
    """NOAA approximation. Returns (elevation°, azimuth° clockwise from north)."""
    y, m, d = date
    n = (date_ordinal(y, m, d) - date_ordinal(y, 1, 1)) + 1
    g = 2 * math.pi / 365 * (n - 1 + (hour - 12) / 24)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    tst = hour * 60 + eqt + 4 * lon - 60 * tz
    ha = math.radians(tst / 4 - 180)
    phi = math.radians(lat)
    cz = math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1, min(1, cz)))
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(phi) - math.tan(decl) * math.cos(phi))) + 180
    return 90 - math.degrees(zen), az % 360


def date_ordinal(y, m, d):
    import datetime
    return datetime.date(y, m, d).toordinal()


class ShadeModel:
    def __init__(self, plan_path, structures, places_by_id):
        import numpy as np
        from PIL import Image, ImageDraw, ImageFilter
        self.np = np
        img = Image.open(plan_path).convert('RGB')
        im = np.asarray(img).astype(int)
        r, g, b = im[..., 0], im[..., 1], im[..., 2]
        mx = im.max(-1); mn = im.min(-1); L = im.mean(-1)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
        canopy = ((g > r) & (g >= b) & (L < 105) & (sat > .25)) | ((r > 140) & (g > 120) & (b < 90) & (r - b > 80) & (np.abs(r - g) < 60) & (L < 165))
        # the plan paints a drop shadow down-right of every block: never count it as canopy
        bmask = Image.new('L', img.size, 0); bd = ImageDraw.Draw(bmask)
        hmap = Image.new('F', img.size, 0.0); hd = ImageDraw.Draw(hmap)
        for ident, cat, poly in structures:
            pts = [tuple(p) for p in poly]
            bd.polygon(pts, fill=255); bd.polygon([(x + 6, y + 9) for x, y in pts], fill=255)
            h = HEIGHT_OVERRIDES.get(ident, HEIGHTS.get(cat, 12))
            hd.polygon(pts, fill=h / SCALE)
        blocked = np.asarray(bmask.filter(ImageFilter.MaxFilter(9))) > 0
        self.canopy = canopy & ~blocked
        self.heights = np.asarray(hmap)
        self.H, self.W = self.heights.shape
        self.suns = [sun_position(h) for h in HOURS]
        self._fit()

    # ---------- covariate ----------
    def canopy_near(self, a, b, half=24):
        np = self.np
        ax, ay = a; bx, by = b
        length = math.hypot(bx - ax, by - ay)
        n = max(2, int(length / 6) + 1)
        nx, ny = ((-(by - ay) / length, (bx - ax) / length) if length else (0, 1))
        hits = tot = 0
        for i in range(n):
            t = i / (n - 1)
            cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
            for o in range(-half, half + 1, 4):
                x, y = int(round(cx + nx * o)), int(round(cy + ny * o))
                if 0 <= x < self.W and 0 <= y < self.H:
                    tot += 1; hits += bool(self.canopy[y, x])
        return hits / tot if tot else 0.0

    def _fit(self):
        xs, lo, hi = [], [], []
        for sid, name, x, y, road, h, l in SCENES:
            c = self.canopy_near((x - 18, y), (x + 18, y), 30) * .5 + self.canopy_near((x, y - 18), (x, y + 18), 30) * .5
            t_lo, t_hi = tree_targets(h, l)
            xs.append(c); lo.append(t_lo); hi.append(t_hi)
        def linfit(X, Y):
            n = len(X); mx = sum(X) / n; my = sum(Y) / n
            sxx = sum((x - mx) ** 2 for x in X) or 1e-9
            b = sum((x - mx) * (y - my) for x, y in zip(X, Y)) / sxx
            return my - b * mx, b
        self.fit_lo = linfit(xs, lo); self.fit_hi = linfit(xs, hi)
        self.res = []
        for (sid, name, x, y, road, h, l), c, tl, th in zip(SCENES, xs, lo, hi):
            self.res.append((sid, name, x, y, road, tl - (self.fit_lo[0] + self.fit_lo[1] * c), th - (self.fit_hi[0] + self.fit_hi[1] * c), c))
        # leave-one-out check of the interpolation, reported in docs
        errs = []
        for i, (sid, name, x, y, road, rl, rh, c) in enumerate(self.res):
            pred = self._tree_at(x, y, c, road, skip=i)[0]
            errs.append(abs(pred - lo[i]))
        self.loo_mae = sum(errs) / len(errs)
        self.covariates = xs

    def _tree_at(self, x, y, c, road=None, skip=None):
        a_lo, b_lo = self.fit_lo; a_hi, b_hi = self.fit_hi
        base_lo, base_hi = a_lo + b_lo * c, a_hi + b_hi * c
        wsum = rl = rh = 0.0; near = None
        for i, (sid, name, sx, sy, sroad, r_lo, r_hi, sc) in enumerate(self.res):
            if i == skip: continue
            d = math.hypot(sx - x, sy - y)
            if road and sroad == road: d *= 0.6  # same named road: stronger evidence
            if d > 220: continue
            w = 1 / (d * d + 35 * 35)
            wsum += w; rl += w * r_lo; rh += w * r_hi
            if near is None or d < near[1]: near = (sid, d)
        fade = math.exp(-(near[1] if near else 999) / 120)
        if wsum:
            base_lo += fade * rl / wsum; base_hi += fade * rh / wsum
        clamp = lambda v: max(0.0, min(.95, v))
        return clamp(base_lo), clamp(base_hi), near

    # ---------- buildings ----------
    def building_shadow(self, a, b):
        out = []
        ax, ay = a; bx, by = b
        length = math.hypot(bx - ax, by - ay)
        n = max(2, int(length / 6) + 1)
        for elev, az in self.suns:
            if elev <= 2:
                out.append(1.0); continue
            dx, dy = math.sin(math.radians(az)), -math.cos(math.radians(az))
            tan_e = math.tan(math.radians(elev))
            maxd = 34 / SCALE / tan_e
            shaded = 0
            for i in range(n):
                t = i / (n - 1)
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                d = 3.0
                while d <= maxd:
                    x, y = int(px + dx * d), int(py + dy * d)
                    if not (0 <= x < self.W and 0 <= y < self.H): break
                    h = self.heights[y, x]
                    if h > 0 and h > d * tan_e:
                        shaded += 1; break
                    d += 2.0
            out.append(shaded / n)
        return out

    # ---------- per segment ----------
    def segment(self, a, b, name, role):
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if role == 'skybridge':
            t_lo = t_hi = 0.0; near = None
        else:
            c = self.canopy_near(a, b)
            t_lo, t_hi, near = self._tree_at(mid[0], mid[1], c, name)
        tree = [tree_for(elev, t_lo, t_hi) for elev, az in self.suns]
        bld = self.building_shadow(a, b)
        shade = [round(1 - (1 - t) * (1 - s), 2) for t, s in zip(tree, bld)]
        if near and near[1] <= 70: grade = '实景测点'
        elif near: grade = '实景插值'
        else: grade = '校图树冠估算'
        src = dict(grade=grade, scene=near[0] if near else None, meters=round(near[1] * SCALE) if near else None,
                   tree=[round(v, 2) for v in tree], building=[round(v, 2) for v in bld], canopy=round((2 * t_lo + t_hi) / 3, 3),
                   lo=round(t_lo, 3), hi=round(t_hi, 3))   # lo / hi let the page recompute tree shade for any sun elevation (dist/sun.js)
        return shade, src

    def summary(self):
        return dict(
            method='720云实景天空遮挡测量 + 校图树冠插值 + 楼栋阴影投影',
            season='夏季满叶（720云原作拍摄于夏季）；太阳位置取 9 月 1 日晴天',
            date='%04d-%02d-%02d' % DATE, hours=list(HOURS), sunrise=round(sun_crossing(True), 2), sunset=round(sun_crossing(False), 2),
            sun=[dict(hour=h, elevation=round(e, 1), azimuth=round(a, 1)) for h, (e, a) in zip(HOURS, self.suns)],
            fitLow=[round(v, 3) for v in self.fit_lo], fitHigh=[round(v, 3) for v in self.fit_hi],
            looMAE=round(self.loo_mae, 3), scenes=len(SCENES),
            heights=HEIGHTS, scale=SCALE,
            # what dist/sun.js needs to repeat the date-dependent part for the current day
            designDate='%04d-%02d-%02d' % DATE, lat=LAT, lon=LON, heightOverrides=HEIGHT_OVERRIDES, defaultHeight=12)

    def panoramas(self):
        out = []
        for (sid, name, x, y, road, h, l), c in zip(SCENES, self.covariates):
            t_lo, t_hi = tree_targets(h, l)
            out.append(dict(id=sid, name=name, x=x, y=y, road=road, sky=[h[0], l[0]], veg=[h[1], l[1]], structure=[h[2], l[2]],
                            tree=[round(t_lo, 2), round(t_hi, 2)], canopy=round(c, 3)))
        return out
