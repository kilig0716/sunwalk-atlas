"""Make room for the paths the team drew (2026-11-17) by moving the buildings beside them.

The school plan packs the buildings tightly. Most of the paths the team added run through gaps of 2-6 px, so the drawn
road (11 px plus a 1.5 px edge on each side) disappeared under the buildings. Here every building gets an offset and a
scale along each axis, and each straight team path may slide sideways by up to 4 px (the hand-drawn strokes are not
more precise than that). The smallest change is chosen - sliding a building is cheap, shrinking it costs more, and the
large buildings cost more still - such that
  * every team path has its full drawn width clear of buildings,
  * no building comes closer to any other road than it is now (or than that road's drawn half-width),
  * buildings side by side keep a gap of at least 2 px (or what they have now) and stay inside the campus outline,
  * no building grows; ordinary buildings shrink by at most 25 % along an axis, large ones by at most 12 %,
    and no building moves more than 12 px.
Each axis is a small convex quadratic programme (the paths and almost all buildings are axis-aligned), solved with
Hildreth's method. A path that cannot get a full lane within those limits is drawn at footpath width instead, and the
report says so.
"""
import math
from render_map import WIDTH, WIDE, CAMPUS_WEST, CAMPUS_EAST

CASING, MARGIN, PAIR_GAP = 1.5, .5, 2.0
REQ = {'lane': WIDTH['lane'] / 2 + CASING + MARGIN, 'narrow': WIDTH['narrow'] / 2 + CASING + MARGIN}   # 7.5 px and 6 px
TOWER_PARENT = {'e7-tower': 'e-teach7', 'conf-tower': 'conf'}
MAX_MOVE, SLIDE, NEAR = 12.0, 8.0, 45.0
SLIDE_ROADS = {}   # existing roads allowed to shift as well: {name: (cost per px^2, largest shift)}. Empty: 诒强路,
                   # which this needed, is now moved 9 px north in build_detail.py itself
BIG_AREA = 9000          # px^2: library, tech, dining, the large teaching blocks
COST = {'move': 1.0, 'move_big': 3.0, 'slide': 2.0}
# shrinking is priced by the fraction lost, so a long building gives up a few px more readily than a short one does;
# dormitory slabs are kept closest to their drawn depth
SHRINK = {'宿舍': 6000.0, 'other': 3000.0}
KMIN = {'normal': .75, 'big': .80}


def half_width(name, kind): return WIDE.get(name, WIDTH.get(kind, 10)) / 2
def bbox(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]; return (min(xs), min(ys), max(xs), max(ys))
def orient(a, b):
    dx, dy = abs(b[0] - a[0]), abs(b[1] - a[1])
    return 1 if dy <= .2 * dx else 0 if dx <= .2 * dy else None     # 1: runs along x (constrains y); 0: runs along y


def extent(poly, axis, lo, hi):
    """lowest and highest coordinate of the polygon along `axis`, looking only at the band lo..hi of the other axis"""
    o, vals = 1 - axis, []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        if lo - 1e-9 <= p[o] <= hi + 1e-9: vals.append(p[axis])
        for edge in (lo, hi):
            if (p[o] - edge) * (q[o] - edge) < 0:
                t = (edge - p[o]) / (q[o] - p[o]); vals.append(p[axis] + t * (q[axis] - p[axis]))
    return (min(vals), max(vals)) if vals else None


class QP:
    """minimise sum w_k (x_k - x0_k)^2 subject to rows  sum(coef * x) >= rhs   (Hildreth: coordinate ascent on the dual)"""
    def __init__(self): self.x0, self.w, self.rows = [], [], []
    def var(self, x0, w): self.x0.append(float(x0)); self.w.append(w); return len(self.x0) - 1
    def ge(self, terms, rhs, tag=None): self.rows.append((terms, float(rhs), tag))
    def solve(self, sweeps=8000, tol=1e-4):
        x, lam = list(self.x0), [0.0] * len(self.rows)
        den = [sum(c * c / self.w[v] for v, c in t) for t, _, _ in self.rows]
        for _ in range(sweeps):
            worst = 0.0
            for k, (t, rhs, _) in enumerate(self.rows):
                r = rhs - sum(c * x[v] for v, c in t)
                new = max(0.0, lam[k] + r / den[k]); step = new - lam[k]
                if step:
                    lam[k] = new
                    for v, c in t: x[v] += c * step / self.w[v]
                worst = max(worst, r)
            if worst < tol: break
        bad = [(round(rhs - sum(c * x[v] for v, c in t), 2), tag) for t, rhs, tag in self.rows]
        return x, [b for b in bad if b[0] > .05]


