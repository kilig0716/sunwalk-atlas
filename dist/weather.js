'use strict';
// Weather for the campus: hourly forecast of 长安区太乙宫街道 from 中国天气网 (数据来源：中央气象台).
// The local server (serve.py → /api/weather) reads the forecast. A static copy of the site (GitHub Pages, the team
// server) has no such service: it republishes the snapshot file instead, so the page then reads the newest published
// snapshot. A snapshot is used while it still covers the present; otherwise the page assumes a clear sky.
const Weather = (() => {
  // `sun` is the share of direct sunlight that still reaches the ground. These are working estimates
  // chosen by the team, not measurements: change them here and every route follows.
  const KINDS = {
    clear:    {label:'晴',   sun:1,  wet:false},
    cloudy:   {label:'多云', sun:.6, wet:false},
    haze:     {label:'霾',   sun:.5, wet:false},
    dust:     {label:'沙尘', sun:.5, wet:false},
    fog:      {label:'雾',   sun:.3, wet:false},
    overcast: {label:'阴',   sun:.2, wet:false},
    rain:     {label:'雨',   sun:0,  wet:true},
    snow:     {label:'雪',   sun:0,  wet:true}
  };
  const CODES = {clear:['00'],cloudy:['01'],overcast:['02'],fog:['18','32','49','57','58'],haze:['53','54','55','56'],dust:['20','29','30','31'],
    rain:['03','04','05','06','07','08','09','10','11','12','19','21','22','23','24','25','301'],snow:['13','14','15','16','17','26','27','28','302']};
  const byCode = {};
  for (const kind in CODES) for (const code of CODES[kind]) byCode[code] = kind;
  function kindOf(code, text) {
    if (byCode[code]) return byCode[code];
    const t = String(text || '');
    return /雪/.test(t) ? 'snow' : /雨/.test(t) ? 'rain' : /雾/.test(t) ? 'fog' : /霾/.test(t) ? 'haze' : /沙|尘/.test(t) ? 'dust' : /阴/.test(t) ? 'overcast' : /多云/.test(t) ? 'cloudy' : /晴/.test(t) ? 'clear' : null;
  }
  const HOUR = 36e5, DAY = 864e5, ZONE = 8 * HOUR; // Beijing time
  const dayStart = now => Math.floor((now + ZONE) / DAY) * DAY - ZONE;
  const weekday = now => new Date(now + ZONE).getUTCDay() || 7;
  let data = null, source = 'none', timer = null;
  const listeners = [];
  function valid(d) {return !!d && Array.isArray(d.hours) && d.hours.length > 0 && d.hours.every(h => h && Number.isFinite(h.t));}
  // a forecast is only worth showing while it still reaches the present hour
  function usable(d, now = Date.now()) {return valid(d) && d.hours[d.hours.length - 1].t >= now - HOUR;}
  function use(d, from) {
    const next = usable(d) ? d : null, changed = (next?.fetchedAt || 0) !== (data?.fetchedAt || 0) || !!next !== !!data;
    data = next; source = next ? from : 'none';
    if (changed) listeners.forEach(fn => {try {fn();} catch (error) {console.error(error);}});
    return !!next;
  }
  // the newest published snapshot (not the copy loaded with the page): a static site republishes it on a timer
  async function latestSnapshot() {
    try {
      const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch('assets/weather-snapshot.js?t=' + Date.now(), {signal: ctl.signal, cache: 'no-store'});
      clearTimeout(stop);
      if (!r.ok) return null;
      const s = await r.text(), a = s.indexOf('{'), b = s.lastIndexOf('}');
      return a < 0 || b < a ? null : JSON.parse(s.slice(a, b + 1));
    } catch {return null;}
  }
  async function load() {
    try {
      const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch('api/weather', {signal: ctl.signal, cache: 'no-store'});
      clearTimeout(stop);
      if (!r.ok) throw new Error('weather ' + r.status);
      const d = await r.json();
      if (!usable(d)) throw new Error('weather stale');
      use(d, 'live');
    } catch {
      // keep whatever is newest and still covers the present: what we have, the newest published snapshot, the page's copy
      const best = [data, await latestSnapshot(), globalThis.WEATHER_SNAPSHOT].filter(d => usable(d)).sort((x, y) => (y.fetchedAt || 0) - (x.fetchedAt || 0))[0];
      if (best !== data || !best) use(best || null, best === data ? source : 'snapshot');
    }
    return data;
  }
  function start() {load(); clearInterval(timer); timer = setInterval(load, 30 * 60e3);}
  function entry(h, from) {
    const kind = kindOf(h.code, h.text);
    if (!kind) return null;
    return {kind, label: h.text || KINDS[kind].label, sun: KINDS[kind].sun, wet: KINDS[kind].wet, temp: Number.isFinite(h.temp) ? h.temp : null,
      wind: [h.windD, h.windL].filter(Boolean).join(' ') || h.wind || '', night: !!h.night, t: h.t, source: from};
  }
  // Forecast for a weekday (1 = Monday) and a clock hour; null when the forecast does not reach that time.
  function at(day, hour, now = Date.now()) {
    if (!usable(data, now)) return null;
    const ahead = (day - weekday(now) + 7) % 7, t = dayStart(now) + ahead * DAY + Math.floor(hour) * HOUR;
    const hit = data.hours.find(h => h.t === t);
    if (hit) return entry(hit, 'forecast');
    // the hours between "now" and the first forecast hour: use the observation, or else the first forecast hour
    const first = data.hours[0];
    if (t < first.t && first.t - t <= 3 * HOUR && t >= Math.floor(now / HOUR) * HOUR - HOUR)
      return (data.now?.text && entry({...data.now, code: '', t}, 'now')) || entry({...first, t}, 'forecast');
    return null;
  }
  // The sky used for a calculation: a manual choice, else the forecast, else a clear sky (the cautious case).
  function sky(day, hour, manual, now = Date.now()) {
    const f = at(day, hour, now);
    if (manual && KINDS[manual]) return {kind: manual, label: KINDS[manual].label, sun: KINDS[manual].sun, wet: KINDS[manual].wet, temp: f ? f.temp : null, wind: '', night: false, t: f ? f.t : null, source: 'manual'};
    return f || {kind: 'clear', label: '晴', sun: 1, wet: false, temp: null, wind: '', night: false, t: null, source: 'default'};
  }
  const pct = s => Math.round(s.sun * 100);
  // Which of the compared routes suits this weather. The thresholds (12 ℃, 28 ℃, half sunlight) are the team's own judgement.
  function advise(s, dark) {
    if (dark) return {pick: null, why: '夜间没有日照，只按距离选路。'};
    if (s.wet) return {pick: null, why: s.label + '，没有直射日照，只按距离选路；记得带伞。'};
    if (s.source === 'default') return {pick: null, why: ''};
    const t = s.temp, has = Number.isFinite(t);
    if (s.sun < .5) return {pick: '距离优先', why: s.label + '，日照弱（按晴天的 ' + pct(s) + '% 折算），不必为荫凉绕路。'};
    if (has && t < 12) return {pick: '距离优先', why: s.label + ' ' + Math.round(t) + '℃，天气偏冷，晒晒太阳更舒服，不必刻意找荫凉。'};
    if (has && t >= 28 && s.sun >= .9) return {pick: '少晒优先', why: s.label + ' ' + Math.round(t) + '℃，晴热，建议尽量走林荫。'};
    return {pick: '折中方案', why: s.label + (has ? ' ' + Math.round(t) + '℃' : '') + '，日照按晴天的 ' + pct(s) + '% 折算，推荐兼顾距离和荫凉的走法。'};
  }
  const P = {
    sun: '<circle cx="12" cy="12" r="4.3" fill="#f6c445" stroke="#dc9b14"/><path stroke="#dc9b14" d="M12 2.4v2.5m0 14.2v2.5M2.4 12h2.5m14.2 0h2.5M5.2 5.2 7 7m10 10 1.8 1.8M5.2 18.8 7 17m10-10 1.8-1.8"/>',
    moon: '<path d="M19.6 14.3A8 8 0 0 1 9.7 4.4a8 8 0 1 0 9.9 9.9z" fill="#dfe6f6" stroke="#8697c2"/>',
    smallSun: '<circle cx="8.2" cy="8" r="3.3" fill="#f6c445" stroke="#dc9b14"/><path stroke="#dc9b14" d="M8.2 2.2v1.4M2.4 8h1.4m.3-4.1 1 1m7.2-1-1 1"/>',
    smallMoon: '<path d="M12.6 8.9A5 5 0 0 1 6.9 3.2a5 5 0 1 0 5.7 5.7z" fill="#dfe6f6" stroke="#8697c2"/>',
    cloud: '<path d="M7.6 18.6a4.1 4.1 0 0 1-.5-8.2 5.2 5.2 0 0 1 10-1.1 4.3 4.3 0 0 1-.4 9.3z" fill="#eef2f5" stroke="#8494a1"/>',
    lowCloud: '<path d="M9.4 20a3.7 3.7 0 0 1-.5-7.4 4.7 4.7 0 0 1 9-1 3.9 3.9 0 0 1-.4 8.4z" fill="#eef2f5" stroke="#8494a1"/>',
    highCloud: '<path d="M7.6 15.6a4.1 4.1 0 0 1-.5-8.2 5.2 5.2 0 0 1 10-1.1 4.3 4.3 0 0 1-.4 9.3z" fill="#e3e9ee" stroke="#7b8b98"/>',
    drops: '<path stroke="#3a8fd6" d="m8.4 18.3-1 2.8m5.1-2.8-1 2.8m5.1-2.8-1 2.8"/>',
    flakes: '<g fill="#8fbfe6" stroke="none"><circle cx="8" cy="19.6" r="1.2"/><circle cx="12.4" cy="21" r="1.2"/><circle cx="16.6" cy="19.6" r="1.2"/></g>',
    mist: '<path stroke="#93a2ad" d="M4 8.5h16M3 12.5h18M5.5 16.5h13"/>', dusty: '<path stroke="#b89a66" d="M4 8.5h16M3 12.5h18M5.5 16.5h13"/>'
  };
  function icon(kind, night, size) {
    const body = kind === 'clear' ? (night ? P.moon : P.sun) : kind === 'cloudy' ? (night ? P.smallMoon : P.smallSun) + P.lowCloud : kind === 'overcast' ? P.cloud
      : kind === 'rain' ? P.highCloud + P.drops : kind === 'snow' ? P.highCloud + P.flakes : kind === 'fog' ? P.mist : P.dusty;
    return '<svg aria-hidden="true" class="wx-ico" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + body + '</svg>';
  }
  return {KINDS, kindOf, use, load, start, at, sky, advise, icon, pct, weekday, dayStart, usable,
    onChange(fn) {listeners.push(fn);}, get data() {return data;}, get source() {return source;}};
})();
