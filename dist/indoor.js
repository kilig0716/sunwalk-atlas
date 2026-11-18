'use strict';
// Indoor map of a building: the floor plans come from the team's drawing (assets/indoor-data.js, see tools/build_indoor.py).
// It answers one question the campus map cannot: once through the door, which way to the room.
const Indoor = (() => {
  const data = () => window.INDOOR || {};
  const st = {id: null, floor: 1, room: null, entrance: 'north', q: ''};
  const KIND = {media: '多媒体教室', class: '教室', office: '办公 / 功能用房', wc: '卫生间', small: '小间'};
  const E = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const has = id => !!data()[id];
  const rooms = b => b.floors.flatMap(f => f.rooms);
  const find = (b, id) => rooms(b).find(r => r.id === id);
  const full = r => r.name + (r.sub ? ' · ' + r.sub : '');
  const len = pts => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

  // ---- the way in: door -> corridor -> stairs -> corridor -> room ----
  function route(b, entranceId, roomId) {
    const e = b.entrances.find(x => x.id === entranceId) || b.entrances[0], r = find(b, roomId); if (!r) return null;
    const legs = {}, steps = [], add = (f, p) => { (legs[f] = legs[f] || []).push(p); }, stair = (n, id) => b.floors[n - 1].stairs.find(s => s.id === id);
    e.path.forEach(p => add(1, p)); let floor = 1, at = e.path[e.path.length - 1];
    steps.push({floor: 1, kind: 'door', text: '从' + e.label + '进楼'});
    if (r.floor > 1) {
      const s1 = stair(1, 'S'), s2 = stair(2, 'S'); add(1, s1.at); add(1, s1.foot);
      steps.push({floor: 1, kind: 'stairs', text: '沿走廊走到中部的' + s1.label + '，上到 2 层'}); add(2, s2.foot); add(2, s2.at); floor = 2; at = s2.at;
      if (r.floor > 2) { const n2 = stair(2, 'N'), nn = stair(r.floor, 'N'); add(2, n2.at); add(2, n2.foot);
        steps.push({floor: 2, kind: 'stairs', text: '在 2 层穿过走廊，换到对面的' + n2.label + '，上到 ' + r.floor + ' 层'}); add(r.floor, nn.foot); add(r.floor, nn.at); floor = r.floor; at = nn.at; }
    }
    const dx = r.at[0] - at[0], m = Math.round(Math.abs(dx) * b.mPerUnit), way = dx > 0 ? '东' : '西', host = r.via ? find(b, r.via) : null;
    add(floor, r.at); if (host) add(floor, host.door); add(floor, r.door);
    const end = Math.abs(r.door[1] - r.at[1]) < 1;   // entered from the end of the corridor, not from its side
    steps.push({floor, kind: 'walk', text: (m < 3 ? '出来就在旁边：' : '沿走廊向' + way + '走约 ' + m + ' 米，') + (host ? '走到尽头进 ' + host.name + '，' + full(r) + ' 在里面' : end ? '走到尽头就是 ' + full(r) : full(r) + ' 在走廊' + r.side + '侧')});
    const meters = Math.round(Object.values(legs).reduce((a, p) => a + len(p), 0) * b.mPerUnit);
    return {entrance: e, room: r, legs, steps, meters, up: r.floor - 1, floors: Object.keys(legs).map(Number)};
  }

  // ---- drawing ----
  function wrap(text, n) {   // break a label into lines of at most n characters, preferring the gaps the plan itself has
    const out = []; for (const part of text.split(/\s*·\s*|\s+/)) { let s = part; while (s.length > n) { out.push(s.slice(0, n)); s = s.slice(n); } if (s) out.push(s); } return out;
  }
  function roomSvg(r, sel) {
    const [x, y, w, h] = r.rect, cx = x + w / 2, cy = y + h / 2, tiny = w < 20, narrow = w < 34, big = h > 60;
    const size = tiny ? 4 : narrow ? 6.4 : r.name.length > 5 ? 6.4 : 8.6, sub = tiny ? [] : wrap(r.kind === 'wc' ? r.sub + '卫生间' : r.sub, Math.max(3, Math.floor((w - 5) / 4.3))).slice(0, big ? 4 : 3);
    const top = (big ? y + h * .26 : cy) - (sub.length * 5 + (tiny ? 0 : 4.6)) / 2 + (tiny ? 1.4 : 0);
    let t = '<g class="in-room k-' + r.kind + (sel ? ' sel' : '') + '" data-room="' + E(r.id) + '" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + E(r.floor + ' 层 ' + full(r)) + '"><title>' + E(full(r) + ' · ' + r.area + ' m²') + '</title>';
    t += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.8"/>';
    if (tiny) { const v = h > 40; t += '<text class="in-name" style="font-size:' + size + 'px" x="' + cx + '" y="' + (cy + 1.4) + '"' + (v ? ' transform="rotate(-90 ' + cx + ' ' + cy + ')"' : '') + '>' + E(r.name) + '</text>'; }
    else { t += '<text class="in-name" style="font-size:' + size + 'px" x="' + cx + '" y="' + (top + size * .36) + '">' + E(r.kind === 'wc' ? 'WC' : r.name) + '</text>';
      sub.forEach((line, i) => { t += '<text class="in-sub" x="' + cx + '" y="' + (top + size * .5 + 5.4 + i * 5) + '">' + E(line) + '</text>'; });
      if (!narrow) t += '<text class="in-area" x="' + (x + w - 2.4) + '" y="' + (y + h - 2.6) + '">' + r.area + ' m²</text>'; }
    // the door: a gap in the wall on the side one enters from
    const d = r.door, onX = Math.abs(d[1] - y) < .6 || Math.abs(d[1] - y - h) < .6;
    t += onX ? '<rect class="in-door" x="' + (d[0] - 3.2) + '" y="' + (d[1] - 1) + '" width="6.4" height="2" rx="1"/>' : '<rect class="in-door" x="' + (d[0] - 1) + '" y="' + (d[1] - 3.2) + '" width="2" height="6.4" rx="1"/>';
    return t + '</g>';
  }
  function floorSvg(b, n, rt) {
    const f = b.floors[n - 1], P = p => p[0] + ',' + p[1], leg = rt && rt.legs[n];
    let s = '<svg class="indoor-svg" viewBox="-20 -24 378 182" role="group" aria-label="' + E(b.title + ' ' + f.name + '平面图') + '">' +
      '<defs><pattern id="inSteps" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><path d="M0 .4H3.4" stroke="#8fa39a" stroke-width=".8"/></pattern>' +
      '<filter id="inLift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.6" stdDeviation="2.2" flood-color="#17342b" flood-opacity=".18"/></filter></defs>';
    s += '<text class="in-floor-mark" x="-15" y="154">' + n + 'F</text>';
    s += '<polygon class="in-shell" filter="url(#inLift)" points="' + f.outline.map(P).join(' ') + '"/>';
    if (f.hall) { const [x, y, w, h] = f.hall.rect; s += '<rect class="in-hall" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2"/><text class="in-name" style="font-size:6.4px;text-anchor:start" x="' + (x + 2.6) + '" y="' + (y + 9) + '">' + f.hall.name + '</text><text class="in-sub" style="text-anchor:start" x="' + (x + 2.8) + '" y="' + (y + 14.6) + '">' + f.hall.area + ' m²</text>'; }
    for (const k of f.stairs) {
      const [x, y, w, h] = k.rect, onRoute = leg?.some(p => samePoint(p, k.foot));
      s += '<g class="in-stair' + (onRoute ? ' along-route' : '') + '"><title>' + E(k.label) + '</title><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.6"/><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.6" fill="url(#inSteps)"/><rect class="in-stair-tag" x="' + (x + w / 2 - 9) + '" y="' + (y + h / 2 - 4) + '" width="18" height="8" rx="2"/><text class="in-stair-text" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 1.6) + '">' + E(k.label) + '</text></g>';
    }
    for (const r of f.rooms) s += roomSvg(r, st.room === r.id);
    if (n === 1) for (const e of b.entrances) { const [x, y] = e.mark, on = st.entrance === e.id, name = e.label.split('（')[0], side = e.id === 'east' ? [x + 14, y] : e.id === 'north' ? [x, y - 7] : [x, y + 8];
      s += '<g class="in-ent' + (on ? ' on' : '') + '" data-ent="' + e.id + '" tabindex="0" role="button" aria-pressed="' + on + '" aria-label="' + E('从' + e.label + '进') + '"><title>' + E(e.label + ' · ' + e.note) + '</title><rect x="' + (side[0] - 11) + '" y="' + (side[1] - 5) + '" width="22" height="9" rx="4.5"/><text x="' + side[0] + '" y="' + (side[1] + 1.6) + '">' + E(name) + '</text></g>'; }
    if (leg && leg.length > 1) {
      const a = leg[0], z = leg[leg.length - 1], last = rt.room.floor === n;
      s += '<g aria-hidden="true" pointer-events="none"><polyline class="in-route-bg" points="' + leg.map(P).join(' ') + '"/><polyline class="in-route" points="' + leg.map(P).join(' ') + '"/>';
      for (let i = 1; i < leg.length; i++) {
        const [x, y] = leg[i - 1], dx = leg[i][0] - x, dy = leg[i][1] - y;
        if (Math.hypot(dx, dy) < 17) continue;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        s += '<path class="in-direction" transform="translate(' + (x + dx / 2) + ' ' + (y + dy / 2) + ') rotate(' + angle + ')" d="M-2.5 -2.3 1.3 0-2.5 2.3"/>';
      }
      s += '<circle class="in-dot start" cx="' + a[0] + '" cy="' + a[1] + '" r="2.6"/>' +
        (last ? '<circle class="in-halo" cx="' + z[0] + '" cy="' + z[1] + '" r="6"/><circle class="in-dot end" cx="' + z[0] + '" cy="' + z[1] + '" r="3.1"/>' : '<circle class="in-dot mid" cx="' + z[0] + '" cy="' + z[1] + '" r="2.6"/>') + '</g>';
    }
    s += '<g class="in-compass" transform="translate(344 -8)"><circle r="8"/><path d="M0-5.6 2.6 3.2 0 1.6-2.6 3.2z"/><text y="-9.6">北</text></g>';
    s += '<text class="in-side-note" x="78" y="-9">北 · 内院一侧</text><text class="in-side-note" x="78" y="143">南 · 东区餐饮中心一侧</text><text class="in-side-note" x="352" y="73" transform="rotate(90 352 73)">东 · 诒德大道</text>';
    return s + '</svg>';
  }
  function matches(b, query) {
    const normalize = text => text.normalize('NFKC').toLowerCase();
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return rooms(b);
    return rooms(b).filter(r => {
      const number = r.floor, zh = '一二三四'[number - 1] || number;
      const floor = `${number}层 ${number}楼 ${number}f f${number} ${zh}层 ${zh}楼`;
      const wc = r.kind === 'wc' ? `wc 厕所 洗手间 ${r.sub}厕 ${r.sub}卫生间 ${r.sub}洗手间` : '';
      const labels = normalize([r.id, r.name, r.sub, KIND[r.kind], floor, wc].join(' '));
      return terms.every(word => labels.includes(word));
    });
  }

  function updateDirectory(b, host) {
    const hit = matches(b, st.q), list = host.querySelector('#indoorList');
    host.querySelector('#indoorCount').textContent = (st.q.trim() ? '找到 ' : '共 ') + hit.length + ' 间';
    list.scrollTop = 0;
    if (!hit.length) {
      list.innerHTML = `<div class="indoor-empty"><p>没有找到“${E(st.q)}”</p><button type="button" data-indoor-act="reset-search">清空搜索</button></div>`;
      return;
    }
    list.innerHTML = b.floors.map(f => {
      const group = hit.filter(r => r.floor === f.n);
      if (!group.length) return '';
      const items = group.map(r => {
        const selected = r.id === st.room;
        return `<button type="button" class="indoor-room k-${r.kind}${selected ? ' on' : ''}" data-room="${E(r.id)}" aria-pressed="${selected}" aria-label="${E(f.name + ' ' + full(r))}" title="${E(full(r))}">
          <b>${E(r.name)}</b><small>${E(r.sub || KIND[r.kind])}</small></button>`;
      }).join('');
      return `<div class="indoor-group" role="group" aria-label="${E(f.name)}"><span>${E(f.name)}</span>${items}</div>`;
    }).join('');
  }

  function routeHtml(b, rt) {
    if (!rt) return '';
    const steps = rt.steps.map(s => `<li class="s-${s.kind}${s.floor === st.floor ? ' here' : ''}" data-floor="${s.floor}">
      <button type="button" data-floor="${s.floor}" title="查看 ${s.floor} 层平面图"><i>${s.floor}F</i><span>${E(s.text)}</span></button></li>`).join('');
    return `<div class="indoor-route"><span class="indoor-route-label">${icon('route', 14)} 到达房间</span>
      <h3>${E(rt.room.name)}${rt.room.sub ? '<small>' + E(rt.room.sub) + '</small>' : ''}</h3>
      <p class="indoor-meta"><b>${rt.room.floor} 层</b><span>楼内约 ${rt.meters} 米</span>
        <span>${rt.up ? '上 ' + rt.up + ' 层楼梯' : '不用上楼'}</span><span>${rt.room.area} m²</span></p>
      <ol class="indoor-steps">${steps}</ol>
      <div class="small-actions"><button type="button" data-indoor-act="clear">换个房间</button>
        ${typeof places === 'undefined' ? '' : '<button type="button" class="solid" data-route-to="' + E(b.place) + '">规划到这栋楼的路线</button>'}</div></div>`;
  }

  function guidance(floor, rt) {
    if (!rt) return `<span>${icon('pin', 17)} 点选房间，查看从入口到门口的路线</span>`;
    const n = floor.n, leg = rt.legs[n], next = rt.floors[rt.floors.indexOf(n) + 1];
    const go = (floorNumber, text) => `<button type="button" data-floor="${floorNumber}">${text}${icon('chevron', 13)}</button>`;
    if (!leg) return `<span>${icon('layers', 16)} 本层没有步行路段</span>${go(rt.room.floor, '查看目的地')}`;
    const stairAt = p => floor.stairs.find(k => samePoint(k.foot, p))?.label || '楼梯';
    const from = n === 1 ? rt.entrance.label.split('（')[0] : stairAt(leg[0]);
    const to = n === rt.room.floor ? rt.room.name : stairAt(leg[leg.length - 1]);
    let jump = '';
    if (next) jump = go(next, '下一段 · ' + next + ' 层');
    else if (n !== 1) jump = go(1, '从入口看');
    return `<span class="indoor-leg">${icon('route', 17)}<span>${E(from)}</span>${icon('arrow', 13)}<b>${E(to)}</b></span>${jump}`;
  }

  function body(b) {
    const floors = [...b.floors].reverse().map(f => `<button type="button" id="indoorTab${f.n}" role="tab" data-floor="${f.n}" aria-controls="indoorFloorPanel">${f.n}<small>层</small></button>`).join('');
    const doors = b.entrances.map(e => `<button type="button" data-ent="${E(e.id)}" aria-label="${E(e.label + '，' + e.note)}" title="${E(e.note)}">${E(e.label.split('（')[0])}</button>`).join('');
    const legend = Object.entries(KIND).map(([kind, label]) => `<span class="k-${kind}"><i></i>${label}</span>`).join('');
    return `<div class="indoor" data-building="${E(b.place)}">
      <section class="indoor-main" aria-label="楼层平面图">
        <div class="indoor-plan-head"><div class="indoor-plan-title"><i>${icon('layers', 22)}</i><strong id="indoorFloorName"></strong><small id="indoorFloorCount"></small></div>
          <button type="button" class="indoor-zoom" data-indoor-act="zoom" aria-controls="indoorStage" aria-pressed="false" title="放大查看平面图">${icon('expand', 15)}<span>放大</span></button></div>
        <div class="indoor-bar"><div class="indoor-floors" role="tablist" aria-label="楼层">${floors}</div>
          <div class="indoor-ents" role="group" aria-label="进楼入口"><span>入口</span>${doors}</div></div>
        <div id="indoorFloorPanel" role="tabpanel">
          <div id="indoorStage" class="indoor-stage"></div>
          <div id="indoorGuidance" class="indoor-guidance"></div></div>
        <div class="indoor-legend" aria-label="平面图图例">${legend}<span class="k-stair"><i></i>楼梯</span><span class="k-route"><i></i>进楼路线</span></div>
      </section>
      <aside class="indoor-side">
        <div id="indoorRoute"></div>
        <section class="indoor-directory" aria-labelledby="indoorLookup">
          <header><h3 id="indoorLookup">查找房间</h3><span id="indoorCount" role="status"></span></header>
          <label class="indoor-search">${icon('search', 16)}<input type="search" id="indoorSearch" placeholder="搜门牌号或用途，如 6108、讯飞" aria-label="搜索楼内房间" aria-controls="indoorList" autocomplete="off" enterkeyhint="search"></label>
          <div id="indoorList" class="indoor-list"></div>
        </section>
      </aside></div>
      <details class="indoor-source"><summary>图纸来源与楼梯说明</summary><p>${E(b.source)}。${b.caveats.map(E).join('')}</p></details>`;
  }

  function centerPlan(stage) {
    if (!stage.classList.contains('is-detail')) return;
    const target = stage.querySelector('.in-room.sel > rect, .in-dot.mid') || stage.querySelector('.in-shell');
    const item = target.getBoundingClientRect(), frame = stage.getBoundingClientRect();
    stage.scrollLeft += item.left - frame.left + (item.width - stage.clientWidth) / 2;
    stage.scrollTop += item.top - frame.top + (item.height - stage.clientHeight) / 2;
  }

  function draw(b, host) {
    const f = b.floors.find(floor => floor.n === st.floor);
    const rt = st.room ? route(b, st.entrance, st.room) : null;
    const stage = host.querySelector('#indoorStage');
    host.querySelector('#indoorFloorName').textContent = f.name + '平面图';
    host.querySelector('#indoorFloorCount').textContent = f.rooms.length + ' 间';
    host.querySelector('#indoorFloorPanel').setAttribute('aria-labelledby', 'indoorTab' + f.n);
    host.querySelectorAll('.indoor-floors button').forEach(btn => {
      const n = Number(btn.dataset.floor), current = n === f.n;
      btn.classList.toggle('on', current);
      btn.classList.toggle('path', !!rt?.legs[n]);
      btn.setAttribute('aria-selected', String(current));
      btn.tabIndex = current ? 0 : -1;
    });
    host.querySelectorAll('.indoor-ents button').forEach(btn => {
      const selected = btn.dataset.ent === st.entrance;
      btn.classList.toggle('on', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    stage.innerHTML = floorSvg(b, f.n, rt);
    host.querySelector('#indoorGuidance').innerHTML = guidance(f, rt);
    host.querySelector('#indoorRoute').innerHTML = routeHtml(b, rt);
    host.querySelectorAll('.indoor-room').forEach(btn => {
      const selected = btn.dataset.room === st.room;
      btn.classList.toggle('on', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    centerPlan(stage);
  }

  function showPlan(host, selector, reveal) {
    host.querySelector(selector)?.focus({preventScroll: true});
    if (reveal && window.matchMedia('(max-width: 860px)').matches) host.closest('dialog').scrollTop = 0;
  }

  function choose(b, host, roomId, reveal) {
    const r = find(b, roomId);
    if (!r) return;
    st.room = r.id;
    st.floor = r.floor;
    draw(b, host);
    showPlan(host, '.in-room.sel', reveal);
  }

  function chooseFloor(b, host, n, reveal) {
    if (st.floor !== n) {
      st.floor = n;
      draw(b, host);
    }
    showPlan(host, '.indoor-floors .on', reveal);
  }

  function zoomPlan(host, button) {
    const stage = host.querySelector('#indoorStage'), zoom = stage.classList.toggle('is-detail');
    button.setAttribute('aria-pressed', String(zoom));
    button.title = zoom ? '还原完整平面图' : '放大查看平面图';
    button.innerHTML = zoom ? icon('frame', 15) + '<span>全图</span>' : icon('expand', 15) + '<span>放大</span>';
    if (zoom) {
      stage.tabIndex = 0;
      stage.setAttribute('role', 'region');
      stage.setAttribute('aria-label', '放大的平面图，可用方向键或拖动查看');
      centerPlan(stage);
    } else {
      stage.removeAttribute('tabindex');
      stage.removeAttribute('role');
      stage.removeAttribute('aria-label');
      stage.scrollTo(0, 0);
    }
  }

  function allowMousePan(stage) {
    let start = null, dragging = false;
    stage.addEventListener('pointerdown', e => {
      dragging = false;
      if (e.pointerType !== 'mouse' || e.button !== 0 || !stage.classList.contains('is-detail')) return;
      start = {x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop};
    });
    stage.addEventListener('pointermove', e => {
      if (!start || !e.buttons || e.pointerType !== 'mouse') return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 5) return;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-panning');
        dragging = true;
      }
      stage.scrollTo(start.left - dx, start.top - dy);
    });
    const stop = () => { start = null; stage.classList.remove('is-panning'); };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
    stage.addEventListener('pointerleave', () => { if (!dragging) stop(); });
    stage.addEventListener('click', e => {
      if (dragging) { e.stopPropagation(); dragging = false; }
    }, true);
  }

  function bind(b, host) {
    const field = host.querySelector('#indoorSearch');
    function resetSearch() {
      st.q = field.value = '';
      updateDirectory(b, host);
      field.focus();
    }
    allowMousePan(host.querySelector('#indoorStage'));
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-room],[data-floor],[data-ent],[data-indoor-act]');
      if (!t) return;
      if (t.dataset.room) choose(b, host, t.dataset.room, !t.closest('.indoor-stage'));
      else if (t.dataset.floor) chooseFloor(b, host, Number(t.dataset.floor), !!t.closest('.indoor-steps'));
      else if (t.dataset.ent) {
        st.entrance = t.dataset.ent;
        if (!st.room) st.floor = 1;
        draw(b, host);
        if (t.matches('g')) showPlan(host, '.in-ent.on', false);
      } else if (t.dataset.indoorAct === 'zoom') zoomPlan(host, t);
      else if (t.dataset.indoorAct === 'clear') {
        st.room = null;
        draw(b, host);
        resetSearch();
      } else if (t.dataset.indoorAct === 'reset-search') resetSearch();
    });
    field.addEventListener('input', () => {
      st.q = field.value;
      updateDirectory(b, host);
    });
    host.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target, key = e.key;
      if (t.matches('g[data-room], g[data-ent]') && (key === 'Enter' || key === ' ')) {
        e.preventDefault();
        t.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        return;
      }
      if (t.matches('[role="tab"]')) {
        const tabs = [...host.querySelectorAll('[role="tab"]')], i = tabs.indexOf(t);
        const index = {ArrowLeft: (i - 1 + tabs.length) % tabs.length, ArrowRight: (i + 1) % tabs.length, Home: 0, End: tabs.length - 1}[key];
        if (index == null) return;
        e.preventDefault();
        chooseFloor(b, host, Number(tabs[index].dataset.floor), false);
        return;
      }
      if (t !== field && !t.matches('.indoor-room')) return;
      if (key === 'Escape' && st.q) { e.preventDefault(); resetSearch(); return; }
      const results = [...host.querySelectorAll('#indoorList .indoor-room')];
      if (!results.length) return;
      if (t === field && key === 'Enter' && st.q.trim()) {
        e.preventDefault();
        choose(b, host, results[0].dataset.room, true);
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const i = results.indexOf(t), down = key === 'ArrowDown';
        if (i === 0 && !down) field.focus();
        else if (i < 0) results[down ? 0 : results.length - 1].focus();
        else results[Math.min(i + (down ? 1 : -1), results.length - 1)].focus();
      }
    });
  }
  // open the indoor map of a building; o.room selects a room, o.door is the label of the door the outdoor route arrives at
  function open(id, o = {}) {
    const b = data()[id]; if (!b) return false;
    st.id = id; st.q = ''; st.room = o.room && find(b, o.room) ? o.room : null; st.floor = st.room ? find(b, st.room).floor : 1;
    const e = o.entrance ? b.entrances.find(x => x.id === o.entrance) : o.door ? b.entrances.find(x => x.door === o.door) : null; st.entrance = e ? e.id : st.entrance && b.entrances.some(x => x.id === st.entrance) ? st.entrance : b.entrances[0].id;
    const fac = ((window.CAMPUS_FACULTY || {}).units || []).filter(u => u.buildings.some(x => x.place === id)).map(u => u.name);   // 理工学部 for 6 号楼
    dialog(b.title + ' · 楼内导航', '<div class="indoor-host">' + body(b) + '</div>', 'INDOOR NAVIGATION' + (fac.length ? ' · ' + fac.join('、') : ''));
    const modal = document.getElementById('modal'), host = modal.querySelector('.indoor-host');
    modal.classList.add('indoor-open');
    modal.scrollTop = 0;
    modal.addEventListener('close', () => { if (!modal.open) modal.classList.remove('indoor-open'); }, {once: true});
    updateDirectory(b, host);
    bind(b, host);
    draw(b, host);
    return true;
  }
  // rows for the campus search box: rooms of the buildings that have an indoor map
  function search(q) {
    q = (q || '').trim(); if (q.length < 2) return [];
    return Object.values(data()).flatMap(b => matches(b, q).filter(r => r.kind !== 'wc').slice(0, 6).map(r => ({building: b.place, title: b.short, room: r})));
  }
  return {has, open, route, search, state: () => ({...st}), rooms: id => (data()[id] ? rooms(data()[id]) : []), building: id => data()[id] || null};
})();