def _on_interior(p, a, b, margin):
    """is p on segment a-b, at least `margin` from its ends"""
    vx, vy = b[0] - a[0], b[1] - a[1]; L = math.hypot(vx, vy)
    if L < 1e-9: return False
    t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L
    d = abs((p[0] - a[0]) * vy - (p[1] - a[1]) * vx) / L
    return d < .05 and margin <= t <= L - margin


def make_room(structures, places, roads, team, log=print, allow_narrow=True, sweeps=8000):
    ids = [s[0] for s in structures if s[0] not in TOWER_PARENT]
    poly = {s[0]: s[2] for s in structures}; cat = {s[0]: s[1] for s in structures}
    bb = {i: bbox(poly[i]) for i in ids}
    big = {i for i in ids if (bb[i][2] - bb[i][0]) * (bb[i][3] - bb[i][1]) > BIG_AREA}
    width_kind = {n: 'lane' for n, k, a, b, r in roads if n in team}
    # straight pieces: segments of one road exactly along x or y at the same coordinate. A piece of a team path (or one
    # of SLIDE_ROADS) may shift sideways when every road that ends on it runs across it (that road then stretches
    # along) and its own ends are free, or are such crossings, or sit inside a crossing road with room to slide
    line_of, lines = {}, {}
    for k, (n, kind, a, b, role) in enumerate(roads):
        ax = orient(a, b)
        if ax is None or abs(a[ax] - b[ax]) > .01: continue
        key = (n, ax, round(a[ax], 2)); lines.setdefault(key, []).append(k); line_of[k] = key
    slide = {}
    for key, ks in lines.items():
        n, ax, at = key; o = 1 - ax
        if n in team: cost, most = COST['slide'], SLIDE
        elif n in SLIDE_ROADS: cost, most = SLIDE_ROADS[n]
        else: continue
        lo = min(min(roads[k][2][o], roads[k][3][o]) for k in ks); hi = max(max(roads[k][2][o], roads[k][3][o]) for k in ks)
        ok, deps = True, []
        for j, (m, kind, c, d, role) in enumerate(roads):
            if j in ks: continue
            for end, e in ((2, c), (3, d)):
                if abs(e[ax] - at) < .05 and lo - .05 <= e[o] <= hi + .05:
                    if orient(c, d) != o: ok = False
                    deps.append((j, end))
        for e in (lo, hi):
            p = [0, 0]; p[ax] = at; p[o] = e
            for j, (m, kind, c, d, role) in enumerate(roads):
                if j not in ks and _on_interior(p, c, d, .05) and (orient(c, d) != o or not _on_interior(p, c, d, most + 1)): ok = False
        if ok: slide[key] = dict(ks=ks, ax=ax, at=at, deps=deps, cost=cost, most=most, d=0.0)

    # does the round end of each segment show? yes at a dead end or an L-corner; no where it runs on or meets a road
    def shows(k, end):
        p, a, b = roads[k][end], roads[k][2], roads[k][3]; touching = []
        for j, (m, kind, c, d, role) in enumerate(roads):
            if j == k: continue
            if _on_interior(p, c, d, .5): return False
            if math.dist(p, c) < .05 or math.dist(p, d) < .05: touching.append(j)
        if not touching: return True
        if any(orient(roads[j][2], roads[j][3]) == orient(a, b) for j in touching) or len(touching) >= 2: return False
        return True
    cap = {k: {2: shows(k, 2), 3: shows(k, 3)} for k, r in enumerate(roads) if r[0] in team}
    campus = [CAMPUS_WEST, CAMPUS_EAST]
    def inside(x, y, P):
        odd = False
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]: odd = not odd
        return odd

    result, report = {}, {'degraded': [], 'unsolved': []}
    for ax in (0, 1):
        o = 1 - ax
        for attempt in range(4):
            qp, cv, sv, dv = QP(), {}, {}, {}
            for i in ids:
                c0, s0 = (bb[i][ax] + bb[i][ax + 2]) / 2, (bb[i][ax + 2] - bb[i][ax]) / 2
                cv[i] = qp.var(c0, COST['move_big' if i in big else 'move']); sv[i] = qp.var(s0, SHRINK.get(cat[i], SHRINK['other']) / max(s0, 1) ** 2)
                qp.ge([(sv[i], -1)], -s0); qp.ge([(sv[i], 1)], KMIN['big' if i in big else 'normal'] * s0)
                qp.ge([(cv[i], 1)], c0 - MAX_MOVE); qp.ge([(cv[i], -1)], -(c0 + MAX_MOVE))
            for key, s in slide.items():
                if s['ax'] == ax: dv[key] = qp.var(0, s['cost']); qp.ge([(dv[key], 1)], -s['most']); qp.ge([(dv[key], -1)], -s['most'])
            def edge_terms(i, lo, hi):
                e = extent(poly[i], ax, lo, hi)
                if not e: return None
                c0, s0 = (bb[i][ax] + bb[i][ax + 2]) / 2, (bb[i][ax + 2] - bb[i][ax]) / 2
                return e, (e[0] - c0) / s0 if s0 else 0, (e[1] - c0) / s0 if s0 else 0
            # buildings beside roads
            for k, (n, kind, a, b, role) in enumerate(roads):
                if orient(a, b) != ax: continue
                at, lo_r, hi_r = (a[ax] + b[ax]) / 2, min(a[o], b[o]), max(a[o], b[o])
                d = dv.get(line_of.get(k))
                hw = half_width(n, width_kind.get(n, kind))
                line_lo, line_hi = lo_r, hi_r
                if n in team:   # the round end of a new path shows where it stops or turns a corner, not where it meets a road
                    ends = sorted(((a[o], cap[k][2]), (b[o], cap[k][3])))
                    lo_r, hi_r = lo_r - (hw if ends[0][1] else 0), hi_r + (hw if ends[1][1] else 0)
                for i in ids:
                    lo, hi = max(lo_r, bb[i][o]), min(hi_r, bb[i][o + 2])
                    if hi - lo <= .5: continue
                    t = edge_terms(i, lo, hi)
                    if not t: continue
                    (emin, emax), al, be = t
                    if emin >= at - 1e-6: g, side = emin - at, 1
                    elif emax <= at + 1e-6: g, side = at - emax, -1
                    else:
                        if n in team and min(line_hi, bb[i][o + 2]) - max(line_lo, bb[i][o]) > .5: report['unsolved'].append(('crosses', n, i))
                        continue
                    if g > NEAR: continue
                    req = REQ[width_kind[n]] if n in team else min(g, hw + CASING)
                    terms = [(cv[i], side), (sv[i], side * (al if side > 0 else be))]
                    if d is not None: terms.append((d, -side))
                    qp.ge(terms, side * at + req, ('road', n, i))
            # neighbouring buildings keep their order and a small gap
            for x1, i in enumerate(ids):
                for j in ids[x1 + 1:]:
                    if min(bb[i][o + 2], bb[j][o + 2]) - max(bb[i][o], bb[j][o]) <= -3: continue
                    for p, q in ((i, j), (j, i)):
                        g = bb[q][ax] - bb[p][ax + 2]
                        if -.5 <= g < NEAR:
                            qp.ge([(cv[q], 1), (sv[q], -1), (cv[p], -1), (sv[p], -1)], min(max(g, 0), PAIR_GAP), ('pair', p, q))
            # inside the campus outline
            for i in ids:
                cx, cy = (bb[i][0] + bb[i][2]) / 2, (bb[i][1] + bb[i][3]) / 2
                P = next((P for P in campus if inside(cx, cy, P)), None)
                if not P: continue
                e = extent(P, ax, bb[i][o], bb[i][o + 2])
                if not e: continue
                lo_gap, hi_gap = bb[i][ax] - e[0], e[1] - bb[i][ax + 2]
                if 0 <= lo_gap < NEAR: qp.ge([(cv[i], 1), (sv[i], -1)], e[0] + min(lo_gap, 3), ('fence', i))
                if 0 <= hi_gap < NEAR: qp.ge([(cv[i], -1), (sv[i], -1)], -(e[1] - min(hi_gap, 3)), ('fence', i))
            # a sliding piece keeps its distance to the roads alongside it
            for key, d in dv.items():
                n, at = key[0], slide[key]['at']
                for k in slide[key]['ks']:
                    a, b = roads[k][2], roads[k][3]
                    for j, (m, kind, c, e, role) in enumerate(roads):
                        if line_of.get(j) == key or orient(c, e) != ax or min(max(a[o], b[o]), max(c[o], e[o])) - max(min(a[o], b[o]), min(c[o], e[o])) <= .5: continue
                        at2 = (c[ax] + e[ax]) / 2; g = abs(at2 - at)
                        if g > NEAR: continue
                        need = min(g, half_width(n, width_kind.get(n, 'lane')) + half_width(m, width_kind.get(m, kind)) + 3)
                        d2 = dv.get(line_of.get(j)); sgn = 1 if at2 > at else -1
                        terms = [(d, -sgn)] + ([(d2, sgn)] if d2 is not None else [])
                        qp.ge(terms, need - sgn * (at2 - at), ('paths', n, m))
            x, bad = qp.solve(sweeps)
            if not bad or not allow_narrow: break
            # no room for a full lane: draw the paths involved at footpath width; if those already are, the lanes that
            # squeeze the same buildings from the other side give way
            short = {t[1] for v, t in bad if t and t[0] == 'road' and t[1] in team and width_kind[t[1]] == 'lane'}
            if not short:
                tight = {t[2] for v, t in bad if t and t[0] == 'road'} | {b for v, t in bad if t and t[0] == 'pair' for b in t[1:]}
                short = {t[1] for _, _, t in qp.rows if t and t[0] == 'road' and t[2] in tight and t[1] in team and width_kind[t[1]] == 'lane'}
            if not short: break
            for n in sorted(short): width_kind[n] = 'narrow'; report['degraded'].append(n)
        report['unsolved'] += [(v,) + tuple(t or ()) for v, t in bad]
        for i in ids:
            c0, s0 = (bb[i][ax] + bb[i][ax + 2]) / 2, (bb[i][ax + 2] - bb[i][ax]) / 2
            result.setdefault(i, [None, None])[ax] = (c0, s0, x[cv[i]], x[sv[i]])
        for key, d in dv.items(): slide[key]['d'] = x[d]

    # ---- apply ----
    def mapper(i):
        (cx0, sx0, cx, sx), (cy0, sy0, cy, sy) = result[i]
        kx, ky = (sx / sx0 if sx0 else 1), (sy / sy0 if sy0 else 1)
        return lambda p: [round((cx + (p[0] - cx0) * kx) * 2) / 2, round((cy + (p[1] - cy0) * ky) * 2) / 2]
    def shift(i):
        (cx0, _, cx, _), (cy0, _, cy, _) = result[i]
        return lambda p: [round((p[0] + cx - cx0) * 2) / 2, round((p[1] + cy - cy0) * 2) / 2]
    moved = {}
    for i in ids:
        (cx0, sx0, cx, sx), (cy0, sy0, cy, sy) = result[i]
        if abs(cx - cx0) > .25 or abs(cy - cy0) > .25 or abs(sx - sx0) > .25 or abs(sy - sy0) > .25:
            moved[i] = dict(dx=round(cx - cx0, 1), dy=round(cy - cy0, 1), sx=round(100 * (1 - sx / sx0)) if sx0 else 0, sy=round(100 * (1 - sy / sy0)) if sy0 else 0)
    for k, (sid, cat, P) in enumerate(structures):
        owner = TOWER_PARENT.get(sid, sid)
        if owner in moved: structures[k] = (sid, cat, [mapper(owner)(p) for p in P])
    for p in places:
        owner = p['id'] if p['id'] in moved else p.get('sharedFootprint') if p.get('sharedFootprint') in moved else None
        if not owner: continue
        f = mapper(owner); p['footprint'] = [f(q) for q in p['footprint']]; p['official'] = f(p['official'])
        if p.get('access'): p['access'] = shift(owner)(p['access'])
    slid = {}
    for key, item in slide.items():
        ax, d = item['ax'], round(item['d'] * 2) / 2
        if not d: continue
        for k in item['ks']:
            m, kind, a, b, role = roads[k]; a, b = list(a), list(b); a[ax] += d; b[ax] += d; roads[k] = (m, kind, tuple(a), tuple(b), role)
        for j, end in item['deps']:
            r = list(roads[j]); e = list(r[end]); e[ax] += d; r[end] = tuple(e); roads[j] = tuple(r)
        slid['%s（%s %+g）' % (key[0], 'xy'[ax], d)] = d
    for k, (n, kind, a, b, role) in enumerate(roads):
        if n in team and width_kind.get(n) and kind in ('lane', 'narrow'): roads[k] = (n, width_kind[n], a, b, role)
    report.update(moved=moved, slid=slid, widths=width_kind)
    log('make room: %d buildings moved or narrowed, %d paths slid, %d drawn at footpath width %s; unsolved %s' % (
        len(moved), len(slid), len(report['degraded']), report['degraded'], report['unsolved'][:6]))
    return report
