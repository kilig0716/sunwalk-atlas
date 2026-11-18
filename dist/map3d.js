'use strict';
// The campus as a 3D model, drawn with WebGL2 and nothing else.
//
//   ground     the illustrated plan (assets/campus-ground.svg) laid flat
//   buildings  every footprint of the atlas raised to the height counted in the 720 云 panoramas, with the roof and wall
//              material seen there (CAMPUS_3D.buildings); windows are drawn by the shader, one row per storey
//   doors      the doors found in the survey, as small porches on the wall they belong to
//   trees      the same trees the 2D plan draws, as instanced low-poly crowns
//   sun        one directional light at the azimuth and elevation of the hour shown; a shadow map makes the buildings
//              and trees cast the shadows the shade model computes for the walkways
// Map coordinates: x east, z south (the plan's y), y up. One map pixel is 0.6 m; heights are true to scale (VEX = 1), so the shadows are as long as the shade model says.
const Map3D = (() => {
  const SC = 1 / 0.6, VEX = 1, M = SC * VEX, D2R = Math.PI / 180, FOV = 34 * D2R;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, t) => a + (b - a) * t, mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
  const m4 = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
    persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
    look(e, c, u) { const z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); },
    apply(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3], m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]]; },
    inv(m) {
      const o = new Float32Array(16), a = m, b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6],
        b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
      return o;
    }
  };

  let gl, canvas, atlas, scene, opts = {}, ok = false, raf = 0, dirty = true, anim = null, shadowDirty = true, texReady = false;
  const cam = {x: 1040, z: 690, dist: 2300, bearing: 0, pitch: 48, grow: 1},   // grow: 0 flat … 1 full height (2D ↔ 3D transition)
   lim = {minDist: 90, maxDist: 4600, maxPitch: 78};
  const env = {az: 160, el: 55, sun: 1, season: 0, light: false};   // light: false = even studio light, true = the sun of the hour with shadows
  const P = {}, G = {}, structs = [], byPlace = new Map();
  let cw = 1, ch = 1, frameMs = 0, quality = 1, slow = 0, lastNow = 0, edgeLines = [], vp = new Float32Array(16), ivp = new Float32Array(16), eye = [0, 0, 0], lightVP = new Float32Array(16), sel = -5, hot = -5, outer = [.86, .9, .82];
  const ribbons = {};   // name -> {vao, buf, n, flow, xray, alpha}
  // building tints (学部 colours): a 3-row texture, one texel per structure; changes ease in, a newly focused group pulses
  const tint = {cur: null, from: null, to: null, t0: 0, ms: 0, run: false, pulseT0: 0, pulseMs: 0};

  // ------------------------------------------------------------------ shaders
  const VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec3 a_col; layout(location=3) in vec2 a_uv; layout(location=4) in vec4 a_meta; layout(location=5) in vec4 a_inst;
uniform mat4 u_vp; uniform float u_season, u_grow;
out vec3 v_w; out vec3 v_n; out vec3 v_c; out vec2 v_uv; out vec4 v_m;
void main(){
  float tree = step(2.5, a_meta.x) * step(a_meta.x, 3.6);
  vec3 p = a_pos * vec3(a_inst.z, a_inst.z * mix(1., .85 + .45 * a_inst.w, tree), a_inst.z); p.xz += a_inst.xy; p.y *= u_grow;
  vec3 c = a_col;
  if (a_meta.x > 2.5 && a_meta.x < 3.1) { float k = a_inst.w; vec3 g = mix(vec3(.33,.57,.28), vec3(.50,.70,.34), fract(k*7.3)); g = mix(g, vec3(.24,.46,.25), step(.82, k));
    vec3 au = mix(vec3(.82,.64,.22), vec3(.72,.44,.20), fract(k*3.7)); c = mix(g, au, u_season * (.3 + .7 * fract(k*5.1))); }
  v_w = p; v_n = a_nrm; v_c = c; v_uv = a_uv; v_m = a_meta; gl_Position = u_vp * vec4(p, 1.);
}`;
  const SHADOW = `
uniform vec3 u_sunDir, u_sunCol, u_amb, u_fog, u_eye; uniform float u_sun, u_night, u_time, u_sel, u_hot, u_fogK, u_key, u_pulse; uniform mat4 u_light; uniform highp sampler2DShadow u_shadow; uniform highp sampler2D u_tint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shadow(vec3 w, vec3 n){
  if (u_sun < .02) return 1.;
  vec4 lp = u_light * vec4(w + n * .8, 1.); vec3 s = lp.xyz / lp.w * .5 + .5;
  if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1.) return 1.;
  float b = .0010 + .0035 * (1. - max(dot(n, u_sunDir), 0.)), z = s.z - b; vec2 px = vec2(.9 / float(textureSize(u_shadow, 0).x));
  return (texture(u_shadow, vec3(s.xy + px * vec2(-1., -1.), z)) + texture(u_shadow, vec3(s.xy + px * vec2(1., -1.), z)) + texture(u_shadow, vec3(s.xy + px * vec2(-1., 1.), z)) + texture(u_shadow, vec3(s.xy + px, z))) * .25;
}
vec3 fogged(vec3 col, vec3 w){ float d = distance(u_eye, w); return mix(col, u_fog, clamp((d - u_fogK) / (u_fogK * 3.6), 0., .88)); }`;
  const FS = `#version 300 es
precision highp float;
in vec3 v_w; in vec3 v_n; in vec3 v_c; in vec2 v_uv; in vec4 v_m; out vec4 o;` + SHADOW + `
void main(){
  vec3 n = normalize(v_n), base = v_c, emis = vec3(0.); float kind = v_m.x, spec = 0.;
  if (kind > 3.6) { o = vec4(fogged(base * (u_amb * 1.05 + u_sunCol * .22 * u_sun), v_w), 1.); return; }   // far hills
  if (kind > .5 && kind < 1.5) {            // wall: one row of windows per storey
    vec2 g = vec2(v_uv.x / 3.4, v_uv.y / 3.3), c = floor(g), f = fract(g); float top = step(v_uv.y, v_m.y - .8);
    float win = step(.2, f.x) * step(f.x, .8) * step(.3, f.y) * step(f.y, .76) * top;
    if (c.y < .5) win = step(.14, f.x) * step(f.x, .86) * step(.1, f.y) * step(f.y, .8) * top;
    vec3 glass = mix(vec3(.21,.28,.36), vec3(.48,.62,.76), .3 + .35 * hash(c * 1.7 + v_m.z));
    base = mix(base * (1. - .08 * step(.93, f.y)), glass, win * .9);
    emis = vec3(1.,.80,.46) * win * step(.56, hash(c + v_m.z)) * u_night; spec = win;
  } else if (kind > 1.5 && kind < 2.5) {    // curtain wall
    vec2 g = vec2(v_uv.x / 1.7, v_uv.y / 3.3), f = fract(g); float mull = max(step(f.x, .08), step(f.y, .1));
    vec3 glass = mix(vec3(.27,.47,.64), vec3(.60,.79,.92), clamp(v_uv.y / max(v_m.y, 1.), 0., 1.));
    base = mix(glass, v_c * .8, mull); emis = vec3(1.,.85,.56) * (1. - mull) * step(.45, hash(floor(g) + v_m.z)) * u_night * .7; spec = 1. - mull;
  } else if (kind > 2.5 && kind < 3.6) base *= .7 + .4 * v_uv.y;   // tree crowns: darker underneath
  if (kind > .5 && kind < 2.5) base *= .80 + .20 * smoothstep(0., 5., v_uv.y);   // walls darken a little towards the ground
  float ndl = max(dot(n, u_sunDir), 0.), sh = shadow(v_w, n);
  vec3 col = base * (u_amb * (.82 + .18 * sh) + u_sunCol * ndl * (sh * u_sun * .62 + u_key)) + base * .07 * max(n.y, 0.) * (1. - u_night);
  vec3 hv = normalize(normalize(u_eye - v_w) + u_sunDir); col += u_sunCol * spec * pow(max(dot(n, hv), 0.), 42.) * .55 * sh * u_sun + emis;
  // a building can be tinted (学部 colours): row 0 holds the colour and its strength, rows 1-2 more colours drawn as stripes
  float tinted = 0.;
  if (v_m.w > -.5) { int bi = int(v_m.w + .5); vec4 t0 = texelFetch(u_tint, ivec2(bi, 0), 0);
    if (t0.a > .004) { vec4 t1 = texelFetch(u_tint, ivec2(bi, 1), 0), t2 = texelFetch(u_tint, ivec2(bi, 2), 0); vec3 tc = t0.rgb;
      float n = 1. + step(.5, t1.a) + step(.5, t2.a);
      if (n > 1.5) { float k = floor(fract((v_w.x + v_w.z) / (5. * n)) * n); tc = k < .5 ? t0.rgb : k < 1.5 ? t1.rgb : t2.rgb; }
      float l = dot(col, vec3(.3, .59, .11)); col = mix(col, tc * (.38 + .8 * l), t0.a) + tc * step(.72, t0.a) * u_pulse * .3; tinted = t0.a; } }
  // the selected building: warm gold, or lifted towards white when it carries a 学部 colour (gold over blue would turn grey)
  if (abs(v_m.w - u_sel) < .5) col = tinted > .3 ? mix(col, vec3(1.), .2) * 1.06 : mix(col, vec3(1.,.80,.30), .26); else if (abs(v_m.w - u_hot) < .5) col = mix(col, vec3(1.), .18);
  o = vec4(fogged(col, v_w), 1.);
}`;
  const FS_DEPTH = `#version 300 es
