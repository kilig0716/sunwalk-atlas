'use strict';

// The CSS cube and the hotspot projection use the same optical centre and field of view.
function mountPanorama(host, scene, onJump, sceneById, options = {}) {
  const radians = Math.PI / 180;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const home = { yaw: scene.hlookat || 0, pitch: scene.vlookat || 0, fov: 72 };
  const minFov = 42, maxFov = 96, idleDelay = 3500, inertiaMs = 155;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calm = options.reduceMotion ?? motion.matches;
  let auto = options.autoRotate ?? !calm;
  let autoChosen = typeof options.autoRotate === 'boolean';
  let yaw = home.yaw, pitch = home.pitch, fov = home.fov, targetFov = fov;
  let velocityX = 0, velocityY = 0, opening = null, lastInput = performance.now();
  let frame = 0, wakeTimer = 0, lastFrame = 0, ready = false, alive = true;
  let visible = true, dirty = true, width = 0, height = 0, hotspotBottom = 0;
  const pointers = new Map();
  const element = (name, className) => {
    const node = document.createElement(name);
    node.className = className;
    return node;
  };
  const camera = element('div', 'vr-camera loading');
  const room = element('div', 'vr-room');
  camera.setAttribute('aria-hidden', 'true');
  camera.append(room);
  const layer = element('div', 'hotspots');
  layer.hidden = true;
  const spots = (scene.links || []).flatMap(link => {
    const destination = sceneById.get(link.id);
    if (!destination) return [];
    const button = element('button', 'hotspot');
    button.type = 'button';
    button.innerHTML = icon('pin', 15);
    button.append(document.createTextNode(destination.name));
    button.setAttribute('aria-label', '前往' + destination.name);
    button.onclick = () => onJump(link.id);
    layer.append(button);
    const altitude = link.atv * radians;
    return [{ button, angle: link.ath * radians, sine: Math.sin(altitude), cosine: Math.cos(altitude), halfWidth: 34 }];
  });
  const dial = element('div', 'vr-dial');
  dial.setAttribute('aria-hidden', 'true');
  dial.innerHTML = '<span class="vr-bearing"><i></i></span><span class="vr-optics">视野 <b>72°</b></span>';
  const needle = dial.querySelector('i'), fovLabel = dial.querySelector('b');
  const loading = element('div', 'vr-loading');
  loading.setAttribute('role', 'status');
  loading.innerHTML = '<i></i><span>正在载入校园全景</span>';
  host.append(camera, layer, dial, loading);
  host.setAttribute('aria-busy', 'true');
  const controls = [...host.querySelectorAll('[data-vr], [data-vrzoom], [data-act="vr-auto"], [data-act="vr-reset"]')];
  const footer = host.querySelector('.pano-bottom');

  function syncControls() {
    for (const button of controls) {
      const zoom = Number(button.dataset.vrzoom || 0);
      button.disabled = !ready || (zoom < 0 && targetFov <= minFov) || (zoom > 0 && targetFov >= maxFov);
      if (button.dataset.act === 'vr-auto') {
        button.setAttribute('aria-pressed', String(auto));
        button.title = auto ? '关闭自动环视' : '开启自动环视';
      }
    }
  }

  function measure() {
    width = host.clientWidth;
    height = host.clientHeight;
    hotspotBottom = footer ? footer.offsetTop - 18 : height - 58;
    dirty = true;
    requestTick();
  }

  function draw() {
    if (!width || !height) return;
    const focal = height / (2 * Math.tan(fov * radians / 2));
    camera.style.perspective = focal + 'px';
    room.style.transform = 'translateZ(' + focal + 'px) rotateX(' + -pitch + 'deg) rotateY(' + yaw + 'deg)';
    needle.style.transform = 'rotate(' + (yaw - home.yaw) + 'deg)';
    const field = Math.round(fov) + '°';
    if (fovLabel.textContent !== field) fovLabel.textContent = field;
    const sinPitch = Math.sin(pitch * radians), cosPitch = Math.cos(pitch * radians);
    for (const spot of spots) {
      const angle = spot.angle - yaw * radians;
      const z = Math.cos(angle) * spot.cosine;
      const forward = z * cosPitch + spot.sine * sinPitch;
      let show = false;
      if (forward > .04) {
        const x = width / 2 + focal * Math.sin(angle) * spot.cosine / forward;
        const y = height / 2 + focal * (spot.sine * cosPitch - z * sinPitch) / forward;
        show = x >= spot.halfWidth + 4 && x <= width - spot.halfWidth - 4 && y > 50 && y < hotspotBottom;
        if (show) {
          spot.button.style.left = x.toFixed(1) + 'px';
          spot.button.style.top = y.toFixed(1) + 'px';
        }
      }
      spot.button.hidden = !show;
    }
  }

  function canRun() {
    return alive && ready && visible && !document.hidden;
  }
  function requestTick() {
    if (canRun() && !frame) frame = requestAnimationFrame(tick);
  }
  function stopClock() {
    cancelAnimationFrame(frame);
    clearTimeout(wakeTimer);
    frame = wakeTimer = lastFrame = 0;
  }
  function touch(now = performance.now()) {
    lastInput = now;
    opening = null;
    clearTimeout(wakeTimer);
    wakeTimer = 0;
  }
  function shift(dx, dy) {
    yaw = (yaw + dx) % 360;
    pitch = clamp(pitch + dy, -85, 85);
    dirty = true;
  }
  function tick(now) {
    frame = 0;
    if (!canRun()) return;
    const dt = lastFrame ? clamp(now - lastFrame, 0, 50) : 1000 / 60;
    lastFrame = now;
    let moving = false;
    if (opening !== null) {
      const remaining = Math.pow(1 - clamp((now - opening) / 680, 0, 1), 3);
      yaw = home.yaw - 9 * remaining;
      fov = targetFov = home.fov + 7 * remaining;
      dirty = true;
      if (remaining > 0) moving = true;
      else opening = null;
    } else {
      if (!pointers.size && (Math.abs(velocityX) > .0008 || Math.abs(velocityY) > .0008)) {
        const decay = Math.exp(-dt / inertiaMs);
        const distance = inertiaMs * (1 - decay);
        shift(velocityX * distance, velocityY * distance);
        velocityX *= decay;
        velocityY *= decay;
        moving = true;
      }
      if (fov !== targetFov) {
        const difference = targetFov - fov;
        fov = calm || Math.abs(difference) < .05 ? targetFov : fov + difference * (1 - Math.exp(-dt / 82));
        dirty = true;
        moving ||= fov !== targetFov;
      }
    }
    // A focused hotspot stays still while a keyboard user decides whether to follow it.
    const mayRotate = auto && !pointers.size && !layer.contains(document.activeElement);
    const idleLeft = idleDelay - (now - lastInput);
    if (mayRotate && idleLeft <= 0 && opening === null) {
      shift(dt * .0022, 0);
      moving = true;
    }
    if (dirty) {
      draw();
      dirty = false;
    }
    if (moving) requestTick();
    else {
      lastFrame = 0;
      if (mayRotate && !wakeTimer && idleLeft > 0) {
        wakeTimer = setTimeout(() => { wakeTimer = 0; requestTick(); }, idleLeft);
      }
    }
  }

  function turn(dx, dy) {
    if (!ready) return;
    touch();
    if (calm) shift(dx, dy);
    else {
      velocityX += dx / inertiaMs;
      velocityY += dy / inertiaMs;
    }
    requestTick();
  }
  function zoomTo(value, immediate = false) {
    if (!ready) return;
    touch();
    targetFov = clamp(value, minFov, maxFov);
    if (calm || immediate) fov = targetFov;
    dirty = true;
    syncControls();
    requestTick();
  }
  function zoomBy(delta) { zoomTo(targetFov + delta); }
  function reset() {
    if (!ready) return;
    touch();
    velocityX = velocityY = 0;
    yaw = home.yaw;
    pitch = home.pitch;
    zoomTo(home.fov);
  }
  function toggleAuto() {
    autoChosen = true;
    auto = !auto;
    touch();
    if (auto) lastInput -= idleDelay;
    syncControls();
    requestTick();
    return auto;
  }

  camera.onpointerdown = event => {
    if (!ready || event.button !== 0 || pointers.size >= 2) return;
    touch();
    velocityX = velocityY = 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
    camera.setPointerCapture(event.pointerId);
    host.focus({ preventScroll: true });
  };
  camera.onpointermove = event => {
    const prior = pointers.get(event.pointerId);
    if (!prior) return;
    const now = performance.now();
    const next = { x: event.clientX, y: event.clientY, time: now };
    pointers.set(event.pointerId, next);
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
      const before = Math.hypot(prior.x - other.x, prior.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 5 && after > 5) zoomTo(2 * Math.atan(Math.tan(fov * radians / 2) * before / after) / radians, true);
      return;
    }
    touch(now);
    const scale = fov / Math.max(180, height);
    const dx = (prior.x - next.x) * scale, dy = (prior.y - next.y) * scale;
    shift(dx, dy);
    if (!calm) {
      const elapsed = Math.max(8, now - prior.time);
      velocityX = clamp(.5 * dx / elapsed + .5 * velocityX, -.16, .16);
      velocityY = clamp(.5 * dy / elapsed + .5 * velocityY, -.13, .13);
    }
    requestTick();
  };
  function release(event) {
    const prior = pointers.get(event.pointerId);
    if (!prior) return;
    const now = performance.now();
    pointers.delete(event.pointerId);
    if (event.type === 'pointercancel' || now - prior.time > 100 || pointers.size) velocityX = velocityY = 0;
    // Rebase the remaining finger after a pinch so a drag can continue without jumping.
    for (const pointer of pointers.values()) pointer.time = now;
    touch(now);
    requestTick();
  }
  camera.onpointerup = camera.onpointercancel = camera.onlostpointercapture = release;
  camera.addEventListener('wheel', event => {
    if (!ready || !event.deltaY) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    zoomBy(clamp(event.deltaY * unit * .075, -15, 15));
  }, { passive: false });
  camera.ondblclick = () => zoomBy(targetFov > 56 ? -18 : 30);
  layer.onfocusin = layer.onfocusout = () => { touch(); requestTick(); };

  function visibilityChanged() {
    stopClock();
    if (!canRun()) {
      velocityX = velocityY = 0;
      pointers.clear();
      return;
    }
    lastInput = performance.now();
    dirty = true;
    requestTick();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  const intersection = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    if (visible !== entry.isIntersecting) {
      visible = entry.isIntersecting;
      visibilityChanged();
    }
  }) : null;
  intersection?.observe(host);
  const resize = new ResizeObserver(measure);
  resize.observe(host);
  if (footer) resize.observe(footer);
  function motionChanged(event) {
    calm = event.matches;
    if (!autoChosen) auto = !calm;
    if (calm) {
      velocityX = velocityY = 0;
      if (opening !== null) {
        yaw = home.yaw;
        targetFov = home.fov;
      }
      fov = targetFov;
    }
    touch();
    dirty = true;
    syncControls();
    requestTick();
  }
  motion.addEventListener('change', motionChanged);
  function destroy() {
    if (!alive) return;
    alive = ready = false;
    stopClock();
    resize.disconnect();
    intersection?.disconnect();
    motion.removeEventListener('change', motionChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
    host.removeAttribute('aria-busy');
    camera.remove();
    layer.remove();
    dial.remove();
    loading.remove();
  }

  syncControls();
  measure();
  const rotations = { f: 'rotateY(0deg)', r: 'rotateY(-90deg)', b: 'rotateY(180deg)', l: 'rotateY(90deg)', u: 'rotateX(-90deg)', d: 'rotateX(90deg)' };
  let pending = 6;
  for (const [face, rotation] of Object.entries(rotations)) {
    const image = new Image();
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.style.cssText = 'position:absolute;top:-512px;left:-512px;width:1024.8px;height:1024.8px;backface-visibility:hidden;';
    image.style.transform = rotation + ' translateZ(-512px)';
    image.onload = () => {
      if (!alive || --pending) return;
      ready = true;
      lastInput = performance.now();
      if (!calm) opening = lastInput;
      layer.hidden = false;
      for (const spot of spots) spot.halfWidth = spot.button.offsetWidth / 2;
      measure();
      draw();
      camera.classList.remove('loading');
      loading.remove();
      host.setAttribute('aria-busy', 'false');
      syncControls();
    };
    image.onerror = () => {
      if (!alive) return;
      destroy();
      host.dataset.failed = 'true';
      options.onError?.();
    };
    room.append(image);
    image.src = 'assets/' + scene.cube.replace('{face}', face);
  }
  return { turn, zoom: zoomBy, reset, toggleAuto, get auto() { return auto; }, destroy };
}
