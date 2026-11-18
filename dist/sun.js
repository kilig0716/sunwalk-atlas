'use strict';
// The sun for any calendar day, computed in the page.
//
// The atlas ships the shade of every walkway for one design day (shadeModel.designDate, 1 September,
// computed by tools/shade_model.py). For any other day this module repeats the two date-dependent
// steps of that model with the same rules:
//   * sun position — the NOAA approximation, the same formula as the Python tool;
//   * tree shade   — the measured low-sun and high-sun canopy of the segment (shadeSrc.lo / .hi),
//                    blended by sun elevation (lo up to 45°, hi from 58°);
//   * building shade — walkway sample points every 6 px, shaded when the ray towards the sun meets a
//                    building footprint closer than height / tan(elevation).
// The Python tool marches the ray over a raster of the footprints; here the ray is intersected with
// the polygons directly, so the two agree to within a pixel or two of the shadow edge.
// Tree canopy is the summer measurement on every date: bare winter trees shade less than shown.
const SunModel = (() => {
  const rad = Math.PI / 180, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function dayOfYear(date) {const [y, m, d] = date.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;}
  // Beijing-time hour → {elevation, azimuth clockwise from north}, in degrees.
  function position(date, hour, lat = 34.02, lon = 108.95, tz = 8) {
    const g = 2 * Math.PI / 365 * (dayOfYear(date) - 1 + (hour - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const ha = ((hour * 60 + eqt + 4 * lon - 60 * tz) / 4 - 180) * rad, phi = lat * rad;
    const cz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / rad + 180;
    return {elevation: 90 - Math.acos(Math.max(-1, Math.min(1, cz))) / rad, azimuth: ((az % 360) + 360) % 360};
  }
  // Hour at which the sun's centre crosses the horizon (−0.83° with refraction).
  function crossing(date, rising, lat, lon) {
    let lo = rising ? 3 : 12, hi = rising ? 12 : 22;
    for (let i = 0; i < 40; i++) {const mid = (lo + hi) / 2; if ((position(date, mid, lat, lon).elevation > -0.83) === rising) hi = mid; else lo = mid;}
    return (lo + hi) / 2;
  }
  const today = (now = Date.now()) => new Date(now + 288e5).toISOString().slice(0, 10); // the date in Beijing
  function footprints(atlas) {
    const M = atlas.shadeModel, scale = M.scale || .6;
    return atlas.structures.map(s => {
      const h = (M.heightOverrides?.[s.id] ?? M.heights?.[s.category] ?? M.defaultHeight ?? 12) / scale, xs = s.polygon.map(p => p[0]), ys = s.polygon.map(p => p[1]);
      return {pts: s.polygon, h, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)};
    });
  }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;}
    return c;
  }
  function meets(b, ax, ay, bx, by) { // does the ray piece a→b touch the footprint?
    if (Math.max(ax, bx) < b.x0 || Math.min(ax, bx) > b.x1 || Math.max(ay, by) < b.y0 || Math.min(ay, by) > b.y1) return false;
    if (inside(b.pts, ax, ay)) return true;
    const rx = bx - ax, ry = by - ay;
    for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) {
      const [cx, cy] = b.pts[j], ex = b.pts[i][0] - cx, ey = b.pts[i][1] - cy, den = rx * ey - ry * ex;
      if (!den) continue;
      const t = ((cx - ax) * ey - (cy - ay) * ex) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }
  function buildingShade(blds, a, b, sun) {
    if (sun.elevation <= 2) return 1;
    const az = sun.azimuth * rad, dx = Math.sin(az), dy = -Math.cos(az), tan = Math.tan(sun.elevation * rad);
    const n = Math.max(2, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6) + 1);
    let shaded = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      for (const s of blds) {const reach = s.h / tan; if (reach > 3 && meets(s, px + dx * 3, py + dy * 3, px + dx * reach, py + dy * reach)) {shaded++; break;}}
    }
    return shaded / n;
  }
  const treeShade = (lo, hi, elevation) => lo + (hi - lo) * Math.max(0, Math.min(1, (elevation - 45) / 13));
  // Shade of every walkway on `date`: the first and last half hour of daylight plus every full hour between.
  function build(atlas, date) {
    const M = atlas.shadeModel, lat = M.lat ?? 34.02, lon = M.lon ?? 108.95, sunrise = crossing(date, true, lat, lon), sunset = crossing(date, false, lat, lon);
    const first = Math.ceil((sunrise + .05) * 2) / 2, last = Math.floor((sunset - .05) * 2) / 2, hours = [];
    if (first % 1) hours.push(first);
    for (let h = Math.ceil(first); h <= last; h++) hours.push(h);
    if (last % 1) hours.push(last);
    const suns = hours.map(h => position(date, h, lat, lon)), blds = footprints(atlas);
    const edges = atlas.edges.map(e => {
      if (!Array.isArray(e.shade)) return null;
      const src = e.shadeSrc || {}, lo = src.lo ?? 0, hi = src.hi ?? lo, a = atlas.nodes[e.a], b = atlas.nodes[e.b];
      const tree = suns.map(s => treeShade(lo, hi, s.elevation)), building = suns.map(s => buildingShade(blds, a, b, s));
      return {shade: tree.map((t, i) => r2(1 - (1 - t) * (1 - building[i]))), tree: tree.map(r2), building: building.map(r2)};
    });
    return {date, hours, sunrise: r2(sunrise), sunset: r2(sunset), sun: hours.map((h, i) => ({hour: h, elevation: r1(suns[i].elevation), azimuth: r1(suns[i].azimuth)})), edges};
  }
  const cache = new Map();
  // Switch the atlas to `date`. The design day keeps the values the Python tool wrote; other days are built once and kept.
  function apply(atlas, date) {
    const M = atlas.shadeModel;
    M.designDate = M.designDate || M.date;
    if (!cache.has(M.designDate)) cache.set(M.designDate, {date: M.designDate, hours: M.hours, sunrise: M.sunrise, sunset: M.sunset, sun: M.sun,
      edges: atlas.edges.map(e => Array.isArray(e.shade) ? {shade: e.shade, tree: e.shadeSrc?.tree, building: e.shadeSrc?.building} : null)});
    if (!cache.has(date)) cache.set(date, build(atlas, date));
    const m = cache.get(date);
    Object.assign(M, {date: m.date, hours: m.hours, sunrise: m.sunrise, sunset: m.sunset, sun: m.sun});
    atlas.edges.forEach((e, i) => {const x = m.edges[i]; if (!x) return; e.shade = x.shade; if (e.shadeSrc) {e.shadeSrc.tree = x.tree; e.shadeSrc.building = x.building;}});
    return m;
  }
  return {position, crossing, today, build, apply, dayOfYear, treeShade};
})();