precision highp float; in vec3 v_w; in vec3 v_n; in vec3 v_c; in vec2 v_uv; in vec4 v_m; void main(){}`;
  const VS_GROUND = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_uv; uniform mat4 u_vp; out vec3 v_w; out vec2 v_uv;
void main(){ v_w = a_pos; v_uv = a_uv; gl_Position = u_vp * vec4(a_pos, 1.); }`;
  const FS_GROUND = `#version 300 es
precision highp float; in vec3 v_w; in vec2 v_uv; out vec4 o; uniform sampler2D u_tex; uniform float u_hasTex; uniform vec3 u_outer;` + SHADOW + `
void main(){
  bool inside = v_uv.x > 0. && v_uv.x < 1. && v_uv.y > 0. && v_uv.y < 1.;
  vec3 base = inside && u_hasTex > .5 ? texture(u_tex, v_uv).rgb : u_outer;
  // A faint ground grid extends the illustration beyond the surveyed area.
  vec2 cell = v_w.xz / 92.;
  vec2 gridEdge = abs(fract(cell + .5) - .5) / max(fwidth(cell), vec2(.001));
  float grid = 1. - smoothstep(.1, 1.05, min(gridEdge.x, gridEdge.y));
  if (!inside) base *= 1. - .045 * grid;
  float sh = shadow(v_w, vec3(0., 1., 0.));
  vec3 col = base * (u_amb * (.86 + .14 * sh) + u_sunCol * (.34 + .12 * u_sunDir.y) * sh * u_sun + vec3(u_key * .62));
  o = vec4(fogged(col, v_w), 1.);
}`;
  const VS_RIB = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec4 a_col; layout(location=2) in vec2 a_uv; uniform mat4 u_vp; uniform float u_grow; out vec4 v_c; out vec2 v_uv;
void main(){ v_c = a_col; v_uv = a_uv; vec3 p = a_pos; p.y *= u_grow; gl_Position = u_vp * vec4(p, 1.); }`;
  const FS_RIB = `#version 300 es
precision highp float; in vec4 v_c; in vec2 v_uv; out vec4 o; uniform float u_time, u_flow, u_alpha;
void main(){
  float a = v_c.a * u_alpha * smoothstep(1., .8, abs(v_uv.y)); vec3 c = v_c.rgb;
  if (u_flow > .5) { float d = fract(v_uv.x / 9. - u_time * .85); a *= smoothstep(0., .1, d) * smoothstep(.36, .26, d) * step(abs(v_uv.y), .5); }
  o = vec4(c, a);
}`;
  const VS_SKY = `#version 300 es
out vec2 v; void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v = p; gl_Position = vec4(p * 2. - 1., .9999, 1.); }`;
  const FS_SKY = `#version 300 es
precision highp float; in vec2 v; out vec4 o; uniform vec3 u_top, u_hor; uniform float u_horizon;
void main(){ float t = clamp((v.y - u_horizon) / max(1. - u_horizon, .05), 0., 1.); o = vec4(mix(u_hor, u_top, pow(t, .7)), 1.); }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return {p, u};
  }

  // ------------------------------------------------------------------ geometry
  const STRIDE = 15;
  function builder() {
    const a = [];
    const v = (p, n, c, uv, m) => a.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], m[0], m[1], m[2], m[3]);
    const tri = (p0, p1, p2, c, m, n, uv) => { n = n || (() => { const q = norm(cross(sub(p1, p0), sub(p2, p0))); return q; })(); uv = uv || [[0, 0], [0, 0], [0, 0]]; v(p0, n, c, uv[0], m); v(p1, n, c, uv[1], m); v(p2, n, c, uv[2], m); };
    // a flat face given by its corners in order; the normal is turned to `toward` (a direction) when given
    const face = (pts, c, m, toward) => { let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))); if (toward && dot(n, toward) < 0) n = n.map(x => -x); for (let i = 1; i < pts.length - 1; i++) tri(pts[0], pts[i], pts[i + 1], c, m, n); };
    const box = (x0, z0, x1, z1, y0, y1, c, m, top) => {
      face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], top || c, m, [0, 1, 0]);
      face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c, m, [0, 0, -1]); face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c, m, [0, 0, 1]);
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c, m, [-1, 0, 0]); face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], c, m, [1, 0, 0]);
    };
    return {a, v, tri, face, box};
  }
  const area2 = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  function triangulate(pts) {
    const idx = pts.map((_, i) => i), out = [], ccw = area2(pts) > 0, cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) => { const d1 = cr(a, b, p), d2 = cr(b, c, p), d3 = cr(c, a, p); return (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0); };
    let guard = 0;
    while (idx.length > 3 && guard++ < 4000) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length], k = cr(pts[i0], pts[i1], pts[i2]);
        if (k === 0) { idx.splice(i, 1); cut = true; break; }
        if (ccw ? k < 0 : k > 0) continue;
        if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(pts[j], pts[i0], pts[i1], pts[i2]))) continue;
        out.push(i0, i1, i2); idx.splice(i, 1); cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
  }
  const insidePoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

  function buildStatic() {
    const B = builder(), pal = scene.palette, wallC = k => hex(pal.wall[k] || '#dcd6c8'), roofC = k => hex(pal.roof[k] || '#b7b4ab');
    atlas.structures.forEach((s, index) => {
      const own = s.of ? atlas.structures.findIndex(q => q.id === s.of) : -1, hi = own < 0 ? index : own;   // a block of a split building lights up with the rest of it
      const info = scene.buildings[s.id] || {height: 12, wall: 'beige', roof: 'flat', roofTone: 'concrete', glass: 0}, pts = s.polygon, H = info.height * M, hm = info.height;
      const sign = Math.sign(area2(pts)) || 1, kind = info.glass > .45 ? 2 : hm < 3 ? 0 : 1, wc = wallC(info.wall), rc = roofC(info.roofTone), seed = (index * 37.7) % 91, meta = [kind, hm, seed, hi];
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const isBox = pts.length === 4 && new Set(xs).size === 2 && new Set(zs).size === 2, longX = x1 - x0 >= z1 - z0;
      const RH = info.roof === 'flat' && hm > 6 ? H - .8 * M : H, ec = [wc[0] * .46, wc[1] * .46, wc[2] * .46, .62];   // the roof sits a little below the wall top: a parapet
      const line = (p, q) => edgeLines.push(p[0], p[1], p[2], ...ec, 0, 0, q[0], q[1], q[2], ...ec, 0, 0);
      let u = 0;
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez) || 1, n = [sign * ez / len, 0, -sign * ex / len], lm = len * .6;
        // the gable ends of the east dorms are brown fins without windows
        const gable = isBox && info.trim === 'brownfin' && (longX ? Math.abs(ex) < 1 : Math.abs(ez) < 1), c = gable ? wallC('brownfin') : wc, m = gable ? [0, hm, seed, hi] : meta;
        const p0 = [a[0], 0, a[1]], p1 = [b[0], 0, b[1]], p2 = [b[0], H, b[1]], p3 = [a[0], H, a[1]];
        B.tri(p0, p1, p2, c, m, n, [[u, 0], [u + lm, 0], [u + lm, hm]]); B.tri(p0, p2, p3, c, m, n, [[u, 0], [u + lm, hm], [u, hm]]); u += lm; line(p3, p2); line(p0, p3);
      });
      const rm = [0, hm, seed, hi];
      if (info.roof === 'hip' && isBox) {
        const e = 1.4, X0 = x0 - e, X1 = x1 + e, Z0 = z0 - e, Z1 = z1 + e, rh = (hm < 6 ? 1.7 : 3.4) * M, top = H + rh;
        if (longX) { const h2 = (Z1 - Z0) / 2, zc = (Z0 + Z1) / 2, ra = [X0 + h2 * .9, top, zc], rb = [X1 - h2 * .9, top, zc];
          B.face([[X0, H, Z1], [X1, H, Z1], rb, ra], rc, rm, [0, 1, 0]); B.face([[X1, H, Z0], [X0, H, Z0], ra, rb], rc, rm, [0, 1, 0]); B.face([[X0, H, Z0], [X0, H, Z1], ra], rc, rm, [0, 1, 0]); B.face([[X1, H, Z1], [X1, H, Z0], rb], rc, rm, [0, 1, 0]);
        } else { const h2 = (X1 - X0) / 2, xc = (X0 + X1) / 2, ra = [xc, top, Z0 + h2 * .9], rb = [xc, top, Z1 - h2 * .9];
          B.face([[X0, H, Z0], [X0, H, Z1], rb, ra], rc, rm, [0, 1, 0]); B.face([[X1, H, Z1], [X1, H, Z0], ra, rb], rc, rm, [0, 1, 0]); B.face([[X1, H, Z0], [X0, H, Z0], ra], rc, rm, [0, 1, 0]); B.face([[X0, H, Z1], [X1, H, Z1], rb], rc, rm, [0, 1, 0]); }
      } else {
        const t = triangulate(pts), col = info.roof === 'hip' ? rc : info.roof === 'spire' ? rc : rc;
        if (info.roof === 'spire') { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, apex = [cx, H + 9 * M, cz]; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; B.face([[a[0], H, a[1]], [b[0], H, b[1]], apex], hex('#d9a441'), rm, [0, 1, 0]); }); }
        else for (let i = 0; i < t.length; i += 3) B.tri([pts[t[i]][0], RH, pts[t[i]][1]], [pts[t[i + 1]][0], RH, pts[t[i + 1]][1]], [pts[t[i + 2]][0], RH, pts[t[i + 2]][1]], col, rm, [0, 1, 0]);
        if (info.roof === 'ring') { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ring = pts.map(p => [cx + (p[0] - cx) * 1.75, cz + (p[1] - cz) * 1.75]), y0 = H + .6 * M, y1 = H + 1.5 * M, w = hex('#f4f4f0');
          ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length]; B.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], w, rm, [a[0] - cx, 0, a[1] - cz]); B.face([[cx, y1, cz], [a[0], y1, a[1]], [b[0], y1, b[1]]], w, rm, [0, 1, 0]); }); }
        // a stair core or plant room on the larger flat roofs
        if (info.roof === 'flat' && Math.abs(area2(pts)) / 2 > 2600 && hm > 9) { const cx = (x0 + x1) / 2 + ((index * 13) % 9 - 4), cz = (z0 + z1) / 2 + ((index * 7) % 5 - 2);
          if (insidePoly(pts, cx - 5, cz - 3) && insidePoly(pts, cx + 5, cz + 3)) B.box(cx - 5, cz - 3, cx + 5, cz + 3, RH, H + 2.2 * M, rc.map(v => v * .92), rm, rc.map(v => v * 1.04)); }
      }
      structs.push({id: s.id, index, pts, H, x0, x1, z0, z1});
    });
    // doors found in the panoramas
    const out = {N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0]}, none = [0, 0, 0, -1];
    for (const p of atlas.places) for (const d of p.doors || []) {
      const [nx, nz] = out[d.side], main = d.kind === 'main', hw = main ? 3.4 : 2.3, ax = Math.abs(nz), az = Math.abs(nx), dh = (main ? 3.3 : 2.6) * M;
      const rect = (h, d0, d1) => { const xa = d.x - ax * h + nx * d0, xb = d.x + ax * h + nx * d1, za = d.y - az * h + nz * d0, zb = d.y + az * h + nz * d1; return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)]; };
      let r = rect(hw, -.4, 1.2); B.box(r[0], r[1], r[2], r[3], 0, dh, hex(main ? '#2f3d49' : '#48545c'), [0, 0, 0, -1]);
      r = rect(hw + 2.2, 0, main ? 6.5 : 3.5); B.box(r[0], r[1], r[2], r[3], 0, .35 * M, hex('#d8d3c6'), none);
      if (main) { r = rect(hw + 1.6, 0, 4.6); B.box(r[0], r[1], r[2], r[3], dh + .15 * M, dh + .6 * M, hex('#f1ead9'), none, hex('#e2c98f')); }
    }
    // 西译天渡: a glass-roofed deck over the street, ramps down to both campuses
    const br = scene.bridge, bz = br.a[1], hw = br.width / 2, dk = br.deck * M, bx0 = br.a[0] + 16, bx1 = br.b[0] - 38, steel = hex('#5f7f9c'), glass = hex('#9fc7e6');
    B.box(bx0, bz - hw, bx1, bz + hw, dk - .5 * M, dk, steel, none, hex('#cfd8de'));
    B.box(bx0, bz - hw - .6, bx1, bz + hw + .6, dk + 2.9 * M, dk + 3.3 * M, glass, none);
    for (let x = bx0 + 4; x < bx1; x += 16) { B.box(x - .7, bz - hw, x + .7, bz - hw + 1.2, 0, dk + 2.9 * M, steel, none); B.box(x - .7, bz + hw - 1.2, x + .7, bz + hw, 0, dk + 2.9 * M, steel, none); }
    for (const [xa, xb] of [[br.a[0], bx0], [bx1, br.b[0]]]) { const up = xa === br.a[0] ? [xa, 0, xb, dk] : [xb, 0, xa, dk];
      B.face([[xa, xa === br.a[0] ? 0 : dk, bz - hw], [xb, xa === br.a[0] ? dk : 0, bz - hw], [xb, xa === br.a[0] ? dk : 0, bz + hw], [xa, xa === br.a[0] ? 0 : dk, bz + hw]], hex('#cfd8de'), none, [0, 1, 0]); }
    // gates
    for (const g of scene.gates) { const s = g.span / 2, red = hex('#b0413a'), white = hex('#efece4'), timber = hex('#b98656');
      if (g.style === 'north') { B.box(g.x - 5, g.y - s - 4, g.x + 5, g.y - s, 0, 8 * M, red, none); B.box(g.x - 5, g.y + s, g.x + 5, g.y + s + 4, 0, 8 * M, red, none); B.box(g.x - 6, g.y - s - 4, g.x + 6, g.y + s + 4, 8 * M, 10 * M, red, none);
        for (let k = 0; k < 14; k++) { const hgt = (7 + 3.2 * Math.sin(k * .7)) * M; B.box(g.x - 2.4, g.y - s - 9 - k * 5, g.x - .6, g.y - s - 6.4 - k * 5, 0, hgt, timber, none); B.box(g.x - 2.4, g.y + s + 6.4 + k * 4, g.x - .6, g.y + s + 9 + k * 4, 0, hgt * .8, timber, none); } }
      else if (g.style === 'west') { B.box(g.x - 4, g.y - s - 7, g.x + 4, g.y - s, 0, 11 * M, white, none); B.box(g.x - 4, g.y + s, g.x + 4, g.y + s + 7, 0, 11 * M, white, none); B.box(g.x - 5, g.y - s - 7, g.x + 5, g.y + s + 7, 11 * M, 14 * M, white, none, hex('#b85a3f')); }
      else if (g.style === 'plain') { B.box(g.x - 3, g.y - s - 3, g.x + 3, g.y - s, 0, 5 * M, white, none); B.box(g.x - 3, g.y + s, g.x + 3, g.y + s + 3, 0, 5 * M, white, none); B.box(g.x - 5, g.y - s - 3, g.x + 5, g.y + s + 3, 5 * M, 5.7 * M, hex('#d9d4c8'), none); }
      else { B.box(g.x - 1, g.y - s, g.x + 1, g.y + s, 1 * M, 1.5 * M, hex('#c0504d'), none); B.box(g.x - 1.5, g.y - s - 2, g.x + 1.5, g.y - s, 0, 2 * M, white, none); B.box(g.x - 1.5, g.y + s, g.x + 1.5, g.y + s + 2, 0, 2 * M, white, none); }
    }
    // the Qinling foothills south of the campus: two hazy ridges
    const hills = (R, base, amp, col, k) => { let prev = null; for (let d = 96; d <= 264; d += 3) { const t = d * D2R, x = 1050 + Math.sin(t) * R, z = 700 - Math.cos(t) * R, e = Math.sin((d - 96) / 168 * Math.PI);
        const h = (base + amp * (.55 + .25 * Math.sin(d * .11 + k) + .2 * Math.sin(d * .31 + k * 2.1))) * (.25 + .75 * e), cur = [x, h, z];
        if (prev) { const m = [4, 0, 0, -1]; B.tri([prev[0], 0, prev[2]], [x, 0, z], cur, col, m, [0, 1, 0]); B.tri([prev[0], 0, prev[2]], cur, prev, col, m, [0, 1, 0]); } prev = cur; } };
    hills(5600, 520, 760, hex('#8aa69b'), 1.3); hills(3900, 260, 520, hex('#6f9a78'), 4.1);
    return new Float32Array(B.a);
  }
  function buildTree() {
    const B = builder(), prof = [[.3, .52], [.95, .95], [1, 1.45], [.62, 2.0], [0, 2.4]], seg = 7, trunk = hex('#7a5a3c'), white = [1, 1, 1], mc = [3, 0, 0, -1], mt = [3.3, 0, 0, -1];
    B.box(-.1, -.1, .1, .1, 0, .6, trunk, mt);
    const pt = (r, y, i) => [Math.cos(i / seg * 2 * Math.PI) * r, y, Math.sin(i / seg * 2 * Math.PI) * r];
    for (let i = 0; i < seg; i++) {
      B.tri(pt(0, .5, i), pt(prof[0][0], prof[0][1], i + 1), pt(prof[0][0], prof[0][1], i), white, mc, [0, -1, 0], [[0, 0], [0, 0], [0, 0]]);
      for (let k = 0; k < prof.length - 1; k++) { const a = prof[k], b = prof[k + 1], p0 = pt(a[0], a[1], i), p1 = pt(a[0], a[1], i + 1), p2 = pt(b[0], b[1], i + 1), p3 = pt(b[0], b[1], i);
        const mid = (i + .5) / seg * 2 * Math.PI, n = norm([Math.cos(mid) * (b[1] - a[1]), a[0] - b[0], Math.sin(mid) * (b[1] - a[1])]), u0 = [0, (a[1] - .5) / 1.9], u1 = [0, (b[1] - .5) / 1.9];
        B.tri(p0, p1, p2, white, mc, n, [u0, u0, u1]); if (b[0] > 0) B.tri(p0, p2, p3, white, mc, n, [u0, u1, u1]); }
    }
    return new Float32Array(B.a);
  }
  function staticVAO(data) {
    const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 2, 9], [4, 4, 11]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4); });
    return {vao, n: data.length / STRIDE};
  }

  // ------------------------------------------------------------------ ribbons (route, shade, tours)
  // lines: [{pts: [[x, z, y]…], w, col: [r,g,b,a] | cols: one colour per segment}]
  function setRibbon(name, lines, o = {}) {
    if (!ok) return;
    let r = ribbons[name];
    if (!lines || !lines.length) { if (r) r.n = 0; invalidate(); return; }
    const a = [];
    for (const L of lines) { let u = 0;
      for (let i = 0; i < L.pts.length - 1; i++) {
        const p = L.pts[i], q = L.pts[i + 1], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz); if (len < .01) continue;
        const ux = dx / len, uz = dz / len, nx = -uz * L.w / 2, nz = ux * L.w / 2, cap = L.w * .45, c = L.cols ? L.cols[i] : L.col, y0 = (p[2] || 0) + (L.lift || 1.1), y1 = (q[2] || 0) + (L.lift || 1.1);
        const A = [p[0] - ux * cap, y0, p[1] - uz * cap], Bq = [q[0] + ux * cap, y1, q[1] + uz * cap], m0 = u, m1 = u + len * .6; u = m1;
        const V = (pos, s, m) => a.push(pos[0] + nx * s, pos[1], pos[2] + nz * s, c[0], c[1], c[2], c[3] ?? 1, m, s);
        V(A, -1, m0); V(Bq, -1, m1); V(Bq, 1, m1); V(A, -1, m0); V(Bq, 1, m1); V(A, 1, m0);
      } }
    if (!r) { r = ribbons[name] = {vao: gl.createVertexArray(), buf: gl.createBuffer()}; gl.bindVertexArray(r.vao); gl.bindBuffer(gl.ARRAY_BUFFER, r.buf);
      [[0, 3, 0], [1, 4, 3], [2, 2, 7]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, off * 4); }); }
    gl.bindBuffer(gl.ARRAY_BUFFER, r.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.DYNAMIC_DRAW); gl.bindVertexArray(null);
    Object.assign(r, {n: a.length / 9, flow: !!o.flow, xray: !!o.xray, alpha: o.alpha ?? 1, order: o.order ?? 0}); invalidate();
  }

  // ------------------------------------------------------------------ camera
  function camera() {
    const w = cw, h = ch, b = cam.bearing * D2R, p = cam.pitch * D2R, f = [Math.sin(b), 0, -Math.cos(b)];
    eye = [cam.x - f[0] * cam.dist * Math.sin(p), cam.dist * Math.cos(p), cam.z - f[2] * cam.dist * Math.sin(p)];
    vp = m4.mul(m4.persp(FOV, w / h, Math.max(3, cam.dist * .03), cam.dist * 3 + 9000), m4.look(eye, [cam.x, 0, cam.z], f)); ivp = m4.inv(vp);
  }
  function project(x, y, h = 0) { const v = m4.apply(vp, [x, h, y, 1]); if (v[3] <= 0) return null; return {x: (v[0] / v[3] * .5 + .5) * cw, y: (1 - (v[1] / v[3] * .5 + .5)) * ch, d: v[3]}; }
  function ray(sx, sy) { const nx = sx / cw * 2 - 1, ny = 1 - sy / ch * 2, a = m4.apply(ivp, [nx, ny, -1, 1]), b = m4.apply(ivp, [nx, ny, 1, 1]), o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; return {o, d: norm(sub([b[0] / b[3], b[1] / b[3], b[2] / b[3]], o))}; }
  function ground(sx, sy) { const r = ray(sx, sy); if (r.d[1] > -1e-3) return null; const t = -r.o[1] / r.d[1]; return t > 0 && t < 3e4 ? [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t] : null; }
  function bound() { cam.dist = clamp(cam.dist, lim.minDist, lim.maxDist); cam.pitch = clamp(cam.pitch, 0, lim.maxPitch); cam.x = clamp(cam.x, -250, 2350); cam.z = clamp(cam.z, -200, 1560); cam.bearing = ((cam.bearing % 360) + 540) % 360 - 180; cam.grow = clamp(cam.grow ?? 1, 0, 1); }
  function moved() { bound(); camera(); invalidate(); opts.onMove?.(); }
  function stop() { anim = null; }
  // Ease the camera to `to`. Buildings are at full height at the end of every move unless `to.grow` says otherwise.
  function flyTo(to, ms = 520, done) {
    const from = {...cam}, target = {...cam, grow: 1, ...to}; target.dist = clamp(target.dist, lim.minDist, lim.maxDist); target.pitch = clamp(target.pitch, 0, lim.maxPitch);
    const db = ((target.bearing - from.bearing) % 360 + 540) % 360 - 180;
    if (opts.reduceMotion || !ms) { Object.assign(cam, target); anim = null; moved(); done?.(); return; }
    anim = {t0: 0, ms, done, step(t) { const q = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.x = mix(from.x, target.x, q); cam.z = mix(from.z, target.z, q); cam.dist = from.dist * Math.pow(target.dist / from.dist, q); cam.bearing = from.bearing + db * q; cam.pitch = mix(from.pitch, target.pitch, q); cam.grow = mix(from.grow, target.grow, q); moved(); }};
    invalidate();
  }
  // Frame a set of map points inside the part of the view that is not covered by panels.
  function fit(points, pad = {}, o = {}) {
    if (!points.length) return;
    const w = cw, h = ch, L = pad.left ?? 60, R = pad.right ?? 60, T = pad.top ?? 90, Bm = pad.bottom ?? 60, keep = {...cam};
    const xs = points.map(p => p[0]), zs = points.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    cam.bearing = o.bearing ?? cam.bearing; cam.pitch = o.pitch ?? cam.pitch; cam.x = cx; cam.z = cz;
    const inside = () => points.every(p => { const s = project(p[0], p[1], p[2] || 0); return s && s.x >= L && s.x <= w - R && s.y >= T && s.y <= h - Bm; });
    for (let pass = 0; pass < 3; pass++) {
      let lo = lim.minDist, hi = lim.maxDist;
      for (let i = 0; i < 22; i++) { cam.dist = Math.sqrt(lo * hi); camera(); if (inside()) hi = cam.dist; else lo = cam.dist; }
      cam.dist = Math.min(lim.maxDist, hi * 1.04); camera();
      const s = points.map(p => project(p[0], p[1], p[2] || 0)).filter(Boolean); if (!s.length) break;
      const mx = (Math.min(...s.map(q => q.x)) + Math.max(...s.map(q => q.x))) / 2, my = (Math.min(...s.map(q => q.y)) + Math.max(...s.map(q => q.y))) / 2;
      const a = ground(mx, my), b = ground((L + w - R) / 2, (T + h - Bm) / 2); if (!a || !b) break; cam.x += a[0] - b[0]; cam.z += a[1] - b[1]; camera();
    }
    cam.dist = Math.max(cam.dist, o.minDist ?? 200);
    const to = {...cam, grow: o.grow ?? 1}; Object.assign(cam, keep); camera(); flyTo(to, o.ms ?? 620, o.done);
  }
  // Bring one map point to the middle of the part of the view that panels leave free, at the distance asked for.
  // The camera moves over the ground plane, so one correction puts the point exactly there.
  function focus(pt, pad = {}, o = {}) {
    const w = cw, h = ch, L = pad.left ?? 60, R = pad.right ?? 60, T = pad.top ?? 90, Bm = pad.bottom ?? 60, keep = {...cam};
    cam.bearing = o.bearing ?? cam.bearing; cam.pitch = o.pitch ?? cam.pitch; cam.dist = clamp(o.dist ?? cam.dist, lim.minDist, lim.maxDist);
    cam.x = pt[0]; cam.z = pt[1]; camera();
    const s = project(pt[0], pt[1], pt[2] || 0), a = s && ground(s.x, s.y), b = ground((L + w - R) / 2, (T + h - Bm) / 2);
    if (a && b) { cam.x += a[0] - b[0]; cam.z += a[1] - b[1]; camera(); }
    const to = {...cam, grow: 1}; Object.assign(cam, keep); camera(); flyTo(to, o.ms ?? 560, o.done);
  }
  // Zoom about a screen point. Wheel steps are eased and add up, so a spin of the wheel is one smooth move.
  function zoom(factor, sx, sy, smooth) {
    sx ??= cw / 2; sy ??= ch / 2;
    const base = anim && anim.zoomTo ? anim.zoomTo : cam.dist, to = clamp(base / factor, lim.minDist, lim.maxDist), from = cam.dist;
    const at = d => { const before = ground(sx, sy); cam.dist = d; camera(); const after = ground(sx, sy); if (before && after) { cam.x += before[0] - after[0]; cam.z += before[1] - after[1]; } moved(); };
    if (opts.reduceMotion) { anim = null; at(to); return; }
    anim = {t0: 0, ms: smooth === 'wheel' ? 170 : 280, zoomTo: to, step(t) { const q = 1 - Math.pow(1 - t, 3); at(from * Math.pow(to / from, q)); }};
    invalidate();
  }

  // ------------------------------------------------------------------ picking
  function pick(sx, sy) {
    const r = ray(sx, sy); let best = Infinity, hit = null;
    for (const s of structs) {
      if (r.d[1] < 0) { const t = (s.H - r.o[1]) / r.d[1], x = r.o[0] + r.d[0] * t, z = r.o[2] + r.d[2] * t; if (t > 0 && t < best && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && insidePoly(s.pts, x, z)) { best = t; hit = {s, x, z}; } }
      for (let i = 0; i < s.pts.length; i++) { const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length], ex = b[0] - a[0], ez = b[1] - a[1], den = r.d[0] * ez - r.d[2] * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - r.o[0]) * ez - (a[1] - r.o[2]) * ex) / den, u = ((a[0] - r.o[0]) * r.d[2] - (a[1] - r.o[2]) * r.d[0]) / den, y = r.o[1] + r.d[1] * t;
        if (t > 0 && t < best && u >= 0 && u <= 1 && y >= 0 && y <= s.H) { best = t; hit = {s, x: a[0] + ex * u, z: a[1] + ez * u}; } }
    }
    const g = r.d[1] < -1e-3 ? -r.o[1] / r.d[1] : Infinity;
    if (hit && best < g) { const list = byPlace.get(hit.s.id) || []; const p = list.find(q => insidePoly(q.footprint, hit.x + (hit.x < (hit.s.x0 + hit.s.x1) / 2 ? .5 : -.5), hit.z + (hit.z < (hit.s.z0 + hit.s.z1) / 2 ? .5 : -.5))) || list[0]; return {place: p ? p.id : null, structure: hit.s.id, x: hit.x, y: hit.z}; }
    if (!Number.isFinite(g)) return null;
    const x = r.o[0] + r.d[0] * g, z = r.o[2] + r.d[2] * g; let open = null, size = Infinity;
    for (const p of atlas.places) if (!byPlace.has(p.id) && !p.sharedFootprint && insidePoly(p.footprint, x, z)) { const a = Math.abs(area2(p.footprint)); if (a < size) { size = a; open = p; } }
    return {place: open ? open.id : null, structure: null, x, y: z};
  }
  function structOf(placeId) { const p = atlas.places.find(q => q.id === placeId); if (!p) return null; return structs.find(s => s.id === (p.sharedFootprint || p.id)) || null; }

  // ------------------------------------------------------------------ light
  function lighting() {
    const el = env.el, day = clamp((el + 3) / 9, 0, 1), s = env.sun, warm = clamp((el - 2) / 26, 0, 1), dusk = Math.sin(day * Math.PI);
    const t = env.az * D2R, e = Math.max(el, 2) * D2R;
    // no sunlight wanted: an even studio light, the same at any hour
    if (!env.light) return {key: .34, dir: norm([-.45, .8, .42]), day: 1, night: 0, strength: 0, sunCol: [1, .98, .94], amb: [.78, .79, .80], top: [.36, .62, .90], hor: [.84, .92, .98]};
    return {key: 0, dir: [Math.sin(t) * Math.cos(e), Math.sin(e), -Math.cos(t) * Math.cos(e)], day, night: 1 - day,
      strength: s * clamp((el - .5) / 5, 0, 1), sunCol: mix3([1, .76, .5], [1, .97, .9], warm),
      amb: mix3([.47, .51, .66], mix3([.60, .62, .66], [.78, .79, .80], 1 - s), day),
      top: mix3([.03, .06, .14], mix3([.34, .60, .90], [.60, .66, .72], 1 - s), day), hor: mix3(mix3([.11, .15, .26], mix3([.83, .92, .98], [.83, .86, .88], 1 - s), day), [.98, .68, .44], dusk * .45 * s)};
  }
  function lightMatrix(dir) {
    const c = [1040, 0, 685], e = [c[0] + dir[0] * 5000, dir[1] * 5000, c[2] + dir[2] * 5000], view = m4.look(e, c, Math.abs(dir[1]) > .985 ? [0, 0, -1] : [0, 1, 0]);
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const x of [-330, 2420]) for (const z of [-280, 1650]) for (const y of [0, 110]) { const v = m4.apply(view, [x, y, z, 1]); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); } }
    return m4.mul(m4.ortho(lo[0], hi[0], lo[1], hi[1], -hi[2] - 20, -lo[2] + 20), view);
  }

  // ------------------------------------------------------------------ frame
  function invalidate() { dirty = true; if (!raf && ok) raf = requestAnimationFrame(frame); }
  function animating() { return !opts.reduceMotion && !document.hidden && (Object.values(ribbons).some(r => r.n && r.flow) || tint.run || tint.pulseMs > 0); }
  function stepTint(now) {
    if (!tint.run) return; if (!tint.t0) tint.t0 = now;
    const t = tint.ms ? clamp((now - tint.t0) / tint.ms, 0, 1) : 1, q = 1 - Math.pow(1 - t, 3), c = tint.cur, b = G.tintBytes;
    for (let k = 0; k < c.length; k++) { c[k] = tint.from[k] + (tint.to[k] - tint.from[k]) * q; b[k] = Math.round(clamp(c[k], 0, 1) * 255); }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tintTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, G.tintN, 3, gl.RGBA, gl.UNSIGNED_BYTE, b);
    if (t >= 1) tint.run = false;
  }
  function pulseAt(now) {
    if (!tint.pulseMs) return 0; if (!tint.pulseT0) tint.pulseT0 = now;
    const s = (now - tint.pulseT0) / 1000, e = s * 1000 / tint.pulseMs; if (e >= 1) { tint.pulseMs = 0; return 0; }
    return Math.sin(e * Math.PI) * (.5 + .5 * Math.sin(s * Math.PI * 2 * 1.25 - Math.PI / 2));
  }
  function setTint(list, o = {}) {
    if (!ok) return;
    const N = G.tintN, to = new Float32Array(N * 12), from = tint.cur.slice();
    for (const e of list || []) { const s = structOf(e.place); if (!s) continue;
      (e.colors || [e.color]).slice(0, 3).forEach((c, r) => { const k = (r * N + s.index) * 4; to[k] = c[0]; to[k + 1] = c[1]; to[k + 2] = c[2]; to[k + 3] = r ? 1 : e.a; }); }
    // fading in or out changes only the strength: the colours (and stripes) stay what they are
    for (let i = 0; i < N; i++) { const a0 = from[i * 4 + 3], a1 = to[i * 4 + 3], into = a0 < .004 && a1 > 0, out = a1 < .004 && a0 > 0; if (!into && !out) continue;
      const [src, dst] = into ? [to, from] : [from, to]; for (let r = 0; r < 3; r++) { const k = (r * N + i) * 4; dst[k] = src[k]; dst[k + 1] = src[k + 1]; dst[k + 2] = src[k + 2]; if (r) dst[k + 3] = src[k + 3]; } }
    Object.assign(tint, {from, to, t0: 0, ms: opts.reduceMotion ? 0 : (o.ms ?? 520), run: true});
    if (o.pulse && !opts.reduceMotion) Object.assign(tint, {pulseT0: 0, pulseMs: o.pulse});
    invalidate();
  }
  function frame(now) {
    raf = 0; if (!ok || canvas.hidden) return;
    if (anim) { const a = anim; if (!a.t0) a.t0 = now; const t = clamp((now - a.t0) / a.ms, 0, 1); a.step(t); if (t >= 1 && anim === a) { anim = null; a.done?.(); } }
    stepTint(now);
    const moving = !!anim || animating();
    // a slow device gets a lighter picture instead of a stuttering one
    if (moving && lastNow) { const dt = now - lastNow; slow = dt > 30 && dt < 400 ? slow + 1 : Math.max(0, slow - 2); if (slow > 40 && quality > .55) { quality = Math.max(.55, quality - .15); slow = 0; sizeCanvas(); } }
    lastNow = moving ? now : 0;
    const f0 = performance.now(); draw(now); dirty = false; opts.onFrame?.(now); frameMs = performance.now() - f0;
    // one pending frame at most: a camera step inside this frame may already have asked for the next one
    if (!raf && (anim || animating() || dirty)) raf = requestAnimationFrame(frame);
  }
  function sizeCanvas() { cw = canvas.clientWidth || 1; ch = canvas.clientHeight || 1; const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality, w = Math.round(cw * dpr), h = Math.round(ch * dpr); if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; } }
  function resize() { if (!ok) return; sizeCanvas(); camera(); invalidate(); }
  function common(p, L) {
    const u = p.u; gl.uniformMatrix4fv(u.u_vp, false, vp); gl.uniformMatrix4fv(u.u_light, false, lightVP); gl.uniform3fv(u.u_sunDir, L.dir); gl.uniform3fv(u.u_sunCol, L.sunCol); gl.uniform3fv(u.u_amb, L.amb);
    gl.uniform3fv(u.u_fog, L.hor); gl.uniform3fv(u.u_eye, eye); gl.uniform1f(u.u_sun, L.strength); gl.uniform1f(u.u_night, L.night); gl.uniform1f(u.u_fogK, Math.max(2600, cam.dist * 1.7)); gl.uniform1f(u.u_key, L.key); gl.uniform1i(u.u_shadow, 1);
  }
  function drawScene(p, depthOnly) {
    gl.uniform1f(p.u.u_season, env.season); gl.uniform1f(p.u.u_grow, cam.grow);
    gl.bindVertexArray(G.static.vao); gl.disableVertexAttribArray(5); gl.vertexAttrib4f(5, 0, 0, 1, 0); gl.drawArrays(gl.TRIANGLES, 0, G.static.n);
    gl.bindVertexArray(G.tree.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, G.tree.n, G.tree.count);
  }
  function draw(now) {
    const L = lighting(), time = (now - G.t0) / 1000;
    if (shadowDirty && L.strength > .02) {
      lightVP = lightMatrix(L.dir); gl.bindFramebuffer(gl.FRAMEBUFFER, G.shadowFB); gl.viewport(0, 0, G.shadowSize, G.shadowSize); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4); gl.useProgram(P.depth.p); gl.uniformMatrix4fv(P.depth.u.u_vp, false, lightVP); drawScene(P.depth, true); gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); shadowDirty = false;
    }
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(L.hor[0], L.hor[1], L.hor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.shadowTex);
    // sky: the horizon line follows the camera tilt
    const hz = project(cam.x + Math.sin(cam.bearing * D2R) * 60000, cam.z - Math.cos(cam.bearing * D2R) * 60000, 0), horizon = hz ? 1 - hz.y / ch : 1.2;
    gl.depthMask(false); gl.useProgram(P.sky.p); gl.uniform3fv(P.sky.u.u_top, L.top); gl.uniform3fv(P.sky.u.u_hor, L.hor); gl.uniform1f(P.sky.u.u_horizon, horizon); gl.bindVertexArray(G.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    gl.useProgram(P.ground.p); common(P.ground, L); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.groundTex); gl.uniform1i(P.ground.u.u_tex, 0); gl.uniform1f(P.ground.u.u_hasTex, texReady ? 1 : 0); gl.uniform3fv(P.ground.u.u_outer, outer);
    gl.bindVertexArray(G.ground.vao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.useProgram(P.main.p); common(P.main, L); gl.uniform1f(P.main.u.u_time, time); gl.uniform1f(P.main.u.u_sel, sel); gl.uniform1f(P.main.u.u_hot, hot);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tintTex); gl.uniform1i(P.main.u.u_tint, 2); gl.uniform1f(P.main.u.u_pulse, pulseAt(now));
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); drawScene(P.main); gl.disable(gl.POLYGON_OFFSET_FILL);
    // thin dark edges give the blocks the look of an architectural model; they fade out when the camera is far away
    const edge = clamp(1.7 - cam.dist / 1300, 0, 1);
    if (G.lines.n && edge > .02) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.useProgram(P.rib.p); gl.uniformMatrix4fv(P.rib.u.u_vp, false, vp); gl.uniform1f(P.rib.u.u_flow, 0);
      gl.uniform1f(P.rib.u.u_alpha, edge); gl.uniform1f(P.rib.u.u_grow, cam.grow); gl.bindVertexArray(G.lines.vao); gl.drawArrays(gl.LINES, 0, G.lines.n); gl.depthMask(true); gl.disable(gl.BLEND); }
    // ribbons lie just above the ground; a faint second pass shows them through buildings
    const list = Object.values(ribbons).filter(r => r.n).sort((a, b) => a.order - b.order);
    if (list.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.useProgram(P.rib.p); gl.uniformMatrix4fv(P.rib.u.u_vp, false, vp); gl.uniform1f(P.rib.u.u_time, time); gl.uniform1f(P.rib.u.u_grow, 1);
      for (const r of list) { gl.bindVertexArray(r.vao); gl.uniform1f(P.rib.u.u_flow, r.flow ? 1 : 0);
        if (r.xray) { gl.depthFunc(gl.GREATER); gl.uniform1f(P.rib.u.u_alpha, r.alpha * .3); gl.drawArrays(gl.TRIANGLES, 0, r.n); gl.depthFunc(gl.LEQUAL); }
        gl.uniform1f(P.rib.u.u_alpha, r.alpha); gl.drawArrays(gl.TRIANGLES, 0, r.n); }
      gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------------ input
  function bindInput() {
    const pts = new Map(); let mode = null, start = null, moved_ = false, hoverAt = 0, trail = [];
    const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      stop(); canvas.focus({preventScroll: true}); canvas.setPointerCapture(e.pointerId); const [x, y] = local(e); pts.set(e.pointerId, [x, y]); moved_ = false; trail = [];
      if (pts.size === 1) { mode = e.button === 2 || e.ctrlKey || e.shiftKey ? 'orbit' : 'pan'; start = {x, y, cam: {...cam}, g: ground(x, y)}; canvas.classList.add('dragging'); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; mode = 'pinch'; start = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), my: (a[1] + b[1]) / 2, cam: {...cam}}; }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = local(e);
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse' && performance.now() - hoverAt > 40) { hoverAt = performance.now(); const h = pick(x, y), s = h?.place ? structOf(h.place) : null, idx = s ? s.index : -5; canvas.style.cursor = h?.place ? 'pointer' : '';
          if (idx !== hot) { hot = idx; invalidate(); } opts.onHover?.(h?.place || null, x, y, h?.structure || null); } return; }
      pts.set(e.pointerId, [x, y]); if (!start) return;
      if (mode === 'pinch' && pts.size >= 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), my = (a[1] + b[1]) / 2;
        cam.dist = start.cam.dist * start.d / Math.max(d, 10); cam.bearing = start.cam.bearing - (ang - start.ang) / D2R; cam.pitch = start.cam.pitch - (my - start.my) * .25; moved_ = true; moved(); return; }
      if (Math.hypot(x - start.x, y - start.y) > 4) moved_ = true; if (!moved_) return;
      if (mode === 'orbit') { cam.bearing = start.cam.bearing - (x - start.x) * .35; cam.pitch = start.cam.pitch - (y - start.y) * .3; moved(); }
      else if (start.g) { const keep = {...cam}; Object.assign(cam, start.cam); camera(); const g = ground(x, y); Object.assign(cam, keep); if (g) { cam.x = start.cam.x + start.g[0] - g[0]; cam.z = start.cam.z + start.g[1] - g[1]; } moved(); trail.push([performance.now(), cam.x, cam.z]); if (trail.length > 8) trail.shift(); }
    });
    // let go while moving and the map keeps gliding for a moment
    const glide = () => { const now = performance.now(), a = trail.find(s => now - s[0] < 90), b = trail[trail.length - 1]; if (!a || a === b || now - b[0] > 60 || opts.reduceMotion) return;
      const dt = Math.max(8, b[0] - a[0]), vx = (b[1] - a[1]) / dt, vz = (b[2] - a[2]) / dt, tau = 260; if (Math.hypot(vx, vz) * tau < 6) return;
      const x0 = cam.x, z0 = cam.z; anim = {t0: 0, ms: 900, step(t) { const k = tau * (1 - Math.exp(-t * 900 / tau)); cam.x = x0 + vx * k; cam.z = z0 + vz * k; moved(); }}; invalidate(); };
    const up = e => { if (!pts.has(e.pointerId)) return; const [x, y] = local(e); pts.delete(e.pointerId);
      if (!pts.size) { canvas.classList.remove('dragging'); if (!moved_ && mode === 'pan' && e.type === 'pointerup' && e.button === 0) opts.onPick?.(pick(x, y), x, y); else if (moved_ && mode === 'pan' && e.type === 'pointerup') glide(); mode = null; start = null; }
      else if (pts.size === 1) { const [p] = [...pts.values()]; mode = 'pan'; start = {x: p[0], y: p[1], cam: {...cam}, g: ground(p[0], p[1])}; trail = []; } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => { if (hot !== -5) { hot = -5; invalidate(); } opts.onHover?.(null); });
    // Shift + wheel turns the model (Chrome and Edge on Windows report it as a sideways scroll, so deltaX counts too);
    // a touchpad pinch arrives as wheel + Ctrl and zooms, as everywhere else. Line and page steps become pixels.
    canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); let d = e.shiftKey ? e.deltaY || e.deltaX : e.deltaY; if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= ch;
      if (e.shiftKey) { stop(); cam.bearing += d * .12; moved(); } else zoom(Math.pow(1.0017, clamp(-d, -260, 260)), x, y, 'wheel'); }, {passive: false});
    canvas.addEventListener('dblclick', e => { const [x, y] = local(e); zoom(e.shiftKey ? 1 / 1.7 : 1.7, x, y, true); });
    canvas.addEventListener('keydown', e => {
      const b = cam.bearing * D2R, step = cam.dist * .08, f = [Math.sin(b), -Math.cos(b)], r = [Math.cos(b), Math.sin(b)], k = e.key;
      const go = {ArrowUp: [f[0], f[1]], ArrowDown: [-f[0], -f[1]], ArrowLeft: [-r[0], -r[1]], ArrowRight: [r[0], r[1]]}[k];
      if (go) { cam.x += go[0] * step; cam.z += go[1] * step; } else if (k === '+' || k === '=') { zoom(1.25, undefined, undefined, true); e.preventDefault(); return; } else if (k === '-') { zoom(1 / 1.25, undefined, undefined, true); e.preventDefault(); return; }
      else if (k === 'q' || k === 'Q') cam.bearing -= 15; else if (k === 'e' || k === 'E') cam.bearing += 15; else if (k === 'PageUp') cam.pitch -= 8; else if (k === 'PageDown') cam.pitch += 8; else return;
      e.preventDefault(); stop(); moved();
    });
  }

  // ------------------------------------------------------------------ set-up
  function init(cv, at, sc, o = {}) {
    canvas = cv; atlas = at; scene = sc; opts = o;
    try {
      gl = canvas.getContext('webgl2', {antialias: true, alpha: false, powerPreference: 'high-performance'}); if (!gl || !scene) return false;
      P.main = program(VS, FS); P.depth = program(VS, FS_DEPTH); P.ground = program(VS_GROUND, FS_GROUND); P.rib = program(VS_RIB, FS_RIB); P.sky = program(VS_SKY, FS_SKY);
      for (const p of atlas.places) { const key = p.sharedFootprint || p.id; if (atlas.structures.some(s => s.id === key)) { if (!byPlace.has(key)) byPlace.set(key, []); byPlace.get(key).push(p); } }
      for (const s of atlas.structures) if (s.of) { const p = atlas.places.find(q => q.id === s.of); if (p) byPlace.set(s.id, [p]); }
      G.static = staticVAO(buildStatic());
      G.lines = {vao: gl.createVertexArray(), n: edgeLines.length / 9}; gl.bindVertexArray(G.lines.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeLines), gl.STATIC_DRAW);
      [[0, 3, 0], [1, 4, 3], [2, 2, 7]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, off * 4); });
      const tree = buildTree(); G.tree = staticVAO(tree);
      const inst = new Float32Array(scene.trees.flatMap(t => [t[0], t[1], t[2] * 1.05, t[3]])), ib = gl.createBuffer();
      gl.bindVertexArray(G.tree.vao); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW); gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(5, 1); G.tree.count = inst.length / 4;
      // ground: the plan plus a wide apron in the margin colour
      const ex = atlas.extent, Z = 9000, gx0 = 1050 - Z, gx1 = 1050 + Z, gz0 = 700 - Z, gz1 = 700 + Z, uv = (x, z) => [(x - ex.x) / ex.w, (z - ex.y) / ex.h];
      const gv = [[gx0, gz0], [gx1, gz0], [gx1, gz1], [gx0, gz0], [gx1, gz1], [gx0, gz1]].flatMap(([x, z]) => [x, 0, z, ...uv(x, z)]);
      G.ground = {vao: gl.createVertexArray()}; gl.bindVertexArray(G.ground.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      G.empty = gl.createVertexArray(); G.groundTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.groundTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([220, 230, 210, 255]));
      // shadow map
      G.shadowSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), innerWidth <= 680 ? 1024 : 2048); G.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.shadowTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, G.shadowSize, G.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      G.shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.shadowFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, G.shadowTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('shadow framebuffer'); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // building tints: all clear to begin with
      G.tintN = Math.max(1, atlas.structures.length); tint.cur = new Float32Array(G.tintN * 12); G.tintBytes = new Uint8Array(G.tintN * 12);
      G.tintTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.tintTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, G.tintN, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, G.tintBytes);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); G.t0 = performance.now(); ok = true;
    } catch (err) { console.warn('3D map unavailable:', err); ok = false; return false; }
    // the illustrated ground, rasterised from the SVG at up to 4096 px
    const img = new Image(); img.onload = () => {
      try { const ex = atlas.extent, W = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), innerWidth <= 680 ? 2048 : 4096), H = Math.round(W * ex.h / ex.w), c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.fillStyle = '#e4ebdc'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); const px = g.getImageData(6, 6, 1, 1).data; outer = [px[0] / 255, px[1] / 255, px[2] / 255];
        gl.bindTexture(gl.TEXTURE_2D, G.groundTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        texReady = true; invalidate(); opts.onReady?.(); } catch (err) { console.warn('3D ground texture:', err); }
    };
    img.src = o.groundUrl || 'assets/campus-ground.svg';
    bindInput(); new ResizeObserver(resize).observe(canvas); resize();
    return true;
  }

  return {
    init, resize, project, pick, fit, focus, flyTo, zoom, stop, setRibbon, M, FOV, size: () => [cw, ch],
    get ok() { return ok; }, get ready() { return texReady; },
    view: () => ({...cam}), setView(v) { stop(); Object.assign(cam, {grow: 1}, v); moved(); },
    setEnv(e) { Object.assign(env, e); shadowDirty = true; invalidate(); },
    setSelected(placeId) { const s = placeId ? structOf(placeId) : null; sel = s ? s.index : -5; invalidate(); },
    setTint, tinted: () => { const out = {}; if (!tint.cur) return out; for (const s of structs) { const a = tint.to ? tint.to[s.index * 4 + 3] : 0; if (a > .004) out[s.id] = +a.toFixed(2); } return out; },
    top(placeId) { const s = structOf(placeId); return s ? s.H : 0; },
    invalidate, busy: () => !!anim, frameMs: () => frameMs, structures: () => structs.length, ribbons: () => Object.fromEntries(Object.entries(ribbons).map(([k, r]) => [k, r.n / 6])), trees: () => (ok ? G.tree.count : 0),
    // what the light is doing, for tests and the legend
    light: () => { const L = lighting(); return {dir: L.dir, strength: L.strength, night: L.night, lit: env.light}; }, quality: () => quality,
    // true when the ground point is in the shadow of a building at the current sun (same rule as the shade model)
    shadowed(x, y) { const L = lighting(); if (L.strength < .02) return true; for (const s of structs) { const reach = s.H / Math.tan(Math.max(env.el, 2) * D2R); const bx = x + L.dir[0] / Math.hypot(L.dir[0], L.dir[2]) * reach, bz = y + L.dir[2] / Math.hypot(L.dir[0], L.dir[2]) * reach;
        for (let i = 0; i < s.pts.length; i++) { const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length], d1 = (bx - x) * (a[1] - y) - (bz - y) * (a[0] - x), d2 = (bx - x) * (b[1] - y) - (bz - y) * (b[0] - x), d3 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]), d4 = (b[0] - a[0]) * (bz - a[1]) - (b[1] - a[1]) * (bx - a[0]); if (d1 * d2 < 0 && d3 * d4 < 0) return true; } } return false; }
  };
})();
