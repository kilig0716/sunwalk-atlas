"""Browser regression for 向阳而行 (Python + Playwright, uses the installed Microsoft Edge).

    pip install playwright        # once; no browser download needed, Edge is used
    python serve.py               # in another window, or set SUNWALK_URL
    python verify_browser.py

Checks the weekday access rules, skybridge isolation, the west-gate-only ground entry, an
independent Dijkstra oracle, shade data completeness, panorama links, and the main UI flows on a
desktop and a phone viewport. Exit code 1 on any failure.
"""
import os, sys, json, math
from playwright.sync_api import sync_playwright

URL = os.environ.get('SUNWALK_URL', 'http://127.0.0.1:8890/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '界面示例')
failed = []

def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (('  ' + str(detail)) if detail and not ok else ''))
    if not ok: failed.append(name)

def no_weather(target, summer=True, flat=True):
    """Keep the live forecast out of the checks written for a clear sky; the weather checks inject their own.
    The older checks were also written for the 1 September sun, so they pin the summer scenario."""
    if summer: target.add_init_script("window.SUNWALK_SUN='summer'")
    # ...and for the flat map; the 3D checks open their own pages
    if flat: target.add_init_script("window.SUNWALK_VIEW='2d'")
    target.route('**/api/weather', lambda r: r.fulfill(status=200, content_type='application/json', body='{"off":true}'))
    target.route('**/assets/weather-snapshot.js*', lambda r: r.fulfill(status=200, content_type='application/javascript', body='window.WEATHER_SNAPSHOT=null;'))

# a 24-hour forecast starting at the next full hour, built in the page so it is always current
MK_WX = """() => { window.mkWx = (codes, temp, nowText) => { const H = 36e5, t0 = Math.floor(Date.now() / H) * H + H, names = {'00':'晴','01':'多云','02':'阴','07':'小雨','14':'小雪'};
  return {place: '长安区太乙宫街道', source: 'test', page: '', fetchedAt: Date.now() + Math.random(), now: {time: '12:00', text: nowText, temp, humidity: 50, wind: '南风 1级', hi: temp + 3, lo: temp - 5},
    hours: Array.from({length: 24}, (_, i) => { const t = t0 + i * H, code = codes[i % codes.length]; return {t, hour: new Date(t + 288e5).getUTCHours(), code, night: false, text: names[code], temp, windD: '南风', windL: '不到3级'}; })}; }; }"""

ROUTING_SUITE = r"""
(() => {
 const g = window.CAMPUS_ATLAS, R = Routing, out = {};
 const plan = (a,b,o,h=12,d=.2) => R.plan(g,a,b,h,d,o);
 out.outsideRefused = [1,2,4].every(day => !!plan('east-16','west-17',{day,mode:'outside'}).error);
 out.openDaysWestGate = [3,5,6,7].every(day => { const r = plan('east-16','west-17',{day,mode:'outside'});
   return !r.error && r.choices.every(p => p.edges.some(e=>e.role==='outside') && p.ids.includes(g.access['west-gate']) && !p.edges.some(e=>e.role==='skybridge')); });
 out.closedDaysSkybridge = [1,2,4].every(day => { const r = plan('east-16','west-17',{day,mode:'auto'});
   return !r.error && r.choices.every(p => p.edges.some(e=>e.role==='skybridge') && !p.edges.some(e=>['outside','gate'].includes(e.role))); });
 const sky = new Set(g.edges.filter(e=>e.role==='skybridge').flatMap(e=>[e.a,e.b]));
 out.skyIsolated = sky.size>0 && g.edges.filter(e=>e.role==='outside').every(e=>!sky.has(e.a)&&!sky.has(e.b));
 const gateEdges = g.edges.filter(e=>e.role==='gate');
 const westEntries = gateEdges.filter(e=>Math.min(g.nodes[e.a][0],g.nodes[e.b][0])<1065);
 out.westOnlyGate = westEntries.length===1 && [westEntries[0].a,westEntries[0].b].includes(g.access['west-gate']);
 const closedSky = {...g, edges:g.edges.map(e=>({...e,closed:e.role==='skybridge'}))};
 out.noSkyMonday = !!R.plan(closedSky,'east-16','west-17',12,.2,{day:1,mode:'auto'}).error;
 const shut = {...g, edges:g.edges.map(e=>({...e,closed:e.role==='gate'&&[e.a,e.b].includes(g.access['west-gate'])}))};
 out.noGateNoOutside = !!R.plan(shut,'east-16','west-17',12,.2,{day:3,mode:'outside'}).error;
 out.badInput = [0,8,NaN,1.5].every(day=>!!plan('east-16','west-17',{day}).error) && !!plan('east-16','west-17',{day:3,mode:'x'}).error;
 // every dorm, every day, every mode
 let cases=0, bad=[];
 for (let day=1; day<=7; day++) for (const mode of ['auto','inside','outside']) for (const dest of g.places.filter(p=>p.category==='宿舍')) {
   const start = dest.zone==='东区' ? 'west-17' : 'east-16', r = R.plan(g,start,dest.id,12,.4,{day,mode});
   if (mode==='outside' && [1,2,4].includes(day)) { if(!r.error) bad.push([day,mode,dest.id,'should refuse']); continue; }
   if (r.error) { bad.push([day,mode,dest.id,r.error]); continue; }
   for (const p of r.choices) { const s=p.edges.some(e=>e.role==='skybridge'), o=p.edges.some(e=>['outside','gate'].includes(e.role));
     if ((s&&o) || !(s||o) || p.meters>r.baseline*1.4+.001) bad.push([day,mode,dest.id,'mix']);
     if (([1,2,4].includes(day)||mode==='inside') && !(s&&!o)) bad.push([day,mode,dest.id,'inside rule']);
     if (mode==='outside' && !(o&&!s&&p.ids.includes(g.access['west-gate']))) bad.push([day,mode,dest.id,'gate rule']); }
   cases++; }
 out.dormCases = cases; out.dormBad = bad.slice(0,5);
 // all pairs reachable inside campus on a closed day
 const ids = g.places.map(p=>p.id); let pairs=0, unreachable=[];
 for (const a of ids) for (const b of ids) { if (a===b) continue; const r=R.plan(g,a,b,12,0,{day:1,mode:'auto'}); pairs++; if (r.error) unreachable.push(a+'→'+b); }
 out.pairs = pairs; out.unreachable = unreachable.slice(0,8); out.unreachableCount = unreachable.length;
 // independent oracle
 function oracle(start,end,policy,from,to){ const d=new Map(Object.keys(g.nodes).map(id=>[id,Infinity])),rem=new Set(d.keys());d.set(start,0);
   // a building's door links are open only for the two buildings the trip starts and ends in
   const edges=g.edges.filter(e=>!e.closed&&(!e.door||e.door===from||e.door===to)&&(policy==='inside'?!['outside','gate'].includes(e.role):e.role!=='skybridge'));
   while(rem.size){let u=null;for(const id of rem)if(u===null||d.get(id)<d.get(u))u=id;if(!Number.isFinite(d.get(u))||u===end)break;rem.delete(u);
     for(const e of edges){const v=e.a===u?e.b:e.b===u?e.a:null;if(v!==null&&rem.has(v))d.set(v,Math.min(d.get(v),d.get(u)+e.meters));}} return d.get(end); }
 let oracleBad=[];
 for (const a of ['east-16','guest','library','w-yibo','west-17','e-bridge-an','w-pingpong']) for (const b of g.places) { if (a===b.id) continue;
   const exp=Math.min(oracle(g.access[a],g.access[b.id],'inside',a,b.id),oracle(g.access[a],g.access[b.id],'outside',a,b.id));
   const act=R.plan(g,a,b.id,12,0,{day:3,mode:'auto'}); if (act.baseline!==exp || !act.choices.every(p=>p.meters===exp)) oracleBad.push(a+'→'+b.id); }
 out.oracleBad = oracleBad.slice(0,5);
 // shade data
 out.shadeComplete = g.edges.every(e => Array.isArray(e.shade) && e.shade.length===g.shadeModel.hours.length && e.shade.every(v=>v>=0&&v<=1) && e.shadeSrc);
 out.skyNoTrees = g.edges.filter(e=>e.role==='skybridge').every(e=>e.shadeSrc.tree.every(v=>v===0));
 out.panoramas = (g.panoramas||[]).length;
 const sceneIds = new Set(window.CAMPUS_TOUR.scenes.map(s=>s.id));
 out.panoLinked = (g.panoramas||[]).every(p=>sceneIds.has(p.id));
 out.timeMatters = g.edges.some(e=>e.shade[0]!==e.shade[1]);
 // names corrected from the plan + 720 云
 const names = new Set(g.edges.map(e=>e.name)), pn = new Set(g.places.map(p=>p.name));
 out.names = {萌:names.has('诒萌路'), 荫:names.has('诒荫路'), 俭:pn.has('诒俭餐厅'), 伦:pn.has('诒伦餐厅'), 乒乓:pn.has('乒乓球场'), 华:pn.has('诒华广场'), 鸣:pn.has('诒鸣广场')};
 const guest = g.places.find(p=>p.id==='guest');
 out.guestRight = guest.access[0] > Math.max(...guest.footprint.map(v=>v[0])) && /右侧/.test(guest.approach);
 return out;
})()
"""

def verify_showcase(browser):
    page = browser.new_page(viewport={'width': 1200, 'height': 820}, reduced_motion='reduce', locale='zh-CN')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    no_weather(page)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_selector('.campus-cover')
    page.click('[data-cover="3"]')
    check('全景封面的取景点、照片与打开入口一致',
          page.get_attribute('.cover-open', 'data-scene') == '15468039'
          and page.get_attribute('.cover-image', 'src').endswith('library-plaza.webp'))
    page.click('.cover-open')
    page.wait_for_selector('.vr-camera:not(.loading)')
    page.focus('#panoStage')
    page.keyboard.press('+')
    page.wait_for_function("parseInt(document.querySelector('.vr-optics b').textContent) < 72")
    page.keyboard.press('Home')
    page.wait_for_function("document.querySelector('.vr-optics b').textContent === '72°'")
    check('全景支持键盘缩放与复位，减少动态效果时静止启动',
          page.get_attribute('[data-act="vr-auto"]', 'aria-pressed') == 'false')

    missing_face = '**/cube/east/r.webp'
    page.route(missing_face, lambda route: route.abort())
    page.click('#sceneList [data-scene="15468024"]')
    page.wait_for_selector('[data-act="pano-retry"]')
    check('全景面图读取失败时展示本地照片与重试入口',
          page.locator('.scene-img').is_visible() and page.locator('.vr-camera').count() == 0)
    page.unroute(missing_face)
    page.click('[data-act="pano-retry"]')
    page.wait_for_selector('.vr-camera:not(.loading)')
    check('重试全景恢复环视', page.locator('[data-act="vr-reset"]').is_enabled())
    page.click('#panoView [data-act="full"]')
    page.wait_for_function("document.fullscreenElement === document.getElementById('panoView')")
    page.click('#panoView .nav-next [data-scene="15468039"]')
    page.wait_for_selector('.vr-camera:not(.loading)')
    check('全屏中沿相邻场景换站仍保持全屏',
          page.evaluate("state.scene === 15468039 && document.fullscreenElement === document.getElementById('panoView')"))
    page.click('#panoView [data-act="full"]')
    page.wait_for_function('!document.fullscreenElement')

    page.click('#nav [data-tab="explore"]')
    page.click('#mapFocusBtn')
    check('专注视图扩展地图且保留退出按钮',
          not page.locator('#sidebar').is_visible() and page.locator('#mapFocusBtn').is_visible()
          and page.locator('#stage').bounding_box()['width'] >= 1198)
    page.keyboard.press('Escape')
    check('Escape 恢复侧栏与键盘焦点',
          page.locator('#sidebar').is_visible() and page.evaluate("document.activeElement.id === 'mapFocusBtn'"))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.fill('#placeSearch', '6A33')
    page.press('#placeSearch', 'Enter')
    page.wait_for_selector('dialog.indoor-open[open]')
    stage = page.locator('#indoorStage')
    fits = stage.evaluate('e => e.scrollWidth <= e.clientWidth + 2')
    page.click('[data-indoor-act="zoom"]')
    check('手机搜索教室后直达正确楼层，平面图可从全图放大',
          page.evaluate("Indoor.state().room === '6A33' && Indoor.state().floor === 3")
          and fits and stage.evaluate('e => e.scrollWidth > e.clientWidth'))
    page.press('.indoor-floors [aria-selected="true"]', 'ArrowRight')
    check('楼层标签可用方向键切换', page.evaluate('Indoor.state().floor === 2'))
    page.keyboard.press('Escape')

    page.click('#nav [data-tab="route"]')
    page.click('#mapCard [data-act="route-play"]')
    page.wait_for_function('state.step >= 1', timeout=7500)
    page.click('#mapCard [data-act="route-play"]')
    paused_step = page.evaluate('state.step')
    page.wait_for_timeout(4100)
    check('自动演示按段推进，暂停后停留在当前路段',
          page.evaluate('state.step') == paused_step
          and page.get_attribute('#mapCard [data-act="route-play"]', 'aria-pressed') == 'false')
    page.click('#mapCard [data-act="next-step"]')
    check('手动切换继续更新路线进度', page.evaluate('state.step') == paused_step + 1)
    next_step = page.locator('#mapCard [data-act="next-step"]')
    total = page.evaluate('Directory.steps(currentPlan.choices[state.choice],atlas.nodes).length')
    for _ in range(total - paused_step - 2):
        next_step.click()
    page.click('#mapCard [data-act="route-play"]')
    page.wait_for_function('routeDemoTimer === null', timeout=7500)
    check('演示抵达终点后自动停止并可重新播放',
          page.evaluate('state.step') == total and '重新演示' in page.inner_text('#mapCard [data-act="route-play"]'))
    page.click('#mapCard [data-act="route-play"]')
    page.click('#nav [data-tab="explore"]')
    check('离开路线后清理播放状态', page.evaluate('routeDemoTimer === null'))

    page.emulate_media(reduced_motion='no-preference')
    page.click('#dim3dBtn')
    page.wait_for_function('switching')
    page.click('#zoomIn')
    page.click('#dim2dBtn')
    page.wait_for_function("document.body.dataset.dim === '2d' && !switching")
    check('2D / 3D 切换中缩放后仍可切回平面图',
          page.get_attribute('#dim2dBtn', 'aria-pressed') == 'true' and page.locator('#mapScale b').inner_text() != '')
    check('新增交互无脚本错误', not errors, errors)
    page.close()

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])   # WebGL2 for the 3D checks
    page = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(page)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '#explore', wait_until='networkidle')
    r = page.evaluate(ROUTING_SUITE)
    check('周一/二/四拒绝校外方式', r['outsideRefused'])
    check('周三/五/六/日校外路线必经西区正门且不含天渡', r['openDaysWestGate'])
    check('周一/二/四跨区只走天渡', r['closedDaysSkybridge'])
    check('天渡与校外街道无共用节点', r['skyIsolated'])
    check('西区地面入口只有西区正门', r['westOnlyGate'])
    check('天渡关闭时周一不能跨区', r['noSkyMonday'])
    check('正门关闭时不能经校外进西区', r['noGateNoOutside'])
    check('无效星期/方式被拒绝', r['badInput'])
    check(f"七天×三方式×全部宿舍路线合法（{r['dormCases']} 例）", not r['dormBad'], r['dormBad'])
    check(f"周一全部 {r['pairs']} 组起终点可达", r['unreachableCount'] == 0, r['unreachable'])
    check('最短路与独立 Dijkstra 一致', not r['oracleBad'], r['oracleBad'])
    check('每段路都有三时段遮阴与依据', r['shadeComplete'])
    check('天渡上不计树荫', r['skyNoTrees'])
    check(f"实景测点 {r['panoramas']} 个且都能打开对应场景", r['panoramas'] >= 30 and r['panoLinked'])
    check('遮阴随时间变化', r['timeMatters'])
    check('名称校正：诒萌路/诒俭餐厅/乒乓球场/诒华广场/诒鸣广场', r['names']['萌'] and not r['names']['荫'] and r['names']['俭'] and not r['names']['伦'] and r['names']['乒乓'] and r['names']['华'] and r['names']['鸣'], r['names'])
    check('宾馆接近点在建筑右侧', r['guestRight'])

    # ---- UI flows (desktop) ----
    reqs = []; page.on('request', lambda q: reqs.append(q.url))
    page.click('[data-act="shade-layer"]')
    page.wait_for_timeout(400)
    check('林荫图层显示线段与测点', page.locator('#shadeOverlay line').count() > 300 and page.locator('.pano-pin').count() >= 30)
    page.locator('.pano-pin').first.click()
    page.wait_for_timeout(600)
    check('点击测点进入全景', page.evaluate("document.body.dataset.tab") == 'pano')
    page.goto(URL + '#route', wait_until='networkidle')
    page.select_option('#startPlace', 'east-16'); page.select_option('#endPlace', 'west-17')
    page.select_option('#travelDay', '1'); page.wait_for_timeout(300)
    check('周一路线卡显示经天渡', '天渡' in page.inner_text('#routeResults'))
    page.select_option('#travelMode', 'outside'); page.wait_for_timeout(300)
    check('周一选校外被拒绝并提示', '禁止出校' in page.inner_text('#routeResults'))
    page.select_option('#travelDay', '3'); page.wait_for_timeout(300)
    check('周三校外路线可用', '校外' in page.inner_text('#routeResults') and '禁止' not in page.inner_text('#routeResults'))
    os.makedirs(SHOTS, exist_ok=True)
    page.screenshot(path=os.path.join(SHOTS, '周三校外经西区正门.png'))
    page.select_option('#travelMode', 'auto'); page.select_option('#travelDay', '1'); page.wait_for_timeout(300)
    page.click('[data-act="segments"]'); page.wait_for_timeout(300)
    check('路段依据显示林荫/楼荫与实景来源', '林荫' in page.inner_text('#modalContent') and '720 云' in page.inner_text('#modalContent'))
    page.keyboard.press('Escape')
    page.click('[data-act="begin-steps"]'); page.wait_for_timeout(300)
    check('分步导览显示本段遮阴', '遮阴' in page.inner_text('#mapCard'))
    page.screenshot(path=os.path.join(SHOTS, '周一经天渡_分步导览.png'))
    page.goto(URL + '#explore', wait_until='networkidle')
    page.click('[data-act="shade-layer"]'); page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(SHOTS, '林荫分布与实景测点.png'))
    page.goto(URL + '#pano', wait_until='networkidle')
    check('全景页说明本地素材包', '本地素材包' in page.inner_text('#sidebar') and page.locator('[data-act="pano-help"]').count() >= 1)
    check('桌面端无脚本错误', not errors, errors)

    # ---- V0.1：高德图层移除、校外场景、全景索引 ----
    page.goto(URL + '#explore', wait_until='networkidle')
    r2 = page.evaluate("""(() => { const g = window.CAMPUS_ATLAS, S = window.SCENE_INDEX, img = document.querySelector('.base-map');
      return {amapBtn: !!document.getElementById('amapBtn'), provider: typeof window.Provider, amapText: document.body.innerText.includes('高德地图'),
        amapReq: performance.getEntriesByType('resource').filter(e => /amap|autonavi/.test(e.name)).length,
        extent: g.extent, imgLeft: parseFloat(img.style.left), outside: (g.surroundings || {}).pois,
        total: S.counts.total, located: S.counts.located, placesWithScenes: S.counts.places, tours: S.tours.length,
        allScenesIndexed: window.CAMPUS_TOUR.scenes.every(s => S.scenes[s.id]),
        placeIdsValid: Object.values(S.scenes).every(r => !r.p || g.places.some(p => p.id === r.p)),
        gateAlias: g.places.filter(p => Directory.matches(p, '北大门')).map(p => p.id),
        sceneSearch: g.places.filter(p => Directory.matches(p, '日语厅')).map(p => p.id), scale: g.shadeModel.scale}; })()""")
    check('界面不再出现高德地图（无按钮、无脚本、无请求）', not r2['amapBtn'] and r2['provider'] == 'undefined' and not r2['amapText'] and r2['amapReq'] == 0, r2)
    check('详图带校外场景边距', r2['extent'] and r2['extent']['x'] < 0 and r2['imgLeft'] < 0 and r2['outside'] >= 20, r2)
    check('140 个全景全部编入索引且地点有效', r2['total'] == 140 and r2['allScenesIndexed'] and r2['placeIdsValid'] and r2['located'] >= 130, r2)
    check('高德门名可搜索（北大门→东区北门）', r2['gateAlias'] == ['gate'], r2['gateAlias'])
    check('楼内场景名可搜到楼栋（日语厅→图书馆）', r2['sceneSearch'] == ['library'], r2['sceneSearch'])
    page.click('[data-act="pano-layer"]'); page.wait_for_timeout(300)
    check('实景图层显示室外场景与楼内全景数', page.locator('.pano-pin').count() >= 30 and page.locator('.pano-pin.indoor').count() >= 8)
    page.evaluate("pickPlace('library')"); page.wait_for_timeout(300)
    check('地点卡显示相关全景', '相关全景' in page.inner_text('#mapCard'))
    page.click('#mapCard [data-place-scenes]'); page.wait_for_timeout(600)
    check('进入该楼全景列表并显示位置与相邻场景', page.evaluate("document.body.dataset.tab") == 'pano' and '东区图书馆' in page.inner_text('.pano-nav') and page.locator('.pano-nav .nav-next button').count() >= 1)
    page.click('.pano-nav [data-act="scene-locate"]'); page.wait_for_timeout(500)
    check('全景可回到地图定位', page.evaluate("document.body.dataset.tab") == 'explore' and page.evaluate("state.selected") == 'library')
    page.goto(URL + '#pano', wait_until='networkidle')
    page.click('[data-tour="0"]'); page.wait_for_timeout(500)
    check('实景游线逐站导航', '1 / ' in page.inner_text('.pano-nav'))
    page.click('.nav-tour button:last-child'); page.wait_for_timeout(500)
    check('游线下一站', '2 / ' in page.inner_text('.pano-nav'))
    page.click('[data-act="tour-map"]'); page.wait_for_timeout(600)
    check('游线可在地图上显示', page.locator('.pano-pin.stop').count() >= 5 and page.locator('#pathOverlay polyline').count() == 3)
    page.screenshot(path=os.path.join(SHOTS, '实景游线_东区主轴线.png'))
    page.goto(URL + '#explore', wait_until='networkidle'); page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, '校园详图_含校外场景.png'))
    check('新增功能无脚本错误', not errors, errors)

    # ---- V0.2：全景只读本地、不连 720 云；动效 ----
    page.goto(URL + '#pano', wait_until='networkidle')
    r3 = page.evaluate("""(() => { const T = window.CAMPUS_TOUR, txt = JSON.stringify(T);
      return {urls: /https?:|720yun|720static/.test(txt), cubes: T.scenes.filter(s => s.cube).length, photos: T.scenes.filter(s => s.photo).length,
        missing: T.scenes.filter(s => !s.cube && !s.photo).map(s => s.id), links: [...document.querySelectorAll('a[href]')].filter(a => /720/.test(a.href)).length}; })()""")
    check('场景数据不含任何网址', not r3['urls'], r3['urls'])
    page.evaluate('chooseScene(15468024)'); page.wait_for_timeout(400)
    check('自带全景可环视：有视角盘、缩放与自动环视按钮', page.locator('.vr-camera').count() == 1 and page.locator('.vr-dial').count() == 1 and page.locator('[data-vrzoom]').count() == 2 and page.locator('[data-act="vr-auto"]').count() == 1)
    page.wait_for_timeout(1500)
    y0 = page.evaluate("document.querySelector('.vr-room').style.transform")
    page.click('[data-vr="1"]'); page.wait_for_timeout(700)
    check('全景按钮转动带惯性', page.evaluate("document.querySelector('.vr-room').style.transform") != y0)
    pre720 = len(reqs)
    if r3['missing']:
        page.evaluate(f"chooseScene({r3['missing'][0]})"); page.wait_for_timeout(700)
        check('没有本地照片的场景引用 720 云原作', page.locator('#panoView iframe[src*="720yun.com/vr/a2bjzOkfrk4?s="]').count() == 1 and page.locator('.external-pano .pano-nav').count() == 1)
        page.click('[data-act="pano-local"]'); page.wait_for_timeout(700)
        check('可切换为拍摄位置卡', page.locator('.pano-stage.locator .loc-map img').count() == 1 and '本地素材包' in page.inner_text('.pano-title') and page.locator('#panoView iframe').count() == 0)
        page.screenshot(path=os.path.join(SHOTS, '全景_拍摄位置卡.png'))
        page.click('.pano-top [data-act="pano-help"]'); page.wait_for_timeout(400)
        local_only = len(reqs)
        check('补充照片说明可打开', 'import_panoramas.py' in page.inner_text('#modalContent'))
        page.keyboard.press('Escape')
    page.evaluate('chooseScene(15468024)'); page.wait_for_timeout(600); n720 = sum('720' in u.split('/')[2] for u in reqs)
    page.evaluate('chooseScene(15468039)'); page.wait_for_timeout(1500)
    check('有本地照片的场景只读本地：无内嵌页、不向 720 云发请求', page.locator('#panoView iframe').count() == 0 and page.locator('.vr-camera').count() == 1 and sum('720' in u.split('/')[2] for u in reqs) == n720)
    page.evaluate('chooseScene(15468040)'); page.wait_for_timeout(500)
    ok_still = page.locator('.pano-stage.still').count() == 1 and page.locator('#panoView iframe').count() == 0
    page.click('.pano-controls [data-act="pano-online"]'); page.wait_for_timeout(600)
    ok_online = page.locator('#panoView iframe[src*="s=15468040"]').count() == 1
    page.click('[data-act="pano-local"]'); page.wait_for_timeout(500)
    check('照片场景默认看本地照片，可进入在线全景再返回', ok_still and ok_online and page.locator('.pano-stage.still').count() == 1)
    page.goto(URL + '#route', wait_until='networkidle')
    page.select_option('#startPlace', 'gate'); page.select_option('#endPlace', 'west-17'); page.wait_for_timeout(1300)
    check('路线有方向流动线和行走点', page.locator('#pathOverlay .route-flow').count() == 1 and page.locator('#pathOverlay .route-walker animateMotion').count() == 1)
    check('路线页显示太阳方位', page.evaluate("!document.getElementById('sunDot').hidden && /太阳在/.test(document.getElementById('sunDot').title)"))
    page.screenshot(path=os.path.join(SHOTS, '路线_流动线与太阳方位.png'))
    page.goto(URL + '#explore', wait_until='networkidle'); page.wait_for_timeout(300)
    k0 = page.evaluate("view.scale"); page.click('#zoomIn'); page.wait_for_timeout(80)
    k1 = page.evaluate("view.scale"); page.wait_for_timeout(500); k2 = page.evaluate("view.scale")
    check('地图缩放有镜头缓动并停在目标', k0 < k1 < k2 and abs(k2 / k0 - 1.45) < .02, [k0, k1, k2])
    page.evaluate("pickPlace('library')"); page.wait_for_timeout(700)
    check('选中地点后镜头飞到该处', page.evaluate("(() => { const p = places.get('library'), v = document.getElementById('mapViewport'); return Math.abs(p.x * view.scale + view.x - v.clientWidth / 2) < 3; })()"))
    page.goto(URL + '#explore', wait_until='networkidle'); page.wait_for_timeout(400)
    page.evaluate("window.__drag = 0; document.addEventListener('dragstart', e => { if (!e.defaultPrevented) window.__drag++; })")
    page.evaluate('fit()'); page.wait_for_timeout(700)
    fp = page.evaluate("(() => { const r = document.getElementById('mapViewport').getBoundingClientRect(); for (let y = r.top + 200; y < r.bottom - 220; y += 12) for (let x = r.left + 120; x < r.right - 320; x += 12) { const el = document.elementFromPoint(x, y); if (el && el.closest('#mapViewport') && !el.closest('button,[data-place],.route-line')) return [x, y]; } return null; })()")
    x0 = page.evaluate('view.x'); page.mouse.move(fp[0], fp[1]); page.mouse.down()
    for i in range(1, 11): page.mouse.move(fp[0] + i * 10, fp[1] + i * 4)
    held = page.evaluate('view.x')   # read while the button is down: since V2026.11.19 the map glides on after release
    page.mouse.up(); page.wait_for_timeout(200)
    d = page.evaluate('[view.x, String(getSelection()).length, window.__drag]')
    check('拖动地图：地图跟手移动，不选中文字、不触发浏览器拖拽', abs(held - x0 - 100) < 3 and d[1] == 0 and d[2] == 0, [x0, held, d])
    page.evaluate('stopFly()')
    page.evaluate("state.panoLayer = false; state.shade = false; pickPlace('library')"); page.wait_for_timeout(700)
    page.evaluate("state.selected = null; renderPins(); renderCard()")
    spot = """(() => { const r = document.querySelector('#footprints polygon[data-place=library]').getBoundingClientRect();
      for (const fy of [.75, .6, .85, .4]) for (const fx of [.5, .3, .7]) { const x = r.x + r.width * fx, y = r.y + r.height * fy, el = document.elementFromPoint(x, y);
        if (el && el.matches('polygon[data-place=library]')) return [x, y]; } return null; })()"""
    b = page.evaluate(spot); x1 = page.evaluate('view.x')
    page.mouse.move(b[0], b[1]); page.mouse.down(); page.mouse.move(b[0] + 90, b[1] + 30, steps=8); held = page.evaluate('view.x'); page.mouse.up(); page.wait_for_timeout(250)
    ok_drag = abs(held - x1 - 90) < 3 and page.evaluate('state.selected') is None
    page.evaluate('stopFly()'); page.wait_for_timeout(250)
    b = page.evaluate(spot); page.mouse.click(b[0], b[1]); page.wait_for_timeout(700)
    ok_tap = page.evaluate('state.selected') == 'library'
    page.evaluate("state.selected = null; renderPins(); renderCard()"); page.wait_for_timeout(200)
    pin = page.evaluate("(() => { const r = document.querySelector('.pin[data-place=library]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()"); x2 = page.evaluate('view.x')
    page.mouse.move(pin[0], pin[1]); page.mouse.down(); page.mouse.move(pin[0] - 70, pin[1] + 20, steps=8); held = page.evaluate('view.x'); page.mouse.up(); page.wait_for_timeout(250)
    ok_pin = abs(held - x2 + 70) < 3 and page.evaluate('state.selected') is None; page.evaluate('stopFly()')
    check('在楼栋和标签上也能拖动地图，轻点仍然选中楼栋', ok_drag and ok_tap and ok_pin, [ok_drag, ok_tap, ok_pin])
    bad = [u for u in reqs if 'amap' in u or 'autonavi' in u]
    check('全程不访问高德', not bad, bad[:3])
    check('动效与本地全景无脚本错误', not errors, errors)

    # ---- V0.4：小南门学生不能通行 ----
    page.goto(URL + '#explore', wait_until='networkidle')
    r4 = page.evaluate("""(() => { const g = window.CAMPUS_ATLAS, R = Routing, small = g.access['gate-small'];
      const ge = g.edges.map((e, i) => ({...e, i})).filter(e => e.role === 'gate'), closed = ge.filter(e => e.closed);
      const uses = p => p.edges.some(e => e.index === closed[0].i);
      let bad = 0, plans = 0, fail = 0; const dorms = g.places.filter(p => p.category === '宿舍').map(p => p.id);
      for (const day of [1, 2, 3, 4, 5, 6, 7]) for (const mode of ['auto', 'inside', 'outside']) for (const from of ['gate-small', 'staff-2', 'east-18', 'e-guard-small']) for (const to of dorms.concat(['west-gate', 'gate', 'gate-south'])) {
        if (from === to) continue; const r = R.plan(g, from, to, 12, .4, {day, mode});
        if (r.error) { if (!(mode === 'outside' && !R.outsideAllowed(g, day))) fail++; continue; } plans++; if (r.choices.some(uses)) bad++; }
      const wed = R.plan(g, 'east-18', 'west-17', 12, .4, {day: 3, mode: 'outside'});
      const gatesUsed = wed.error ? [] : [...new Set(wed.choices.flatMap(p => p.edges.filter(e => e.role === 'gate').map(e => e.name)))];
      const reopened = {...g, edges: g.edges.map(e => ({...e, closed: false}))}, re = R.plan(reopened, 'east-18', 'west-17', 12, 0, {day: 3, mode: 'outside'});
      return {rule: g.rules.closedGates, closed: closed.map(e => [e.name, [e.a, e.b].includes(small)]), plans, bad, fail, gatesUsed, wedMeters: wed.error || wed.choices[0].meters,
        reopenedUsesSmall: !re.error && re.choices[0].edges.some(e => e.index === closed[0].i), reopenedMeters: re.error || re.choices[0].meters,
        insideReach: !R.plan(g, 'gate', 'gate-small', 12, .2, {day: 1, mode: 'inside'}).error, desc: g.places.find(p => p.id === 'gate-small').description}; })()""")
    check('规则登记：只有小南门出入口被关闭', r4['rule'] == ['gate-small'] and r4['closed'] == [['东区小南门出入口', True]], r4)
    check(f"任何星期、任何方式都不穿过小南门（{r4['plans']} 条路线）", r4['plans'] > 1000 and r4['bad'] == 0 and r4['fail'] == 0, [r4['plans'], r4['bad'], r4['fail']])
    check('周三东18→西17 走校外时改从别的门出校', r4['gatesUsed'] and '东区小南门出入口' not in r4['gatesUsed'] and '西区正门校外入口' in r4['gatesUsed'], r4['gatesUsed'])
    check('对照：若放开小南门，这条路会走小南门且更短（说明规则确实生效）', r4['reopenedUsesSmall'] and r4['reopenedMeters'] < r4['wedMeters'], [r4['reopenedMeters'], r4['wedMeters']])
    check('小南门仍可作为校内目的地到达，说明写明学生不通行', r4['insideReach'] and '学生不能' in r4['desc'])
    page.evaluate("pickPlace('gate-small')"); page.wait_for_timeout(700)
    check('地点卡提示小南门学生不能进出', page.locator('#mapCard .gate-closed').count() == 1)
    page.screenshot(path=os.path.join(SHOTS, '小南门_学生不通行.png'))
    page.click('[data-act="access-rules"]'); page.wait_for_timeout(400)
    check('通行规则说明包含小南门', '小南门' in page.inner_text('#modalContent'))
    page.keyboard.press('Escape')
    check('小南门规则无脚本错误', not errors, errors)

    page.goto(URL + '#explore', wait_until='networkidle'); page.click('#zoomIn'); page.wait_for_timeout(120)
    moving = page.evaluate("getComputedStyle(document.getElementById('mapPlane')).willChange"); page.wait_for_timeout(900)
    check('地图静止后不再是常驻合成层（放大后按当前倍率重绘，文字清晰）', moving == 'transform' and page.evaluate("getComputedStyle(document.getElementById('mapPlane')).willChange") == 'auto' and page.evaluate('crispScale === view.scale'), moving)

    # ---- V0.5：校徽、今日校园、搜索与路线细节 ----
    fresh = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(fresh)
    ferr = []; fresh.on('pageerror', lambda e: ferr.append(str(e)))
    fresh.goto(URL + '#explore', wait_until='networkidle'); fresh.wait_for_timeout(1900)
    r5 = fresh.evaluate("""(() => { const ok = s => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 0; };
      const logo = document.querySelector('.xfu-logo'), sp = document.getElementById('splash');
      return {logo: ok('.xfu-logo') && logo.getBoundingClientRect().height > 20, ratio: logo.naturalWidth / logo.naturalHeight, shown: logo.getBoundingClientRect().width / logo.getBoundingClientRect().height,
        mapEmblem: ok('.map-emblem') && getComputedStyle(document.querySelector('.map-emblem')).display !== 'none', splashGone: !sp || getComputedStyle(sp).visibility === 'hidden' || getComputedStyle(sp).display === 'none',
        today: (document.querySelector('.today-card') || {}).innerText || '', weekday: Routing.weekdays[Routing.today() - 1], emblemData: emblemData.startsWith('data:image/png')}; })()""")
    check('页眉显示官方校徽，比例未变形；地图标题旁有校徽', r5['logo'] and abs(r5['ratio'] - r5['shown']) < .05 and r5['mapEmblem'], r5)
    check('启动页自动消失；路线卡可嵌入校徽', r5['splashGone'] and r5['emblemData'], r5)
    check('今日校园卡显示星期和通行状态', r5['weekday'] in r5['today'] and ('可以走校外' in r5['today'] or '不能出校' in r5['today']) and '小南门' in r5['today'], r5['today'])
    fresh.fill('#placeSearch', '图书馆'); fresh.wait_for_timeout(300)
    marks = fresh.locator('#placeList mark').count(); fresh.press('#placeSearch', 'Enter'); fresh.wait_for_timeout(700)
    check('搜索高亮匹配文字，回车选中第一个结果', marks >= 1 and fresh.evaluate('state.selected') in ('library', 'west-lib'), [marks, fresh.evaluate('state.selected')])
    fresh.evaluate("state.query = ''; state.selected = null; exploreSide(); renderCard()"); fresh.wait_for_timeout(200)
    check('最近查看出现刚才的地点', fresh.locator('.recent button').count() >= 1)
    fresh.goto(URL + '?from=east-16&to=west-17&day=1&hour=14&mode=inside&detour=0.1#route', wait_until='networkidle'); fresh.wait_for_timeout(1200)
    r6 = fresh.evaluate("({from: state.from, to: state.to, day: state.day, hour: state.hour, mode: state.travel, detour: state.detour, strips: document.querySelectorAll('#routeResults .shade-strip i').length, note: document.querySelector('#routeResults .strip-note').innerText, card: document.getElementById('mapCard').innerText})")
    check('路线链接可还原起终点、星期、时刻和方式', [r6['from'], r6['to'], r6['day'], r6['hour'], r6['mode'], r6['detour']] == ['east-16', 'west-17', 1, 14, 'inside', .1], r6)
    check('路线卡有沿途遮阴色带和到达时间', r6['strips'] > 5 and '荫凉' in r6['note'] and '14:00 出发' in r6['card'] and '到' in r6['card'], [r6['strips'], r6['note']])
    fresh.click('[data-act="hour-now"]'); fresh.wait_for_timeout(500)
    check('“现在”按钮把星期设为今天', fresh.evaluate('state.day === Routing.today() && state.hour >= 0 && state.hour < 24 && Math.min(Math.abs(state.hour - nowHour()), 24 - Math.abs(state.hour - nowHour())) <= .5'))
    fresh.screenshot(path=os.path.join(SHOTS, '路线_遮阴色带与校徽.png'))
    check('新界面无脚本错误', not ferr, ferr); fresh.close()

    # ---- V0.6：路线支持 24 小时；晚上 21:00 后所有校门学生只进不出 ----
    page.goto(URL + '#explore', wait_until='networkidle')
    r7 = page.evaluate("""(() => { const g = window.CAMPUS_ATLAS, R = Routing, M = g.shadeModel, gates = g.edges.filter(e => e.role === 'gate');
      const dorms = g.places.filter(p => p.category === '宿舍'), east = dorms.filter(p => p.zone === '东区').map(p => p.id), west = dorms.filter(p => p.zone === '西区').map(p => p.id);
      let n = 0, usedGate = 0, noSky = 0, sunny = 0, multi = 0, err = 0, outsideErr = 0, outsideN = 0;
      for (const hour of [21, 23.5, 2]) for (const day of [1, 2, 3, 4, 5, 6, 7]) for (const a of east) for (const b of west.slice(0, 3)) for (const [from, to] of [[a, b], [b, a]]) {
        const r = R.plan(g, from, to, hour, .4, {day, mode: 'auto'}); if (r.error) { err++; continue; } n++;
        if (r.choices.length !== 1) multi++; const p = r.choices[0]; if (p.edges.some(e => ['gate', 'outside'].includes(e.role))) usedGate++; if (!p.usesSkybridge) noSky++; if (p.exposure || p.unknown) sunny++;
        const o = R.plan(g, from, to, hour, .4, {day, mode: 'outside'}); outsideN++; if (o.error && o.error.includes(R.outsideAllowed(g, day) ? '只进不出' : '禁止出校')) outsideErr++; }
      const north = gates.find(e => [e.a, e.b].includes(g.access['gate'])), small = gates.find(e => e.closed), day3 = {day: 3, mode: 'outside'};
      const enterNight = R.plan(g, north.out, 'east-16', 22, .4, day3), exitNight = R.plan(g, 'east-16', north.out, 22, .4, day3), exitDay = R.plan(g, 'east-16', north.out, 12, .4, day3), smallNight = R.plan(g, small.out, 'gate-small', 22, 0, day3);
      // whole day: every half hour gives a plan; dark hours carry no exposure; dusk (20:00) is dark but gates are still two-way
      let all = 0, bad = [], darkSun = 0; for (let h = 0; h < 24; h += .5) { const r = R.plan(g, 'east-16', 'west-17', h, .2, {day: 3, mode: 'auto'}); all++;
        if (r.error) bad.push(h); else if (!R.daylight(g, h) && r.choices.some(p => p.exposure || p.unknown || r.choices.length !== 1)) darkSun++; }
      const dusk = R.plan(g, 'east-16', 'west-17', 20, .2, {day: 3, mode: 'outside'}), noon = R.plan(g, 'gate', 'east-16', 12, .2, {day: 1, mode: 'auto'}), dawn = R.plan(g, 'gate', 'east-16', 7, .2, {day: 1, mode: 'auto'});
      const e = g.edges.find(x => x.role === 'campus' && new Set(x.shade).size > 2);
      return {rule: g.rules.nightEntryOnly, outs: gates.every(x => x.out && g.nodes[x.out] && x.out !== g.access['gate']), n, usedGate, noSky, sunny, multi, err, outsideErr, outsideN,
        enterNight: !enterNight.error && enterNight.choices[0].edges.some(x => x.role === 'gate'), exitNight: exitNight.error || '', exitDay: !exitDay.error,
        smallStillClosed: smallNight.error ? true : !smallNight.choices[0].edges.some(x => x.index === g.edges.indexOf(small)), night: [R.isNight(g, 20.9), R.isNight(g, 21), R.isNight(g, 23.5), R.isNight(g, 12)],
        gateDesc: ['gate', 'gate-south', 'west-gate'].every(id => g.places.find(p => p.id === id).description.includes('21:00')),
        hours: M.hours, sunrise: M.sunrise, sunset: M.sunset, all, bad, darkSun, duskOutside: !dusk.error && dusk.choices[0].usesOutside, bad24: !!R.plan(g, 'gate', 'east-16', 24, .2).error, badNeg: !!R.plan(g, 'gate', 'east-16', -1, .2).error,
        noonExposure: noon.choices[0].exposure, dawnExposure: dawn.choices[0].exposure, samplesHit: M.hours.every((h, i) => Math.abs(R.shadeAt(e.shade, h) - e.shade[i]) < 1e-9), mid: R.shadeAt(e.shade, 9), ends: [R.shadeAt(e.shade, 6.5) === e.shade[0], R.shadeAt(e.shade, 19.1) === e.shade.at(-1)],
        legacy: R.shadeAt([.2, .6, .4], 10)}; })()""")
    check('规则登记：21:00 起只进不出，四个校门都标明校外一侧', r7['rule']['from'] == 21 and r7['outs'] and r7['night'] == [False, True, True, False] and r7['gateDesc'], r7)
    check(f"21:00 后七天跨区路线都只走校内天渡、不经校门、不计日照（{r7['n']} 条）", r7['n'] > 2000 and r7['err'] == 0 and r7['usedGate'] == 0 and r7['noSky'] == 0 and r7['sunny'] == 0 and r7['multi'] == 0, r7)
    check('21:00 后选“校外经正门”一律被拒：可出校的日子说明只进不出，其余日子说明禁止出校', r7['outsideN'] > 2000 and r7['outsideErr'] == r7['outsideN'], [r7['outsideErr'], r7['outsideN']])
    check('方向正确：夜间可以从校外进北门，不能从北门出去；白天可以出', r7['enterNight'] and bool(r7['exitNight']) and r7['exitDay'], [r7['enterNight'], r7['exitNight'], r7['exitDay']])
    check('小南门夜间同样不能进', r7['smallStillClosed'])
    check('全天 48 个半点都能出路线；24:00 和负数时刻被拒', r7['all'] == 48 and not r7['bad'] and r7['bad24'] and r7['badNeg'], r7['bad'])
    check('日出前、日落后不计日照且只给一条最短路', r7['darkSun'] == 0 and 6 < r7['sunrise'] < 6.6 and 19 < r7['sunset'] < 19.5, [r7['darkSun'], r7['sunrise'], r7['sunset']])
    check('20:00 天黑但未到 21:00：周三仍可走校外', r7['duskOutside'])
    check('林荫模型扩到 07—19 点 8 个时刻，采样点取原值、之间插值、两端保持', r7['hours'] == [7, 8, 10, 12, 14, 16, 18, 19] and r7['samplesHit'] and r7['mid'] is not None and all(r7['ends']) and abs(r7['legacy'] - .4) < 1e-9 and r7['noonExposure'] > 0, [r7['hours'], r7['mid'], r7['ends'], r7['legacy']])
    page.goto(URL + '#route', wait_until='networkidle')
    page.select_option('#startPlace', 'east-16'); page.select_option('#endPlace', 'west-17'); page.select_option('#travelDay', '3'); page.select_option('#travelMode', 'auto'); page.wait_for_timeout(300)
    set_hour = "h => { const i = document.getElementById('hour'); i.value = h; i.dispatchEvent(new Event('input', {bubbles: true})); }"
    slider = page.evaluate("[document.getElementById('hour').min, document.getElementById('hour').max]")
    page.select_option('#travelMode', 'outside'); page.evaluate(set_hour, 12); page.wait_for_timeout(700); day_text = page.inner_text('#routeResults')
    page.select_option('#travelMode', 'auto'); page.evaluate(set_hour, 21.5); page.wait_for_timeout(900); night_text = page.inner_text('#routeResults')
    check('时刻滑块覆盖全天；周三 12:00 有校外方案，21:30 只剩校内天渡', slider == ['0', '23.5'] and '校外' in day_text and '校外' not in night_text and '天渡' in night_text and '夜间无日照' in night_text, [slider, day_text[:60], night_text[:80]])
    check('21:30 界面同步：时刻说明、通行提示、图例、地图卡都写只进不出，太阳标记隐藏', '只进不出' in page.inner_text('#hourNote') and '只进不出' in page.inner_text('#accessNotice') and '只进不出' in page.inner_text('#accessLegend') and '只进不出' in page.inner_text('#mapCard') and page.evaluate("document.getElementById('sunDot').hidden"))
    page.screenshot(path=os.path.join(SHOTS, '晚上21点后_校门只进不出.png'))
    page.select_option('#travelMode', 'outside'); page.wait_for_timeout(400)
    check('21:30 选校外方式时给出只进不出的提示', '只进不出' in page.inner_text('#routeResults'))
    page.evaluate(set_hour, 18); page.wait_for_timeout(700)
    check('18:00 仍有日照：显示太阳方位和遮阴色带，校外可走', '太阳在' in page.inner_text('#hourNote') and page.locator('#routeResults .shade-strip').count() >= 1 and '校外' in page.inner_text('#routeResults') and not page.evaluate("document.getElementById('sunDot').hidden"))
    page.select_option('#travelMode', 'auto'); page.wait_for_timeout(300)
    page.click('[data-act="access-rules"]'); page.wait_for_timeout(400)
    check('通行规则说明包含 21:00 后只进不出', '21:00' in page.inner_text('#modalContent') and '只进不出' in page.inner_text('#modalContent'))
    page.keyboard.press('Escape')
    nf = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(nf)
    nf.goto(URL + '?from=east-16&to=west-17&day=3&hour=22.5&mode=auto&detour=0.2#route', wait_until='networkidle'); nf.wait_for_timeout(900)
    check('路线链接可还原夜间时刻（22:30）', nf.evaluate('state.hour') == 22.5 and '夜间无日照' in nf.inner_text('#routeResults') and '22:30 出发' in nf.inner_text('#mapCard')); nf.close()
    check('全天与夜间规则无脚本错误', not errors, errors)

    # ---- V0.7：天气预报（中国天气网 太乙宫街道）接入路线 ----
    page.goto(URL + '#explore', wait_until='networkidle'); page.evaluate(MK_WX)
    w = page.evaluate("""(() => { const W = Weather, g = window.CAMPUS_ATLAS, R = Routing, H = 36e5, out = {};
      out.kinds = [W.kindOf('00'), W.kindOf('02'), W.kindOf('07'), W.kindOf('14'), W.kindOf('99', '雷阵雨'), W.kindOf('', '浮尘'), W.kindOf('99', '???')];
      out.stale = [W.usable({hours: [{t: Date.now() - 3 * H}]}), W.usable({hours: []}), W.usable(null), W.usable(mkWx(['00'], 20, '晴'))];
      W.use(mkWx(['00'], 30, '晴'), 'live'); const d = W.data, h5 = d.hours[5], day5 = W.weekday(h5.t), hour5 = h5.hour;
      const hit = W.sky(day5, hour5 + .5, 'auto'), far = W.sky((W.weekday(Date.now()) + 2) % 7 + 1, 12, 'auto'), nowS = W.sky(W.weekday(Date.now()), new Date(Date.now() + 288e5).getUTCHours(), 'auto'), manual = W.sky(day5, hour5, 'overcast');
      out.hit = [hit.kind, hit.source, hit.temp, hit.sun]; out.far = [far.kind, far.source, far.sun]; out.nowS = [nowS.kind, nowS.source]; out.manual = [manual.kind, manual.source, manual.sun, manual.temp];
      const adv = (kind, temp, dark) => W.advise({...W.sky(1, 12, kind), temp, source: 'forecast'}, dark);
      out.advise = [adv('clear', 30).pick, adv('clear', 20).pick, adv('clear', 5).pick, adv('overcast', 20).pick, adv('cloudy', 20).pick, adv('rain', 20).pick, adv('clear', 30, true).pick];
      out.adviseWhy = [adv('rain', 20).why.includes('带伞'), adv('clear', 5).why.includes('偏冷'), W.advise(W.sky(1, 12, 'auto', 0), false).why === '', adv('clear', 30, true).why.includes('夜间')];
      // the sun share scales every exposure; with no sun only distance is left
      const dorms = g.places.filter(p => p.category === '宿舍').map(p => p.id), goals = ['library', 'dining', 'gym', 'track', 'tech', 'gate'];
      let pairs = 0, scaleBad = 0, shortBad = 0, m1 = 0, m02 = 0, wetBad = 0, multi = null;
      for (const a of dorms.slice(0, 14)) for (const b of goals) { if (a === b) continue; const o = {day: 3, mode: 'inside'};
        const full = R.plan(g, a, b, 12, .4, {...o, sun: 1}), dim = R.plan(g, a, b, 12, .4, {...o, sun: .2}), half = R.plan(g, a, b, 12, .4, {...o, sun: .6}), wet = R.plan(g, a, b, 12, .4, {...o, sun: 0, sunless: '雨天最短'});
        if (full.error) continue; pairs++; const pick = (r, l) => r.choices.find(p => p.labels.includes(l));
        const s1 = pick(full, '距离优先'), s6 = pick(half, '距离优先'), s2 = pick(dim, '距离优先');
        if (s1.meters !== s2.meters || s1.meters !== s6.meters) shortBad++;
        if (s1.ids.join() === s6.ids.join() && Math.abs(s6.exposure - s1.exposure * .6) > 1e-6) scaleBad++;
        m1 += pick(full, '折中方案').meters; m02 += pick(dim, '折中方案').meters;
        if (wet.choices.length !== 1 || wet.choices[0].labels[0] !== '雨天最短' || wet.choices[0].exposure !== 0 || wet.choices[0].meters !== s1.meters || !wet.noSun) wetBad++;
        if (!multi && full.choices.length >= 2 && pick(full, '少晒优先') !== s1) multi = [a, b]; }
      out.route = {pairs, scaleBad, shortBad, m1, m02, wetBad, multi, badSun: !!R.plan(g, 'gate', 'east-16', 12, .2, {sun: 1.5}).error, defaultSun: R.plan(g, 'gate', 'east-16', 12, .2).sun};
      W.use({hours: [{t: Date.now() - 5 * H}]}, 'live'); out.afterStale = [W.data, W.source];
      return out; })()""")
    check('天气代码归类：晴、阴、雨、雪，未知代码按文字识别', w['kinds'] == ['clear', 'overcast', 'rain', 'snow', 'rain', 'dust', None], w['kinds'])
    check('过期或空的预报不采用', w['stale'] == [False, False, False, True] and w['afterStale'] == [None, 'none'], [w['stale'], w['afterStale']])
    check('按星期和时刻取预报；超出 24 小时按晴天估算；当前小时用实况；手动设定优先', w['hit'] == ['clear', 'forecast', 30, 1] and w['far'] == ['clear', 'default', 1] and w['nowS'] == ['clear', 'now'] and w['manual'] == ['overcast', 'manual', .2, 30], [w['hit'], w['far'], w['nowS'], w['manual']])
    check('天气推荐：晴热少晒、晴暖折中、偏冷和阴天走最近、雨天和夜间不比较日照', w['advise'] == ['少晒优先', '折中方案', '距离优先', '距离优先', '折中方案', None, None] and all(w['adviseWhy']), [w['advise'], w['adviseWhy']])
    rt = w['route']
    check(f"日照按天气比例折算（{rt['pairs']} 组起终点）：最短路不变，日照随比例缩放", rt['pairs'] > 40 and rt['scaleBad'] == 0 and rt['shortBad'] == 0 and rt['defaultSun'] == 1 and rt['badSun'], rt)
    check('阴天的折中路线不比晴天更绕；雨天只给一条最短路且不计日照', rt['m02'] <= rt['m1'] and rt['wetBad'] == 0, rt)
    a, b = rt['multi']
    page.goto(URL + f'?from={a}&to={b}&day=3&hour=12&mode=inside&detour=0.4#route', wait_until='networkidle'); page.evaluate(MK_WX)
    empty = page.locator('.wx-block .wx-empty').count() == 1 and page.locator('.rec-tag').count() == 0 and '按晴天估算' in page.inner_text('#hourNote') and page.inner_text('#wxChip').strip() == '天气'
    check('没有预报时：提示按晴天估算，不给天气推荐，仍可手动选天气', empty and page.locator('.sky-pick button').count() == 5)
    noon = page.evaluate("(() => { Weather.use(mkWx(['00'], 30, '晴'), 'live'); return Weather.data.hours.find(h => h.hour === 12).t; })()"); page.wait_for_timeout(500)
    cells = page.locator('#wxStrip .wx-cell').count()
    page.click(f'#wxStrip [data-wx-t="{noon}"]'); page.wait_for_timeout(900)
    st = page.evaluate("({hour: state.hour, day: state.day, want: Weather.weekday(%d), on: document.querySelectorAll('#wxStrip .wx-cell.on').length, sky: document.getElementById('skyFx').dataset.sky, night: document.getElementById('skyFx').dataset.night, rec: currentPlan.rec, choice: state.choice, exp: currentPlan.choices.find(p => p.labels.includes('距离优先')).exposure})" % noon)
    rec_text = page.inner_text('.route-option.recommended')
    check('逐小时预报条 24 格；点某个小时即按那一刻规划', cells == 24 and st['hour'] == 12 and st['day'] == st['want'] and st['on'] == 1, [cells, st])
    check('晴 30℃：推荐并选中「少晒优先」，说明晴热；地图切到晴天', '少晒优先' in rec_text and '天气推荐' in rec_text and st['rec'] == st['choice'] and '晴热' in page.inner_text('.wx-advice') and st['sky'] == 'clear' and st['night'] == 'false' and '预报 晴 30℃' in page.inner_text('#hourNote') and '预报 晴 30℃' in page.inner_text('#wxNote'), [rec_text, st])
    page.screenshot(path=os.path.join(SHOTS, '天气_晴热推荐少晒路线.png'))
    page.click('.route-option:not(.recommended)'); page.wait_for_timeout(300)
    check('手动改选其他路线后保持所选', page.evaluate('state.choice !== currentPlan.rec && state.choiceTouched'))
    page.click('.sky-pick [data-sky="overcast"]'); page.wait_for_timeout(900)
    ov = page.evaluate("({exp: currentPlan.choices.find(p => p.labels.includes('距离优先')).exposure, rec: currentPlan.choices[currentPlan.rec].labels, choice: state.choice, recIdx: currentPlan.rec, sky: document.getElementById('skyFx').dataset.sky, pressed: document.querySelector('.sky-pick [data-sky=overcast]').getAttribute('aria-pressed')})")
    check('手动设为阴：日照按 20% 折算，改荐「距离优先」，标注折算日照', abs(ov['exp'] - st['exp'] * .2) < 1e-6 and '距离优先' in ov['rec'] and ov['choice'] == ov['recIdx'] and ov['sky'] == 'overcast' and ov['pressed'] == 'true' and '折算日照' in page.inner_text('#routeResults') and '不必为荫凉绕路' in page.inner_text('.wx-advice') and '手动设定 阴' in page.inner_text('#wxNote'), ov)
    page.screenshot(path=os.path.join(SHOTS, '天气_阴天推荐最近路线.png'))
    page.click('.sky-pick [data-sky="rain"]'); page.wait_for_timeout(900)
    rain_text = page.inner_text('#routeResults')
    check('手动设为雨：只给「雨天最短」，不显示遮阴色带，提醒带伞，地图下雨', page.locator('#routeResults .route-option').count() == 1 and '雨天最短' in rain_text and '无直射日照' in rain_text and '带伞' in rain_text and page.locator('#routeResults .shade-strip').count() == 0 and page.evaluate("document.getElementById('skyFx').dataset.sky") == 'rain' and page.evaluate("getComputedStyle(document.querySelector('#skyFx .fx-a')).display") == 'block' and '雨' in page.inner_text('#mapCard'), rain_text[:80])
    page.screenshot(path=os.path.join(SHOTS, '天气_雨天只比距离.png'))
    page.click('.sky-pick [data-sky="auto"]'); page.wait_for_timeout(900)
    check('改回按预报：恢复晴天推荐', page.evaluate("state.sky") == 'auto' and '少晒优先' in page.inner_text('.route-option.recommended'))
    page.evaluate("Weather.use(mkWx(['07'], 9, '小雨'), 'live')"); page.wait_for_timeout(900)
    check('预报变成小雨时页面自动跟随', '雨天最短' in page.inner_text('#routeResults') and '预报 小雨 9℃' in page.inner_text('#wxNote') and '小雨' in page.inner_text('#wxChip'))
    page.evaluate("(() => { state.hour = 22; updateRoute(); routeSide(); })()"); page.wait_for_timeout(600)
    check('夜间有雨：仍按夜间规则，只走校内', '夜间最短' in page.inner_text('#routeResults') and '只进不出' in page.inner_text('#hourNote') and page.evaluate("document.getElementById('skyFx').dataset.night") == 'true')
    sk = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(sk)
    sk.goto(URL + f'?from={a}&to={b}&day=3&hour=12&mode=inside&detour=0.4&sky=overcast#route', wait_until='networkidle'); sk.wait_for_timeout(900)
    check('路线链接可带手动天气（sky=overcast）', sk.evaluate('state.sky') == 'overcast' and '折算日照' in sk.inner_text('#routeResults') and '距离优先' in sk.inner_text('.route-option.recommended')); sk.close()
    page.goto(URL + '#explore', wait_until='networkidle'); page.evaluate(MK_WX); page.evaluate("Weather.use(mkWx(['02'], 8, '阴'), 'live')"); page.wait_for_timeout(600)
    card = page.inner_text('.today-card'); chip = page.inner_text('#wxChip')
    check('首页：今日校园卡和页眉显示此刻天气与建议', '阴 8℃' in card and '阴 8℃' in chip and page.get_attribute('.today-card', 'data-sky') == 'overcast' and page.locator('.today-wx').count() == 1, [card[-60:], chip])
    page.click('#wxChip'); page.wait_for_timeout(400); dlg = page.inner_text('#modalContent')
    check('校园天气卡：24 小时预报、折算比例、来源和重新读取', page.locator('.wx-hours .wx-cell').count() == 24 and '中国天气网' in dlg and '中央气象台' in dlg and '20%' in dlg and page.locator('[data-act="wx-refresh"]').count() == 1 and '估计' in dlg, dlg[:80])
    page.screenshot(path=os.path.join(SHOTS, '天气_校园天气卡.png'))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.click('.map-review-tools [data-act="shade-layer"]'); page.wait_for_timeout(500)
    shade = page.evaluate("""(() => { const first = () => document.querySelector('#shadeOverlay line').style.stroke, i = document.getElementById('shadeHour'); i.value = 12; i.dispatchEvent(new Event('input', {bubbles: true}));
      state.sky = 'clear'; refreshAccess(); const sunny = first(); state.sky = 'overcast'; exploreSide(); refreshAccess(); const grey = first(), note = document.getElementById('shadeSky').innerText, legend = document.getElementById('accessLegend').innerText;
      state.sky = 'auto'; exploreSide(); refreshAccess(); return {sunny, grey, note, legend}; })()""")
    check('林荫分布随天气变淡，并标出天气', shade['sunny'] != shade['grey'] and '阴' in shade['note'] and '阴' in shade['legend'], shade)
    page.click('.map-review-tools [data-act="shade-layer"]'); page.wait_for_timeout(300)
    api = page.request.get(URL + 'api/weather'); body = api.json()
    live = api.status == 200 and len(body.get('hours', [])) >= 12 and all(isinstance(h.get('t'), int) and 0 <= h.get('hour', -1) <= 23 and h.get('text') for h in body['hours']) and body['hours'][0]['t'] < body['hours'][-1]['t']
    check('天气接口：联网时返回逐小时预报（本次' + ('已取到 %d 小时' % len(body.get('hours', [])) if live else '未联网，返回了说明') + '）', live or (api.status == 502 and 'error' in body), [api.status, str(body)[:120]])
    check('天气功能无脚本错误', not errors, errors)

    # ---- V0.8：太阳方位、日出日落和楼影按当天日期计算 ----
    page.goto(URL + '#explore', wait_until='networkidle')
    s = page.evaluate("""(() => { const g = CAMPUS_ATLAS, M = g.shadeModel, R = Routing, design = M.designDate, orig = g.edges.map(e => JSON.stringify([e.shade, e.shadeSrc.tree, e.shadeSrc.building])), ph = M.hours.slice();
      const out = {mode: state.sunMode, date: M.date, design, hours: ph, lohi: g.edges.every(e => Number.isFinite(e.shadeSrc.lo) && Number.isFinite(e.shadeSrc.hi))};
      out.sunDiff = Math.max(...M.sun.map(x => { const p = SunModel.position(design, x.hour); return Math.max(Math.abs(p.elevation - x.elevation), Math.abs(p.azimuth - x.azimuth)); }));
      const js = SunModel.build(g, design); let n = 0, sum = 0, big = 0, tree = 0, longBig = 0;
      g.edges.forEach((e, i) => ph.forEach((h, k) => { const j = js.hours.indexOf(h), d = Math.abs(js.edges[i].shade[j] - e.shade[k]); n++; sum += d; if (d > .1) { big++; if (e.meters > 12) longBig++; } tree = Math.max(tree, Math.abs(js.edges[i].tree[j] - e.shadeSrc.tree[k])); }));
      Object.assign(out, {n, mean: sum / n, big: big / n, longBig, tree, rise: [js.sunrise, M.sunrise, js.sunset, M.sunset], jsHours: js.hours});
      const nov = SunModel.build(g, '2026-11-11'), jun = SunModel.build(g, '2026-06-21'), dec = SunModel.build(g, '2026-12-21'), top = m => Math.max(...m.sun.map(x => x.elevation)), noon = m => { const j = m.hours.indexOf(12); return m.edges.reduce((a, x) => a + x.building[j], 0) / m.edges.length; };
      out.season = {nov: [nov.sunrise, nov.sunset, top(nov)], jun: [jun.sunrise, jun.sunset, top(jun)], dec: [dec.sunrise, dec.sunset, top(dec)], noon: [noon(jun), noon(js), noon(nov), noon(dec)]};
      SunModel.apply(g, '2026-11-11'); const W = g.shadeModel; let bad = 0, darkBad = 0;
      for (let h = 0; h < 24; h += .5) { const r = R.plan(g, 'east-16', 'library', h, .2, {day: 3, mode: 'inside'}); if (r.error) bad++; else if (!R.daylight(g, h) && (r.choices.length !== 1 || r.choices[0].exposure)) darkBad++; }
      out.winter = {date: W.date, first: W.hours[0], last: W.hours.at(-1), lens: g.edges.every(e => e.shade.length === W.hours.length && e.shadeSrc.tree.length === W.hours.length), day: [R.daylight(g, 7), R.daylight(g, 12), R.daylight(g, 18)],
        at18: R.plan(g, 'east-16', 'library', 18, .2, {day: 3, mode: 'inside'}).choices[0].labels[0], noonExp: R.plan(g, 'east-16', 'library', 12, .2, {day: 3, mode: 'inside'}).choices[0].exposure, bad, darkBad, sunNoon: SunModel.position(W.date, 12)};
      SunModel.apply(g, design); out.restored = g.shadeModel.date === design && g.shadeModel.hours.length === ph.length && g.edges.every((e, i) => JSON.stringify([e.shade, e.shadeSrc.tree, e.shadeSrc.building]) === orig[i]);
      return out; })()""")
    check('夏季情景沿用制图工具的原始数值（9 月 1 日，8 个时刻）', s['mode'] == 'summer' and s['date'] == s['design'] == '2026-09-01' and s['hours'] == [7, 8, 10, 12, 14, 16, 18, 19] and s['lohi'], [s['mode'], s['date'], s['hours']])
    check('页面里的太阳位置公式与制图工具一致（相差 %.2f°，日出日落相同）' % s['sunDiff'], s['sunDiff'] < .1 and abs(s['rise'][0] - s['rise'][1]) < .011 and abs(s['rise'][2] - s['rise'][3]) < .011, [s['sunDiff'], s['rise']])
    check('页面重算 9 月 1 日遮阴与制图工具逐段对照（%d 个值，平均相差 %.1f 个百分点；%.1f%% 相差超过 10 个百分点，出在影子边缘的取整上）' % (s['n'], s['mean'] * 100, s['big'] * 100), s['mean'] < .01 and s['big'] < .02 and s['tree'] <= .0101, [s['mean'], s['big'], s['longBig'], s['tree']])
    se = s['season']
    check('不同季节的太阳合理：11 月 11 日约 07:12 日出、17:44 日落；夏至正午最高，冬至最低；冬天楼影更长', 7.0 < se['nov'][0] < 7.4 and 17.55 < se['nov'][1] < 17.9 and 78 < se['jun'][2] < 80 and 31.5 < se['dec'][2] < 33 and se['jun'][0] < 5.8 and se['noon'] == sorted(se['noon']), se)
    wn = s['winter']
    check('切到 11 月 11 日：07:00 和 18:00 没有日照，18:00 只给夜间最短；全天 48 个半点都能出路线', wn['date'] == '2026-11-11' and wn['day'] == [False, True, False] and wn['at18'] == '夜间最短' and wn['noonExp'] > 0 and wn['bad'] == 0 and wn['darkBad'] == 0 and wn['lens'] and wn['first'] >= 7.2 and wn['last'] <= 17.74 and 37 < wn['sunNoon']['elevation'] < 40, wn)
    check('切回夏季情景后数值与原来完全一致', s['restored'])
    td = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(td, summer=False); terr = []
    td.on('pageerror', lambda e: terr.append(str(e)))
    td.goto(URL + '#explore', wait_until='networkidle'); td.wait_for_timeout(600)
    d0 = td.evaluate("""(() => { const M = CAMPUS_ATLAS.shadeModel, arc = document.querySelector('.today-sun').textContent; return {mode: state.sunMode, date: M.date, today: SunModel.today(), real: new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(new Date()),
      arc: arc.includes(clock(M.sunrise)) && arc.includes(clock(M.sunset)), sunrise: M.sunrise, sunset: M.sunset, expect: [SunModel.crossing(SunModel.today(), true), SunModel.crossing(SunModel.today(), false)], hours: M.hours, design: M.designDate}; })()""")
    check('默认按今天的日期计算太阳（本次为 %s，日出 %.2f、日落 %.2f）；首页日照弧线用当天日出日落' % (d0['date'], d0['sunrise'], d0['sunset']), d0['mode'] == 'today' and d0['date'] == d0['today'] == d0['real'] and d0['arc'] and abs(d0['sunrise'] - d0['expect'][0]) < .011 and abs(d0['sunset'] - d0['expect'][1]) < .011, d0)
    td.click('.map-review-tools [data-act="shade-layer"]'); td.wait_for_timeout(400)
    sl = td.evaluate("(() => { const i = document.getElementById('shadeHour'), h = CAMPUS_ATLAS.shadeModel.hours; return [+i.min === h[0], +i.max === h[h.length - 1], +i.value >= h[0] && +i.value <= h[h.length - 1], document.querySelectorAll('.shade-panel .sun-pick button').length]; })()")
    check('林荫时段滑块的范围跟随当天的日照时段', sl == [True, True, True, 2], sl)
    td.click('.map-review-tools [data-act="shade-layer"]'); td.wait_for_timeout(200)
    td.goto(URL + '?from=east-16&to=library&day=3&hour=12&mode=inside&detour=0.2#route', wait_until='networkidle'); td.wait_for_timeout(700)
    late_hour = td.evaluate("Math.min(23, Math.floor(CAMPUS_ATLAS.shadeModel.sunset) + 1)")
    r0 = td.evaluate("({pressed: document.querySelector('.sun-pick [aria-pressed=true]').dataset.sun, grad: document.getElementById('hour').style.background.includes('linear-gradient'), noon: document.getElementById('routeResults').innerText, note: document.querySelector('.demo-note').innerText, line: document.querySelector('.sun-line').innerText})")
    td.evaluate("h => { const i = document.getElementById('hour'); i.value = h; i.dispatchEvent(new Event('input', {bubbles: true})); }", late_hour); td.wait_for_timeout(700)
    dusk = td.inner_text('#routeResults'); dusk_note = td.inner_text('#hourNote')
    check('路线页按今天：正午计日照，日落后一小时（%d:00）只比较距离；说明里写明日出日落' % late_hour, r0['pressed'] == 'today' and r0['grad'] and '日照' in r0['noon'] and '夜间' not in r0['noon'] and '夜间最短' in dusk and '夜间无日照' in dusk_note and '今天' in r0['note'] and '日出' in r0['line'] and '日落' in r0['line'], [r0, dusk[:50]])
    td.evaluate("h => { const i = document.getElementById('hour'); i.value = h; i.dispatchEvent(new Event('input', {bubbles: true})); }", 18); td.wait_for_timeout(500)
    td.click('.wx-block [data-sun="summer"]'); td.wait_for_timeout(900)
    sm = td.evaluate("({mode: state.sunMode, date: CAMPUS_ATLAS.shadeModel.date, hours: CAMPUS_ATLAS.shadeModel.hours.length, pressed: document.querySelector('.sun-pick [aria-pressed=true]').dataset.sun, note: document.querySelector('.demo-note').innerText, res: document.getElementById('routeResults').innerText, hn: document.getElementById('hourNote').innerText})")
    check('可切到夏季情景：18:00 仍有日照，说明同步改为夏季', sm['mode'] == 'summer' and sm['date'] == d0['design'] and sm['hours'] == 8 and sm['pressed'] == 'summer' and '夏季情景' in sm['note'] and '太阳在' in sm['hn'] and '夜间最短' not in sm['res'], sm)
    td.screenshot(path=os.path.join(SHOTS, '太阳_夏季情景18点仍有日照.png'))
    td.click('.wx-block [data-sun="today"]'); td.wait_for_timeout(900)
    check('切回今天后恢复当天的太阳', td.evaluate("state.sunMode === 'today' && CAMPUS_ATLAS.shadeModel.date === SunModel.today()"))
    td.evaluate("h => { const i = document.getElementById('hour'); i.value = h; i.dispatchEvent(new Event('input', {bubbles: true})); }", 12); td.wait_for_timeout(600)
    td.screenshot(path=os.path.join(SHOTS, '太阳_按今天日期计算.png'))
    td.goto(URL + '?from=east-16&to=library&day=3&hour=18&mode=inside&detour=0.2&sun=summer#route', wait_until='networkidle'); td.wait_for_timeout(600)
    check('路线链接可带夏季情景（sun=summer）', td.evaluate("state.sunMode === 'summer' && CAMPUS_ATLAS.shadeModel.date === CAMPUS_ATLAS.shadeModel.designDate") and '太阳在' in td.inner_text('#hourNote'))
    check('按当天计算太阳无脚本错误', not terr and not errors, terr + errors); td.close()

    # ---- V0.9：楼门、全景里补到的小路、3D 校园 ----
    page.goto(URL + '#explore', wait_until='networkidle')
    d = page.evaluate("""(() => { const g = CAMPUS_ATLAS, R = Routing, S = CAMPUS_3D, built = new Set(g.structures.map(s => s.id)), out = {};
      const withDoors = g.places.filter(p => p.doors), need = g.places.filter(p => (built.has(p.id) || p.sharedFootprint) && p.id !== 'e-flag-platform');
      out.count = [need.length, withDoors.length, g.edges.filter(e => e.kind === 'door').length]; out.src = g.survey.doors;
      out.mainFirst = withDoors.every(p => p.doors[0].kind === 'main' && g.access[p.id] === 'h_' + p.id);
      let through = 0, routes = 0;
      for (const a of ['east-16', 'west-17', 'library', 'gate', 'conf', 'w-teach5']) for (const b of g.places) { if (a === b.id) continue; const r = R.plan(g, a, b.id, 12, .2, {day: 3, mode: 'auto'}); if (r.error) continue;
        for (const p of r.choices) { routes++; if (p.edges.some(e => e.door && e.door !== a && e.door !== b.id) || p.edges.slice(1, -1).some(e => e.kind === 'door')) through++; } }
      out.through = [routes, through];
      const last = (a, b) => R.plan(g, a, b, 12, 0, {day: 3, mode: 'inside'}).choices[0].edges.at(-1).name;
      out.conf = [last('e-teach9', 'conf'), last('gate-south', 'conf')]; out.lib = [last('gate', 'library'), last('tech', 'library')];
      const used = new Set();
      for (const a of g.places) for (const b of ['west-lib', 'west-5', 'west-1', 'w-teach2', 'w-square', 'west-10', 'east-1', 'east-16', 'w-teach3', 'west-14', 'w-power']) { if (a.id === b) continue; const r = R.plan(g, a.id, b, 12, 0, {day: 1, mode: 'inside'}); if (!r.error) r.choices[0].edges.forEach(e => used.add(e.name)); }
      out.paths = g.survey.extraPaths.map(x => [x.name, g.edges.some(e => e.name === x.name), used.has(x.name)]);
      out.heights = [g.shadeModel.heightOverrides.dining, g.shadeModel.heightOverrides.guest, g.shadeModel.heightOverrides['w-teach5'], g.structures.every(s => S.buildings[s.id] && S.buildings[s.id].height > 0)];
      out.staff = [g.structures.find(s => s.id === 'staff-5').polygon.length, g.structures.filter(s => s.id.startsWith('fam-')).length];
      out.size = [Object.keys(g.nodes).length, g.edges.length]; return out; })()""")
    check('每栋楼都有门：%d 处建筑、%d 条门内连接（依据：团队标注 %d，地面全景 %d，推定 %d）' % (d['count'][1], d['count'][2], d['src']['团队'], d['src']['地面'], d['src']['推定']),
          d['count'][0] == d['count'][1] and d['count'][2] >= d['count'][1] and d['mainFirst'] and d['src']['团队'] >= 100 and d['src']['类推'] == 0, d['count'])
    check('门只给起点和终点的楼用：%d 条路线没有一条穿过别的楼' % d['through'][0], d['through'][1] == 0 and d['through'][0] > 500, d['through'])
    check('一栋楼有多个门时走更近的门（会议中心：从 9 号楼走北门、从南门方向走南门；图书馆：从北门来走西边的南侧后门、从科技楼来走正门）', '北门' in d['conf'][0] and '南门' in d['conf'][1] and d['lib'][0].endswith('南侧后门') and d['lib'][1].endswith('南门（大台阶）'), [d['conf'], d['lib']])
    check('全景里看到的 %d 条小路都进了路网，其中 %d 条被最短路线用到' % (len(d['paths']), sum(1 for x in d['paths'] if x[2])), all(x[1] for x in d['paths']) and sum(1 for x in d['paths'] if x[2]) >= 6, d['paths'])
    check('楼高换成全景里数出的层数（东区餐饮中心 21 米、西译宾馆 36 米），每栋楼都有 3D 参数；路网 %d 个节点、%d 段' % tuple(d['size']), d['heights'] == [21, 36, 23, True], d['heights'])
    check('教工家属院不再是一整块：5 号教师公寓是临街板楼，院内按航拍另画 %d 栋' % d['staff'][1], d['staff'][0] == 4 and d['staff'][1] >= 10, d['staff'])

    from PIL import Image as _Image
    import io as _io
    g3 = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(g3, summer=True, flat=False); e3 = []
    g3.on('pageerror', lambda e: e3.append(str(e)))
    def settle(pg=None, extra=200):   # camera moves are animated: read the view only once it has come to rest
        pg = pg or g3; pg.wait_for_timeout(120); pg.wait_for_function('!Map3D.busy()'); pg.wait_for_timeout(extra)
    g3.goto(URL + '#explore', wait_until='networkidle'); g3.wait_for_timeout(2600)
    s3 = g3.evaluate("({dim: document.body.dataset.dim, ok: Map3D.ok, ready: Map3D.ready, hidden: document.getElementById('map3d').hidden, structs: Map3D.structures(), want: CAMPUS_ATLAS.structures.length, trees: Map3D.trees(), pins: Labels3D.list('pin').length, light: Map3D.light(), grow: Map3D.view().grow, btn: [...document.querySelectorAll('.map-type button')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join(' '), tag: document.querySelector('.build-tag').textContent})")
    check('默认打开 3D 校园：%d 栋立体建筑、%d 棵树、%d 个标注' % (s3['structs'], s3['trees'], s3['pins']), s3['dim'] == '3d' and s3['ok'] and s3['ready'] and not s3['hidden'] and s3['structs'] == s3['want'] and s3['trees'] > 2000 and s3['pins'] > 12 and s3['btn'] == '3D 地图:true 2D 地图:false' and s3['tag'].startswith('版本 V2026.11.19') and s3['grow'] == 1, s3)
    box = g3.locator('#map3d').bounding_box(); shot = _Image.open(_io.BytesIO(g3.screenshot(clip=box))).convert('RGB').resize((200, 125)); colours = len(set(shot.getdata()))
    check('3D 画面确实画出来了（缩略图里有 %d 种颜色）' % colours, colours > 600, colours)
    g3.screenshot(path=os.path.join(SHOTS, '3D_校园全景.png'))
    hit = g3.evaluate("(() => { Map3D.setView({x: 1440, z: 330, dist: 520, bearing: 0, pitch: 55}); const top = Map3D.top('library'), p = Map3D.project(1400, 242, top), q = Map3D.project(1480, 600, 0), r = document.getElementById('map3d').getBoundingClientRect(); return {top, pick: Map3D.pick(p.x, p.y), open: Map3D.pick(q.x, q.y), cx: r.left + p.x, cy: r.top + p.y}; })()")
    g3.wait_for_timeout(500); g3.mouse.click(hit['cx'], hit['cy']); g3.wait_for_timeout(900)
    sel = g3.evaluate("({sel: state.selected, card: document.querySelector('.place-card h3')?.textContent, doors: Labels3D.all('door').map(l => l.text), note: document.querySelector('.door-note')?.innerText || ''})")
    check('点 3D 里的楼就选中它（图书馆）；卡片和模型上都标出正门和后门', hit['pick']['place'] == 'library' and hit['top'] > 40 and sel['sel'] == 'library' and sorted(sel['doors']) == ['后门 · 南侧后门', '正门 · 南门'] and '正门' in sel['note'] and '后门' in sel['note'] and '团队' in sel['note'], [hit, sel])
    g3.screenshot(path=os.path.join(SHOTS, '3D_图书馆与楼门.png'))
    g3.evaluate("Map3D.setEnv({az: 300, el: -30})"); soft = g3.evaluate("Map3D.light()"); g3.evaluate("applySky()")
    g3.click('#light3d'); g3.wait_for_timeout(400); lit = g3.evaluate("({light: Map3D.light(), pressed: document.getElementById('light3d').getAttribute('aria-pressed'), saved: localStorage.getItem('sunwalk.light3d')})")
    check('3D 默认是均匀柔光：不投影，夜里也不变暗；打开“日照与楼影”开关后才按太阳照明，并记住这个选择', s3['light']['lit'] is False and s3['light']['strength'] == 0 and soft['strength'] == 0 and soft['night'] == 0 and lit['light']['lit'] is True and lit['pressed'] == 'true' and lit['saved'] == '1', [s3['light'], soft, lit])
    sh = g3.evaluate("""(() => { const g = CAMPUS_ATLAS, M = g.shadeModel, out = {};
      const test = h => { const p = SunModel.position(M.date, h, M.lat, M.lon); Map3D.setEnv({az: p.azimuth, el: p.elevation, sun: 1, season: 0}); const j = M.hours.indexOf(h); let n = 0, same = 0;
        for (const e of g.edges) { if (e.role !== 'campus' || e.kind === 'door' || e.kind === 'access') continue; const b = e.shadeSrc.building[j]; if (b > .02 && b < .98) continue; const a = g.nodes[e.a], c = g.nodes[e.b]; n++; if (Map3D.shadowed((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) === (b >= .98)) same++; }
        const L = Map3D.light(), t = p.azimuth * Math.PI / 180, el = p.elevation * Math.PI / 180; return {n, same, dir: Math.abs(L.dir[0] - Math.sin(t) * Math.cos(el)) < .01 && Math.abs(L.dir[1] - Math.sin(el)) < .01 && Math.abs(L.dir[2] + Math.cos(t) * Math.cos(el)) < .01}; };
      out.h10 = test(10); out.h16 = test(16);
      const p12 = SunModel.position(M.date, 12, M.lat, M.lon); Map3D.setEnv({az: p12.azimuth, el: p12.elevation, sun: 1}); out.noon = [Map3D.shadowed(1440, 160), Map3D.shadowed(1440, 268)];
      Map3D.setEnv({az: 300, el: -8, sun: 1}); out.night = Map3D.light(); applySky(); return out; })()""")
    agree = (sh['h10']['same'] + sh['h16']['same']) / max(1, sh['h10']['n'] + sh['h16']['n'])
    check('3D 里的太阳方向与林荫模型一致；模型里的楼影与各路段的楼荫数据吻合 %.0f%%（%d 处）；正午图书馆北侧在影里、南侧不在' % (agree * 100, sh['h10']['n'] + sh['h16']['n']),
          sh['h10']['dir'] and sh['h16']['dir'] and agree > .9 and sh['noon'] == [True, False] and sh['night']['strength'] == 0 and sh['night']['night'] == 1, sh)
    v0 = g3.evaluate("Map3D.view()"); cx, cy = box['x'] + box['width'] * .55, box['y'] + box['height'] * .45
    g3.evaluate("window.__lab = Labels3D.stats()")
    g3.mouse.move(cx, cy); g3.mouse.down()
    for k in range(1, 9): g3.mouse.move(cx + 18 * k, cy + 6 * k); g3.wait_for_timeout(16)
    g3.mouse.up(); va = g3.evaluate("Map3D.view()"); g3.wait_for_timeout(260); vb = g3.evaluate("Map3D.view()"); settle(); v1 = g3.evaluate("Map3D.view()")
    same = g3.evaluate("(() => { const s = Labels3D.stats(); return s.rebuilds === __lab.rebuilds && s.draws > __lab.draws + 5 && s.nodes === 0; })()")
    check('松手后地图带惯性再滑一段（%.0f 像素）；镜头移动时标注只重画、不重建' % abs(v1['x'] - va['x']), abs(vb['x'] - va['x']) > 2 and abs(v1['x'] - va['x']) > abs(vb['x'] - va['x']) * .9 and same, [va, vb, v1, same])
    g3.mouse.wheel(0, -500); settle(); v2 = g3.evaluate("Map3D.view()")
    g3.mouse.move(cx, cy); g3.mouse.down(button='right'); g3.mouse.move(cx + 120, cy - 40, steps=6); g3.mouse.up(button='right'); settle(); v3 = g3.evaluate("Map3D.view()")
    g3.click('#rot3d'); settle(); v4 = g3.evaluate("Map3D.view()"); g3.click('.compass'); settle(); v5 = g3.evaluate("Map3D.view()")
    g3.click('#zoomIn'); settle(); v6 = g3.evaluate("Map3D.view()")
    check('3D 操作：拖动平移、滚轮缩放、右键拖动旋转和俯仰、按钮转 45°、点指北针回正、放大按钮',
          abs(v1['x'] - v0['x']) > 20 and v1['dist'] == v0['dist'] and v2['dist'] < v1['dist'] and abs(v3['bearing'] - v2['bearing']) > 20 and abs(v3['pitch'] - v2['pitch']) > 5 and abs(((v4['bearing'] - v3['bearing']) % 360) - 45) < 1 and abs(v5['bearing']) < .5 and v6['dist'] < v5['dist'], [v0, v1, v2, v3, v4, v5, v6])
    g3.click('#zoneSwitch [data-act="shade-layer"]'); g3.wait_for_timeout(700)
    sl3 = g3.evaluate("({rib: Map3D.ribbons(), dots: Labels3D.all('pano').length, want: CAMPUS_ATLAS.edges.filter(e => e.kind !== 'access' && e.kind !== 'door' && e.role !== 'gate').length})")
    check('林荫图层在 3D 里也能看（%d 段着色）' % sl3['rib'].get('shade', 0), sl3['rib'].get('shade') == sl3['want'] and sl3['want'] > 350, sl3)
    g3.click('#zoneSwitch [data-act="shade-layer"]'); g3.wait_for_timeout(300)
    g3.goto(URL + '?from=east-16&to=library&day=3&hour=10&mode=inside&detour=0.2#route', wait_until='networkidle'); g3.wait_for_timeout(2400)
    r3 = g3.evaluate("({dim: document.body.dataset.dim, rib: Map3D.ribbons(), walker: !document.getElementById('walker3d').hidden, ends: Labels3D.all('pin').filter(l => l.active).map(l => l.text), doors: Labels3D.all('door').length, card: document.querySelector('.route-summary').innerText, light: Map3D.light()})")
    check('3D 里画出路线：丝带、沿路走的小圆点、起终点和两端的门；路线卡写明从哪个门出、到哪个门', r3['dim'] == '3d' and r3['rib'].get('route', 0) > 5 and r3['rib'].get('flow', 0) > 5 and r3['walker'] and len(r3['ends']) == 2 and r3['doors'] >= 2 and '门出' in r3['card'] and '到东区图书馆' in r3['card'] and r3['light']['strength'] == 1, r3)
    g3.screenshot(path=os.path.join(SHOTS, '3D_路线与楼影.png'))
    g3.click('[data-act="begin-steps"]'); settle(extra=400)
    st = g3.evaluate("(() => { const p = currentPlan.choices[state.choice], s = Directory.steps(p, CAMPUS_ATLAS.nodes)[0], pts = p.ids.slice(s.first, s.last + 2).map(id => CAMPUS_ATLAS.nodes[id]), a = pts[0], b = pts.at(-1), want = Math.atan2(b[0] - a[0], a[1] - b[1]) / Math.PI * 180, v = Map3D.view(); return {want, got: v.bearing, pitch: v.pitch, diff: Math.abs(((v.bearing - want) % 360 + 540) % 360 - 180)}; })()")
    g3.screenshot(path=os.path.join(SHOTS, '3D_分步导览朝行进方向.png'))
    g3.click('[data-act="end-steps"]'); settle(extra=400); back = g3.evaluate("Map3D.view().bearing")
    check('分步导览时镜头转到行进方向（应为 %.0f°，实际 %.0f°），回到总览后转回正北' % (st['want'], st['got']), st['diff'] < 2 and st['pitch'] > 55 and abs(back) < 1, [st, back])
    set_hour = "h => { const i = document.getElementById('hour'); i.value = h; i.dispatchEvent(new Event('input', {bubbles: true})); }"
    g3.evaluate(set_hour, 22); g3.wait_for_timeout(600); n3 = g3.evaluate("Map3D.light()"); g3.evaluate("Map3D.setView({x: 1500, z: 420, dist: 900, bearing: -20, pitch: 60})"); g3.wait_for_timeout(500)
    g3.screenshot(path=os.path.join(SHOTS, '3D_夜间亮灯.png'))
    g3.evaluate(set_hour, 16); g3.wait_for_timeout(600); a3 = g3.evaluate("(() => { const p = SunModel.position(CAMPUS_ATLAS.shadeModel.date, 16, CAMPUS_ATLAS.shadeModel.lat, CAMPUS_ATLAS.shadeModel.lon), L = Map3D.light(); return {strength: L.strength, west: L.dir[0] < -.5, el: p.elevation}; })()")
    check('拖动出发时刻，模型的光照跟着变：22:00 进入夜间不投影，16:00 太阳在西边', n3['strength'] == 0 and n3['night'] == 1 and a3['strength'] == 1 and a3['west'], [n3, a3])
    done = "!document.body.classList.contains('dim-switch') && !Map3D.busy()"
    g3.evaluate("Map3D.setView({x: 1450, z: 520, dist: 1000, bearing: 30, pitch: 55})"); g3.wait_for_timeout(300); c0 = g3.evaluate("Map3D.view()")
    g3.click('#dim2dBtn'); g3.wait_for_timeout(300); mid = g3.evaluate("({dim: document.body.dataset.dim, grow: Map3D.view().grow, pitch: Map3D.view().pitch})")
    g3.wait_for_function("document.body.dataset.dim === '2d' && " + done); g3.wait_for_timeout(200)
    t2 = g3.evaluate("(() => { const v = document.getElementById('mapViewport'); return {dim: document.body.dataset.dim, hidden: document.getElementById('map3d').hidden, pins: document.querySelectorAll('#mapPins .pin').length, btn: [...document.querySelectorAll('.map-type button')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join(' '), line: document.querySelectorAll('#pathOverlay .route-line').length, cx: toMap(v.clientWidth / 2, v.clientHeight / 2)[0], cy: toMap(v.clientWidth / 2, v.clientHeight / 2)[1], rot: view.rot, scale: view.scale, want: v.clientHeight / (2 * 1000 * Math.tan(Map3D.FOV / 2))}; })()")
    g3.click('#dim3dBtn'); g3.wait_for_timeout(250); mid3 = g3.evaluate("({dim: document.body.dataset.dim, grow: Map3D.view().grow, pitch: Map3D.view().pitch})")
    g3.wait_for_function("document.body.dataset.dim === '3d' && " + done); g3.wait_for_timeout(200)
    t3 = g3.evaluate("({dim: document.body.dataset.dim, hidden: document.getElementById('map3d').hidden, rib: Map3D.ribbons().route, btn: [...document.querySelectorAll('.map-type button')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join(' '), cam: Map3D.view()})")
    check('2D 与 3D 之间是连续的过渡：切换中途建筑正在升降（高度 %.0f%% / %.0f%%），切到平面地图后位置、缩放和朝向与 3D 里看的是同一处，切回后建筑恢复全高' % (mid['grow'] * 100, mid3['grow'] * 100),
          0 < mid['grow'] < 1 and mid['dim'] == '3d' and 0 < mid3['grow'] < 1 and abs(t2['cx'] - c0['x']) < 3 and abs(t2['cy'] - c0['z']) < 3 and abs(t2['rot'] + c0['bearing']) < .5 and abs(t2['scale'] / t2['want'] - 1) < .02 and abs(t3['cam']['x'] - c0['x']) < 3 and abs(t3['cam']['bearing'] - c0['bearing']) < .5 and t3['cam']['grow'] == 1 and abs(t3['cam']['pitch'] - 50) < .5, [c0, mid, t2, mid3, t3['cam']])
    pace = g3.evaluate("""() => new Promise(done => { Map3D.flyTo({x: 700, z: 900, dist: 700, bearing: 40, pitch: 60}, 1500); const dts = []; let last = 0, n = 0;
      const f = now => { if (last) dts.push(now - last); last = now; if (++n < 150) requestAnimationFrame(f); else { dts.sort((a, b) => a - b); done({median: dts[dts.length >> 1], p95: dts[Math.floor(dts.length * .95)], worst: dts[dts.length - 1]}); } }; requestAnimationFrame(f); })""")
    check('镜头飞行时帧间隔平稳（本机：中位 %.0f 毫秒，95%% 的帧在 %.0f 毫秒内，最慢 %.0f 毫秒）' % (pace['median'], pace['p95'], pace['worst']), pace['p95'] < 45 and pace['worst'] < 120, pace)
    g3.goto(URL + '?view=2d#explore', wait_until='networkidle'); g3.wait_for_timeout(700); t4 = g3.evaluate("[document.body.dataset.dim, document.getElementById('map3d').hidden, document.getElementById('dim2dBtn').getAttribute('aria-pressed')]")
    check('3D 和平面地图可以来回切换，路线跟着切换；链接带 view=2d 时直接打开平面地图', t2['dim'] == '2d' and t2['hidden'] and t2['pins'] > 10 and '2D 地图:true' in t2['btn'] and t2['line'] > 5 and t3['dim'] == '3d' and not t3['hidden'] and t3['rib'] > 5 and '3D 地图:true' in t3['btn'] and t4 == ['2d', True, 'true'], [t2, t3, t4])
    # ---- V0.11: 6号教学楼 is three separate blocks; 3D / 2D sit on top of the map, the plan image and the geographic map are small tools ----
    g3.fill('#placeSearch', '6号教学楼'); g3.wait_for_timeout(400)
    six2 = g3.evaluate("""(() => { const g = CAMPUS_ATLAS, ids = ['e-teach6', 'e-teach6-e', 'e-teach6-w'], ps = ids.map(i => g.places.find(q => q.id === i));
      const route = i => Routing.plan(g, 'gate', i, 10, .2, {day: 3, mode: 'inside'}).choices[0].edges.slice(-3).map(e => e.name);
      const hop = Routing.plan(g, 'e-teach6-e', 'e-teach6-w', 10, .2, {day: 3, mode: 'inside'}).choices[0];
      return {names: ps.map(p => p && p.name), own: ids.map(i => g.structures.filter(s => s.id === i).length), floors: ids.map(i => CAMPUS_3D.buildings[i].floors), doors: ps.map(p => p.doors.map(d => d.label + '/' + d.src).join()),
        found: [...document.querySelectorAll('#placeList .place-row')].map(r => r.dataset.place).filter(i => ids.includes(i)).sort(), polys: ids.map(i => document.querySelectorAll('#footprints polygon[data-place="' + i + '"]').length),
        routes: ids.map(route), hop: [hop.meters, hop.edges.map(e => e.name)]}; })()""")
    g3.fill('#placeSearch', ''); g3.wait_for_timeout(300)
    top = g3.evaluate("({btns: [...document.querySelectorAll('.map-type button')].map(b => b.textContent), old: ['atlasBtn', 'officialBtn', 'geoBtn', 'flatBtn'].filter(i => document.getElementById(i)), tools: [...document.querySelectorAll('.mini-tools button')].map(b => b.textContent), label: document.querySelector('.mini-tools span').textContent})")
    dims = "[...document.querySelectorAll('.map-type button')].map(b => b.getAttribute('aria-pressed')).join()"
    g3.click('.mini-tools [data-act=tool-original]'); g3.wait_for_timeout(500)
    o1 = g3.evaluate("({map: state.map, back: !document.getElementById('layerBack').hidden, text: document.getElementById('layerBack').textContent, pressed: document.querySelector('[data-act=tool-original]').getAttribute('aria-pressed'), dims: " + dims + "})")
    g3.click('.mini-tools [data-act=tool-geo]'); g3.wait_for_timeout(800)
    o2 = g3.evaluate("({map: state.map, geo: !document.getElementById('geoMap').hidden, text: document.getElementById('layerBack').textContent, pressed: [...document.querySelectorAll('.mini-tools button')].map(b => b.getAttribute('aria-pressed')).join()})")
    g3.click('#layerBack'); g3.wait_for_timeout(500); o3 = g3.evaluate("({map: state.map, back: document.getElementById('layerBack').hidden, dim: document.body.dataset.dim, dims: " + dims + "})")
    g3.click('.mini-tools [data-act=tool-original]'); g3.wait_for_timeout(400); g3.click('#dim3dBtn'); g3.wait_for_function("document.body.dataset.dim === '3d'"); settle(extra=1700)
    o4 = g3.evaluate("({map: state.map, dim: document.body.dataset.dim, back: document.getElementById('layerBack').hidden, dims: " + dims + "})")
    check('地图上方只有“3D 地图 / 2D 地图”两个切换；学校原图和定位图收进侧栏“小功能”，打开后地图上出现返回按钮，点返回或点 3D 地图都能回到校园地图',
          top['btns'] == ['3D 地图', '2D 地图'] and not top['old'] and top['tools'] == ['学校原图', '定位图'] and top['label'] == '小功能'
          and o1['map'] == 'official' and o1['back'] and '学校原图' in o1['text'] and o1['pressed'] == 'true' and o1['dims'] == 'false,false'
          and o2['map'] == 'geo' and o2['geo'] and '定位图' in o2['text'] and o2['pressed'] == 'false,true'
          and o3 == {'map': 'atlas', 'back': True, 'dim': '2d', 'dims': 'false,true'} and o4 == {'map': 'atlas', 'dim': '3d', 'back': True, 'dims': 'true,false'}, [top, o1, o2, o3, o4])
    g3.evaluate("Map3D.setView({x: 1462, z: 400, dist: 300, bearing: 0, pitch: 15})"); g3.wait_for_timeout(400)
    six3 = g3.evaluate("""(() => { const at = (x, y, h) => { const q = Map3D.project(x, y, h); return q && Map3D.pick(q.x, q.y); };
      const hits = [at(1462, 436, Map3D.top('e-teach6')), at(1505, 380, 6), at(1425, 380, 6)], court = at(1455, 395, 0);
      return {hits: hits.map(h => h && h.place), court: court && court.structure}; })()""")
    g3.evaluate("Map3D.setView({x: 1462, z: 400, dist: 260, bearing: -20, pitch: 52})"); g3.wait_for_timeout(600); g3.screenshot(path=os.path.join(SHOTS, '3D_6号教学楼三栋.png'))
    check('东区 6 号教学楼是三个目的地：A 楼（靠餐饮中心）、东楼、西楼（%s 层），各有自己的轮廓；A 楼的三个门照团队平面图；搜“6号教学楼”三栋都能找到，3D 里点哪栋选中哪栋，院子里点不到楼；东楼、西楼经内院步道到门口，两楼之间穿过小院 %d 米' % ('、'.join(map(str, six2['floors'])), six2['hop'][0]),
          six2['names'] == ['东区6号教学楼A楼', '东区6号教学楼东楼', '东区6号教学楼西楼'] and six2['own'] == [1, 1, 1] and six2['floors'] == [4, 3, 4] and six2['polys'] == [1, 1, 1]
          and six2['doors'] == ['北门（门厅）/平面图,南门（楼梯旁）/平面图,东门（走廊尽头）/平面图', '西门（朝内院）/推定', '东门（朝内院）/推定'] and six2['found'] == ['e-teach6', 'e-teach6-e', 'e-teach6-w']
          and six2['routes'][0][-1].startswith('东区6号教学楼A楼') and [r[-1] for r in six2['routes'][1:]] == ['东区6号教学楼东楼西门（朝内院）', '东区6号教学楼西楼东门（朝内院）'] and all('6号教学楼内院步道' in r for r in six2['routes'][1:])
          and six2['hop'][0] < 40 and len(six2['hop'][1]) == 4 and six3['hits'] == ['e-teach6', 'e-teach6-e', 'e-teach6-w'] and not six3['court'], [six2, six3])
    # ---- V0.12: the 3D labels are painted on one canvas; a label still acts like the button it replaced ----
    g3.evaluate("Map3D.setView({x: 1440, z: 330, dist: 520, bearing: 0, pitch: 50})"); g3.wait_for_timeout(400)
    lb = g3.evaluate("(() => { const l = Labels3D.list('pin').find(q => q.id === 'library') || Labels3D.list('pin')[0], r = document.getElementById('map3d').getBoundingClientRect(), x = l.hit[0] + l.hit[2] / 2, y = l.hit[1] + l.hit[3] / 2; return {id: l.id, cx: r.left + x, cy: r.top + y, at: Labels3D.at(x, y), miss: Labels3D.at(x, y + 60), shown: Labels3D.list().length}; })()")
    g3.mouse.click(lb['cx'], lb['cy']); g3.wait_for_timeout(500)
    picked = g3.evaluate("({sel: state.selected, active: Labels3D.all('pin').filter(l => l.active).map(l => l.id), nodes: Labels3D.stats().nodes, tag: document.getElementById('pins3d').tagName})")
    g3.evaluate("document.querySelector('[data-act=clear-place]').click()")
    check('3D 上的 %d 个标注画在一张画布上（没有逐个的网页元素）；点标注和点原来的按钮一样选中地点' % lb['shown'],
          lb['at'] and lb['at']['id'] == lb['id'] and picked['sel'] == lb['id'] and picked['active'] == [lb['id']] and picked['nodes'] == 0 and picked['tag'] == 'CANVAS' and lb['shown'] > 12, [lb, picked])
    check('3D 校园无脚本错误', not e3, e3); g3.close()
    # ---- V0.13: paths the team drew, 6号教学楼A楼 joined to the dining centre and 诒德大道, the indoor map from the team's floor plan ----
    gi = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(gi); ei = []
    gi.on('pageerror', lambda e: ei.append(str(e)))
    gi.goto(URL + '?from=dining&to=e-teach6&day=3&hour=10&mode=inside#route', wait_until='networkidle'); gi.wait_for_timeout(1200)
    tp = gi.evaluate("""(() => { const g = CAMPUS_ATLAS, names = new Set(g.edges.map(e => e.name)), team = g.survey.teamPaths, p = currentPlan.choices[0], n = id => g.nodes[id];
      const lane = g.edges.filter(e => e.name === '6号教学楼A楼南侧通道'), east = lane.flatMap(e => [n(e.a), n(e.b)]).find(q => q[0] === 1548);
      const onAvenue = !!east && g.edges.some(e => e.name === '诒德大道' && [n(e.a), n(e.b)].some(q => q[0] === east[0] && q[1] === east[1]));
      const drawn = [...document.querySelectorAll('#pathOverlay .route-line title')].map(t => t.textContent.split(' · ')[0]), doorNames = new Set(p.edges.filter(e => e.kind === 'door').map(e => e.name));
      const first = document.querySelector('#pathOverlay .route-casing').getAttribute('points').split(' ')[0].split(',').map(Number), door = n(p.ids[1]);
      return {team: team.length, missing: team.filter(x => !names.has(x)), first: p.edges[0].name, last: p.edges.at(-1).name, via: p.edges.some(e => e.name === '6号教学楼A楼南侧通道'), meters: p.meters, onAvenue,
        doorsDrawn: drawn.filter(t => doorNames.has(t)).length, doors: doorNames.size, lines: drawn.length, walk: p.edges.filter(e => e.kind !== 'door').length, startsAtDoor: Math.hypot(first[0] - door[0], first[1] - door[1]) < .5}; })()""")
    gi.screenshot(path=os.path.join(SHOTS, '路线_餐饮中心到6号楼A楼.png'))
    check('团队手绘的 %d 条路都进了路网；东区餐饮中心北门经“6号教学楼A楼南侧通道”到 A 楼南门 %d 米，这条通道东端接诒德大道' % (tp['team'], tp['meters']),
          tp['team'] >= 40 and not tp['missing'] and tp['first'] == '东区餐饮中心北门（朝 6 号楼 A 楼）' and tp['last'] == '东区6号教学楼A楼南门（楼梯旁）' and tp['via'] and tp['meters'] < 40 and tp['onAvenue'], tp)
    check('平面地图上的路线从楼门画起，不再画楼门到楼中心的连线（多门的楼不会被斜穿）', tp['doors'] == 2 and tp['doorsDrawn'] == 0 and tp['lines'] == tp['walk'] and tp['startsAtDoor'], tp)
    gi.click('#mapCard [data-indoor]'); gi.wait_for_timeout(500)
    in1 = gi.evaluate("({open: document.getElementById('modal').open, title: document.querySelector('#modalContent h2').textContent, st: Indoor.state(), floors: [...document.querySelectorAll('.indoor-floors button')].map(b => b.textContent), rooms: Indoor.rooms('e-teach6').length, plan: document.querySelectorAll('.indoor-svg g[data-room]').length, ents: document.querySelectorAll('.indoor-svg g[data-ent]').length})")
    gi.click('.indoor-svg g[data-room="6108"]'); gi.wait_for_timeout(300)
    in2 = gi.evaluate("({room: Indoor.state().room, floor: Indoor.state().floor, steps: [...document.querySelectorAll('.indoor-steps li')].map(l => l.innerText.replace(/\\s+/g, ' ')), line: document.querySelectorAll('.indoor-svg .in-route').length, sel: document.querySelector('.indoor-svg g.sel')?.dataset.room})")
    gi.screenshot(path=os.path.join(SHOTS, '楼内导航.png'))
    gi.fill('#indoorSearch', '博瑞'); gi.keyboard.press('Enter'); gi.wait_for_timeout(300)
    in3 = gi.evaluate("({room: Indoor.state().room, floor: Indoor.state().floor, marked: [...document.querySelectorAll('.indoor-floors button.path')].map(b => +b.dataset.floor).sort(), steps: [...document.querySelectorAll('.indoor-steps li')].map(l => l.innerText.replace(/\\s+/g, ' ')), meta: document.querySelector('.indoor-meta').innerText.replace(/\\s+/g, ' ')})")
    gi.screenshot(path=os.path.join(SHOTS, '楼内导航_跨楼层.png'))
    gi.click('.indoor-floors [data-floor="2"]'); gi.wait_for_timeout(250)
    in4 = gi.evaluate("({floor: Indoor.state().floor, line: document.querySelectorAll('.indoor-svg .in-route').length, stairs: document.querySelectorAll('.indoor-svg .in-stair').length})")
    check('6 号楼 A 楼楼内导航：%d 个房间、4 层照团队平面图；从路线卡打开时入口自动设为路线到达的南门；点 6108 给出 1 层的走法，搜“博瑞”找到 3 层 6A33，在 2 层换楼梯（%s）' % (in1['rooms'], in3['meta']),
          in1['open'] and '楼内导航' in in1['title'] and in1['st']['entrance'] == 'south' and in1['floors'] == ['4层', '3层', '2层', '1层'] and in1['rooms'] == 44 and in1['plan'] > 8 and in1['ents'] == 3
          and in2['room'] == '6108' and in2['floor'] == 1 and in2['sel'] == '6108' and in2['line'] == 1 and len(in2['steps']) == 2 and '南门' in in2['steps'][0]
          and in3['room'] == '6A33' and in3['floor'] == 3 and in3['marked'] == [1, 2, 3] and len(in3['steps']) == 4 and any('北侧楼梯' in s for s in in3['steps']) and '上 2 层楼梯' in in3['meta']
          and in4 == {'floor': 2, 'line': 1, 'stairs': 2}, [in1, in2, in3, in4])
    gi.keyboard.press('Escape'); gi.wait_for_timeout(200)
    gi.goto(URL + '#explore', wait_until='networkidle'); gi.wait_for_timeout(600)
    gi.fill('#placeSearch', '6A41'); gi.wait_for_timeout(400); hits = gi.evaluate("[...document.querySelectorAll('.room-row')].map(r => r.dataset.room)")
    gi.click('.room-row[data-room="6A41"]'); gi.wait_for_timeout(500); in5 = gi.evaluate("({open: document.getElementById('modal').open, st: Indoor.state()})")
    gi.keyboard.press('Escape'); gi.wait_for_timeout(200); gi.fill('#placeSearch', ''); gi.wait_for_timeout(200)
    card = gi.evaluate("(() => { pickPlace('e-teach6'); const a = !!document.querySelector('#mapCard [data-indoor=\"e-teach6\"]'); pickPlace('library'); return {six: a, library: !!document.querySelector('#mapCard [data-indoor]')}; })()")
    gi.goto(URL + '?indoor=e-teach6&room=6312a#explore', wait_until='networkidle'); gi.wait_for_timeout(1300); link = gi.evaluate("({open: document.getElementById('modal').open, st: Indoor.state()})")
    check('在校园搜索框搜门牌号（6A41）直接列出楼内房间，点开就是 4 层；地点卡上有“楼内导航”，没有平面图的楼不显示；链接 ?indoor=…&room=… 直接打开到该房间',
          hits == ['6A41'] and in5['open'] and in5['st']['room'] == '6A41' and in5['st']['floor'] == 4 and card == {'six': True, 'library': False}
          and link['open'] and link['st']['room'] == '6312a' and link['st']['floor'] == 3, [hits, in5, card, link])
    mi = browser.new_page(viewport={'width': 390, 'height': 800}, locale='zh-CN', timezone_id='Asia/Shanghai', has_touch=True, is_mobile=True); no_weather(mi, flat=False); emi = []
    mi.on('pageerror', lambda e: emi.append(str(e)))
    mi.goto(URL + '?indoor=e-teach6&room=6A41#explore', wait_until='networkidle'); mi.wait_for_timeout(1800)
    ph = mi.evaluate("(() => { const d = document.getElementById('modal'); return {open: d.open, page: document.documentElement.scrollWidth <= innerWidth + 1, dialog: d.scrollWidth <= d.clientWidth + 1, steps: document.querySelectorAll('.indoor-steps li').length}; })()")
    mi.screenshot(path=os.path.join(SHOTS, '楼内导航_手机.png')); mi.close()
    check('手机上楼内导航不出现横向滚动；楼内导航无脚本错误', ph == {'open': True, 'page': True, 'dialog': True, 'steps': 4} and not ei and not emi, [ph, ei, emi]); gi.close()
    # ---- V0.15: which faculty or college (4 学部 + 6 学院, the team's list) uses each teaching building ----
    gf = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(gf, flat=False); ef = []
    gf.on('pageerror', lambda e: ef.append(str(e)))
    gf.goto(URL + '#explore', wait_until='networkidle'); gf.wait_for_function("typeof Map3D !== 'undefined' && Map3D.ok && Map3D.ready && !Map3D.busy()"); gf.wait_for_timeout(900)
    f1 = gf.evaluate("""(() => { const fac = id => Labels3D.all('pin').find(l => l.id === id)?.fac || null, tiles = [...document.querySelectorAll('.fac-panel .fac-tile')];
      return {tiles: tiles.map(t => t.querySelector('b').textContent), units: CAMPUS_FACULTY.units.length, e9: fac('e-teach9'), w4: fac('w-teach4'), w5: fac('w-teach5'), a6: fac('e-teach6-e'), lib: fac('library'), west: fac('west')}; })()""")
    check('侧栏列出 4 个学部、6 个学院；3D 标注在楼名下写出所属单位（9号楼经济与管理学部，西区4号楼两个学院，西区5号楼三个单位）',
          f1['tiles'] == ['人文与艺术学部', '理工学部', '健康与体育学部', '经济与管理学部', '英文学院', '国际语言文化学院', '马克思主义学院', '创新创业学院', '继续教育学院', '国际交流学院']
          and f1['e9'] == '经济与管理学部' and f1['w4'] == '英文学院 · 国际语言文化学院' and f1['w5'] == '人文与艺术学部 +2' and f1['a6'] == '理工学部' and f1['lib'] is None and f1['west'] is None, f1)
    gf.click('.zone-switch [data-act="faculty-layer"]'); gf.wait_for_function('!Map3D.busy()'); gf.wait_for_timeout(900)
    f2 = gf.evaluate("({tint: Map3D.tinted(), shown: Labels3D.list('pin').filter(l => l.fac).map(l => l.id), pressed: [...document.querySelectorAll('[data-act=faculty-layer]')].map(b => b.getAttribute('aria-pressed'))})")
    gf.screenshot(path=os.path.join(SHOTS, '学部分布_3D.png'))
    check('“学部”图层：%d 栋教学楼按学部、学院着色（共用的楼画条纹），镜头拉到全部教学楼，%d 个楼名下标出学部' % (len(f2['tint']), len(f2['shown'])),
          len(f2['tint']) == 13 and set(f2['tint'].values()) == {0.6} and len(f2['shown']) >= 9 and set(f2['pressed']) == {'true'}, f2)
    gf.click('.fac-tile[data-faculty="sci"]'); gf.wait_for_function('!Map3D.busy()'); gf.wait_for_timeout(700)
    f3 = gf.evaluate("""({fac: state.faculty, tint: Map3D.tinted(), card: document.querySelector('#mapCard').innerText.replace(/\\s+/g, ' '), lead: Labels3D.list('pin').filter(l => ['e-teach6', 'e-teach7'].includes(l.id)).map(l => l.id).sort(),
      on: [...document.querySelectorAll('.fac-tile.on')].map(t => t.dataset.faculty)})""")
    gf.screenshot(path=os.path.join(SHOTS, '学部_理工学部.png'))
    check('点“理工学部”：6号楼三栋和7号楼亮起（其余教学楼变淡），学部卡列出下设的系和楼，镜头对准这几栋楼',
          f3['fac'] == 'sci' and all(f3['tint'][k] == 0.8 for k in ['e-teach6', 'e-teach6-e', 'e-teach6-w', 'e-teach7']) and f3['tint']['e-teach9'] == 0.16 and '计算机科学系' in f3['card'] and '东区6号教学楼 · 3 栋' in f3['card'] and '东区7号教学楼' in f3['card']
          and f3['lead'] == ['e-teach6', 'e-teach7'] and f3['on'] == ['sci'], f3)
    gf.click('.fac-where button[data-place="e-teach7"]'); gf.wait_for_timeout(700)
    f4 = gf.evaluate("""(() => { const a = {sel: state.selected, fac: state.faculty, chips: [...document.querySelectorAll('#mapCard .fac-chip')].map(c => c.dataset.faculty), tag: document.querySelector('#mapCard .fac-tag')?.textContent};
      pickPlace('library'); a.after = state.faculty; pickPlace('west'); a.none = !!document.querySelector('#mapCard .fac-none'); pickPlace('w-teach5');
      a.w5 = [...document.querySelectorAll('#mapCard .fac-chip')].map(c => c.dataset.faculty); a.photo = !!document.querySelector('#mapCard .fac-photo'); return a; })()""")
    gf.wait_for_timeout(900); gf.screenshot(path=os.path.join(SHOTS, '学部_地点卡_西区5号楼.png'))
    gf.click('#mapCard .fac-photo'); gf.wait_for_timeout(700)
    f5 = gf.evaluate("(() => { const i = document.querySelector('.fac-figure img'); return {open: document.getElementById('modal').open, loaded: !!i && i.complete && i.naturalWidth > 300, cap: document.querySelector('.fac-figure figcaption')?.textContent || ''}; })()")
    gf.keyboard.press('Escape'); gf.wait_for_timeout(200)
    check('地点卡写出所属学部（7号楼→理工学部）；西区5号楼列出人文与艺术学部、继续教育学院、国际交流学院并能看门口立牌照片；名单没写的西区1号教学楼注明“没有写到”；点别的楼退出学部视图',
          f4['sel'] == 'e-teach7' and f4['fac'] == 'sci' and f4['chips'] == ['sci'] and f4['tag'] == '理工学部' and f4['after'] is None and f4['none'] and f4['w5'] == ['arts', 'cont', 'intl'] and f4['photo']
          and f5['open'] and f5['loaded'] and '人文与艺术学部' in f5['cap'], [f4, f5])
    gf.evaluate("document.querySelector('[data-act=clear-place]')?.click()")
    gf.fill('#placeSearch', '翻译'); gf.wait_for_timeout(350)
    s1 = gf.evaluate("({hits: [...document.querySelectorAll('.fac-hits [data-faculty]')].map(b => b.dataset.faculty), rows: [...document.querySelectorAll('.place-row')].map(r => r.dataset.place)})")
    gf.fill('#placeSearch', '马克思'); gf.wait_for_timeout(350)
    s2 = gf.evaluate("({hits: [...document.querySelectorAll('.fac-hits [data-faculty]')].map(b => b.dataset.faculty), rows: [...document.querySelectorAll('.place-row')].map(r => r.dataset.place), tag: document.querySelector('.place-row .row-fac')?.textContent})")
    gf.fill('#placeSearch', ''); gf.wait_for_timeout(200)
    check('按系、学院名称搜索：“翻译”找到英文学院和西区2/4号楼，“马克思”找到马克思主义学院（东区4号综合楼）',
          s1['hits'] == ['english'] and sorted(s1['rows']) == ['w-teach2', 'w-teach4'] and s2['hits'] == ['marx'] and s2['rows'] == ['e-office4'] and s2['tag'] == '马克思主义学院', [s1, s2])
    gf.click('#dim2dBtn'); gf.wait_for_function("document.body.dataset.dim === '2d'"); gf.wait_for_timeout(500); gf.click('#fitBtn'); gf.wait_for_timeout(800)
    f6 = gf.evaluate("({poly: document.querySelectorAll('#facOverlay polygon').length, stripes: [...document.querySelectorAll('#facOverlay pattern')].map(p => p.id).sort(), pins: document.querySelectorAll('#mapPins .pin.has-fac .pin-fac').length, layer: state.facLayer})")
    gf.screenshot(path=os.path.join(SHOTS, '学部分布_2D.png'))
    gf.click('.mini-tools [data-act=tool-original]'); gf.wait_for_timeout(400); f6['official'] = gf.evaluate("document.querySelectorAll('#facOverlay polygon').length"); gf.click('[data-act=back-map]'); gf.wait_for_timeout(300)
    check('平面地图上也按学部着色：%d 块楼面，西区4号、5号楼画条纹；楼名下写学部；学校原图上不叠色' % f6['poly'],
          f6['layer'] and f6['poly'] >= 13 and f6['stripes'] == ['fp-w-teach4', 'fp-w-teach5'] and f6['pins'] >= 2 and f6['official'] == 0, f6)
    gf.goto(URL + '?faculty=lang#explore', wait_until='networkidle'); gf.wait_for_timeout(1500)
    f7 = gf.evaluate("({fac: state.faculty, card: document.querySelector('#mapCard h3')?.textContent})")
    gf.evaluate("Indoor.open('e-teach6')"); gf.wait_for_timeout(300); f7['indoor'] = gf.evaluate("document.querySelector('#modalContent .section-label').textContent"); gf.keyboard.press('Escape')
    check('链接 ?faculty=lang 直接打开国际语言文化学院；6号楼A楼的楼内导航标题写着理工学部；学部功能无脚本错误',
          f7['fac'] == 'lang' and f7['card'] == '国际语言文化学院' and '理工学部' in f7['indoor'] and not ef, [f7, ef]); gf.close()
    mf = browser.new_page(viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Shanghai', has_touch=True, is_mobile=True); no_weather(mf, flat=False); emf = []
    mf.on('pageerror', lambda e: emf.append(str(e)))
    mf.goto(URL + '?faculty=english#explore', wait_until='networkidle'); mf.wait_for_timeout(2400)
    fm = mf.evaluate("(() => { const c = document.querySelector('#mapCard .fac-card').getBoundingClientRect(); return {wide: document.documentElement.scrollWidth <= innerWidth + 1, inside: c.left >= 0 && c.right <= innerWidth, fac: state.faculty}; })()")
    mf.screenshot(path=os.path.join(SHOTS, '学部_手机.png')); mf.close()
    check('手机上学部卡不出界、无横向滚动、无脚本错误', fm == {'wide': True, 'inside': True, 'fac': 'english'} and not emf, [fm, emf])

    # ---- V0.16: the main doors (red) and back doors (blue) the team marked on screenshots of the 3D map ----
    gd = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(gd, flat=False); ed = []
    gd.on('pageerror', lambda e: ed.append(str(e)))
    gd.goto(URL + '#explore', wait_until='networkidle'); gd.wait_for_function("typeof Map3D !== 'undefined' && Map3D.ok && Map3D.ready && !Map3D.busy()"); gd.wait_for_timeout(600)
    k1 = gd.evaluate("""(() => { const g = CAMPUS_ATLAS, P = new Map(g.places.map(p => [p.id, p])), m = g.survey.doorMarks, side = id => P.get(id).doors.map(d => d.kind[0] + d.side).join(' '), dorms = g.places.filter(p => p.category === '宿舍');
      return {n: [m.places.length, m.main, m.back], kinds: g.edges.filter(e => e.kind === 'door').reduce((o, e) => (o[e.doorKind] = (o[e.doorKind] || 0) + 1, o), {}), dorms: dorms.length,
        long: dorms.every(p => p.doors.every(d => d.kind === 'main' ? 'NS'.includes(d.side) : 'EW'.includes(d.side))), guess: g.places.some(p => (p.doors || []).some(d => d.src === '类推')),
        e18: side('east-18'), e17: side('east-17'), lib: side('library'), t10: side('e-teach10'), tech: side('tech'), note: P.get('library').accessNote}; })()""")
    check('团队标的正门、后门：%d 栋楼 %d 个正门、%d 个后门；%d 栋宿舍的正门都在长边，后门在山墙端；东18公寓正门按更正改到北面' % (k1['n'][0], k1['n'][1], k1['n'][2], k1['dorms']),
          k1['n'] == [63, 66, 37] and k1['kinds'] == {'main': 94, 'back': 37, 'side': 6} and k1['dorms'] == 34 and k1['long'] and not k1['guess'] and k1['e18'] == 'mN' and k1['e17'] == 'mN mS'
          and k1['lib'] == 'mS bS' and k1['t10'] == 'mE bW bW bW bE bE' and k1['tech'] == 'mW bN bE bS' and k1['note'] == '正门：南门（大台阶）；后门：南侧后门。门的位置依据团队在地图上的标注。', k1)
    gd.evaluate("pickPlace('east-18')"); gd.wait_for_timeout(200); gd.wait_for_function('!Map3D.busy()'); gd.wait_for_timeout(500)
    k2 = gd.evaluate("({note: document.querySelector('#mapCard .door-note')?.innerText.replace(/\\s+/g, ' ') || '', doors: Labels3D.all('door').map(l => l.text)})")
    check('东18公寓的地点卡和 3D 模型上都只标北面的正门，写明依据团队标注', k2['doors'] == ['正门 · 北门'] and '正门' in k2['note'] and '北门' in k2['note'] and '团队' in k2['note'] and '后门' not in k2['note'], k2)
    gd.evaluate("pickPlace('e-teach10')"); gd.wait_for_timeout(200); gd.wait_for_function('!Map3D.busy()'); gd.wait_for_timeout(600)
    k3 = gd.evaluate("({doors: Labels3D.all('door').map(l => l.text).sort(), badges: [...document.querySelectorAll('#mapCard .door-note b')].map(b => b.textContent + ':' + getComputedStyle(b).backgroundColor)})")
    gd.screenshot(path=os.path.join(SHOTS, '楼门_10号教学楼.png'))
    check('10号教学楼：内院门厅是正门，另有 5 个后门；3D 上逐个标出，卡片里正门棕色、后门蓝色',
          k3['doors'] == sorted(['正门 · 内院门厅', '后门 · 西北后门', '后门 · 西侧后门', '后门 · 西南后门', '后门 · 东北后门', '后门 · 东南后门'])
          and k3['badges'] == ['正门:rgb(107, 63, 34)'] + ['后门:rgb(61, 104, 137)'] * 5, k3)
    k4 = gd.evaluate("""(() => { const g = CAMPUS_ATLAS, last = (a, b) => Routing.plan(g, a, b, 12, 0, {day: 3, mode: 'inside'}).choices[0].edges.at(-1).name;
      return [last('east-16', 'east-18'), last('east-18', 'east-17'), last('east-16', 'east-17'), last('gate-south', 'e-teach8'), last('east-18', 'e-teach10')]; })()""")
    check('路线走到更近的门：去东18从北门进；东17南北各有正门，从东18来走南门、从东16来走北门；8号楼从南门方向走西门；从东18去10号楼走西侧后门',
          k4 == ['东18公寓北门', '东17公寓南门', '东17公寓北门', '东区8号教学楼西门（诒雅路）', '东区10号教学楼西侧后门'], k4)
    k5 = gd.evaluate("fetch('assets/campus.svg?v=' + BUILD).then(r => r.text()).then(t => ['main', 'back', 'side'].map(k => (t.match(new RegExp('data-door=\"' + k + '\"', 'g')) || []).length))")
    gd.click('#dim2dBtn'); gd.wait_for_function("document.body.dataset.dim === '2d'"); gd.wait_for_timeout(400); gd.evaluate("pickPlace('east-14')"); gd.wait_for_timeout(900)
    gd.screenshot(path=os.path.join(SHOTS, '楼门_平面图.png'))
    check('平面底图上画出 %d 个正门（棕色）、%d 个后门（蓝色）、%d 个侧门；楼门功能无脚本错误' % tuple(k5), k5 == [94, 37, 6] and not ed, [k5, ed]); gd.close()

    # ---- V2026.11.19: the flat map moves like the 3D one: it glides on, zooms smoothly and turns ----
    g2 = browser.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(g2); e2 = []
    g2.on('pageerror', lambda e: e2.append(str(e)))
    g2.goto(URL + '#explore', wait_until='networkidle'); g2.wait_for_timeout(900)
    box = g2.evaluate("(() => { const r = document.getElementById('mapViewport').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    cx, cy = box[0] + box[2] * .55, box[1] + box[3] * .5
    V = "({x: view.x, y: view.y, s: view.scale, r: view.rot})"
    g2.evaluate("document.querySelectorAll('#mapPins .pin').forEach(el => el.__mark = 1)")
    v0 = g2.evaluate(V); g2.mouse.move(cx, cy); g2.mouse.down()
    for i in range(1, 13): g2.mouse.move(cx + i * 12, cy + i * 3); g2.wait_for_timeout(16)
    held = g2.evaluate(V); kept = g2.evaluate("[...document.querySelectorAll('#mapPins .pin')].filter(el => el.__mark).length")
    g2.mouse.up(); g2.wait_for_timeout(1300); v1 = g2.evaluate(V)
    g2.mouse.move(cx, cy); g2.mouse.down()
    for i in range(1, 6): g2.mouse.move(cx - i * 10, cy); g2.wait_for_timeout(16)
    g2.wait_for_timeout(150); h2 = g2.evaluate('view.x'); g2.mouse.up(); g2.wait_for_timeout(500); still = abs(g2.evaluate('view.x') - h2) < 1
    check('平面地图拖动跟手，松手后顺势滑行一段再停下（%.0f 像素）；停住再松手不滑；拖动时地名标签沿用原来的元素，不重建' % (v1['x'] - held['x']),
          abs(held['x'] - v0['x'] - 144) < 2 and abs(held['y'] - v0['y'] - 36) < 2 and 30 < v1['x'] - held['x'] < 700 and v1['y'] > held['y'] and still and kept > 5, [v0, held, v1, still, kept])
    wx, wy = cx - 150, cy - 60; g2.mouse.move(wx, wy)
    m0 = g2.evaluate("(p => toMap(p[0], p[1]))", [wx - box[0], wy - box[1]]); s0 = g2.evaluate('view.scale')
    g2.mouse.wheel(0, -100); g2.wait_for_timeout(40); s_mid = g2.evaluate('view.scale'); g2.wait_for_timeout(450); s1 = g2.evaluate('view.scale')
    m1 = g2.evaluate("(p => toMap(p[0], p[1]))", [wx - box[0], wy - box[1]])
    check('平面地图滚轮缩放带缓动、以鼠标所指处为中心（一格 ×%.2f）' % (s1 / s0), s0 < s_mid < s1 and abs(s1 / s0 - 1.0017 ** 100) < .01 and abs(m1[0] - m0[0]) < 2 and abs(m1[1] - m0[1]) < 2, [s0, s_mid, s1, m0, m1])
    g2.evaluate("window.__cm = []; document.addEventListener('contextmenu', e => __cm.push(e.defaultPrevented))")
    g2.mouse.move(cx, cy); g2.mouse.down(button='right')
    for i in range(1, 11): g2.mouse.move(cx + i * 10, cy + i * 2); g2.wait_for_timeout(16)
    g2.mouse.up(button='right'); g2.wait_for_timeout(500)
    t1 = g2.evaluate("""(() => { const vr = document.getElementById('mapViewport').getBoundingClientRect();
      const pins = [...document.querySelectorAll('#mapPins .pin')].slice(0, 6).map(el => { const r = el.getBoundingClientRect(), s = toScreen(...places.get(el.dataset.place).official);
        return {upright: Math.abs(r.width - el.offsetWidth) < 1.5 && Math.abs(r.height - el.offsetHeight) < 1.5, off: Math.hypot(r.left + r.width / 2 - vr.left - s[0], r.bottom - vr.top - s[1])}; });
      return {rot: view.rot, menu: __cm, pins, needle: getComputedStyle(document.querySelector('.compass svg')).transform}; })()""")
    g2.screenshot(path=os.path.join(SHOTS, '平面地图_右键旋转.png'))
    g2.click('.compass'); g2.wait_for_timeout(600); north = g2.evaluate('view.rot')
    g2.click('#rot3d'); g2.wait_for_timeout(600); r45 = g2.evaluate('view.rot')
    g2.focus('#mapViewport'); g2.keyboard.press('q'); g2.keyboard.press('q'); g2.wait_for_timeout(700); rq = g2.evaluate('view.rot')
    check('平面地图按住右键拖动旋转（%.0f°，与 3D 一样每像素 0.35°），不弹浏览器菜单；地名标签保持正立、仍指在原处；指北针跟着转，点它回到正北；转 45° 按钮和 Q / E 键也能转，连按会累加' % t1['rot'],
          abs(t1['rot'] - 35) < .5 and t1['menu'] == [True] and len(t1['pins']) >= 3 and all(q['upright'] and q['off'] < 1.5 for q in t1['pins']) and t1['needle'] != 'none'
          and abs(north) < .01 and abs(r45 + 45) < .5 and abs(rq + 15) < .5, [t1, north, r45, rq])
    g2.evaluate("pickPlace('library')"); g2.wait_for_timeout(900)
    pk = g2.evaluate("(() => { const p = places.get('library'), s = toScreen(p.x, p.y), v = document.getElementById('mapViewport'); return {rot: view.rot, dx: s[0] - v.clientWidth / 2}; })()")
    g2.click('#dim3dBtn'); g2.wait_for_function("document.body.dataset.dim === '3d' && !switching", timeout=9000); g2.wait_for_timeout(300); b3 = g2.evaluate('Map3D.view().bearing')
    g2.click('#dim2dBtn'); g2.wait_for_function("document.body.dataset.dim === '2d' && !switching", timeout=9000); g2.wait_for_timeout(300); r2 = g2.evaluate('view.rot')
    g2.click('#fitBtn'); g2.wait_for_timeout(800); r0 = g2.evaluate('view.rot')
    check('转过的平面地图选中地点时保持朝向、把地点放到中间；切到 3D 朝向不变（%.0f°），切回平面也不变；全校概览回到正北；无脚本错误' % b3,
          abs(pk['rot'] + 15) < .5 and abs(pk['dx']) < 3 and abs(b3 - 15) < .5 and abs(r2 + 15) < .5 and abs(r0) < .01 and not e2, [pk, b3, r2, r0, e2]); g2.close()
    tp = browser.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True, device_scale_factor=2, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(tp)
    t = tp.new_page(); et = []; t.on('pageerror', lambda e: et.append(str(e)))
    t.goto(URL + '#explore', wait_until='networkidle'); t.wait_for_timeout(900); tc = tp.new_cdp_session(t)
    def touch(kind, pts): tc.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    def swipe(x, y, dx, dy, n=15):
        u0 = t.evaluate(V); touch('touchStart', [(x, y)])
        for i in range(1, n + 1): touch('touchMove', [(x + dx * i, y + dy * i)]); t.wait_for_timeout(16)
        u1 = t.evaluate(V); touch('touchEnd', []); t.wait_for_timeout(1100); return u0, u1, t.evaluate(V)
    a0, a1, a2 = swipe(200, 330, -6, 3)
    pin = t.evaluate("(() => { const vr = document.getElementById('mapViewport').getBoundingClientRect(); for (const el of document.querySelectorAll('#mapPins .pin')) { const r = el.getBoundingClientRect(); if (r.top > vr.top + 120 && r.bottom < vr.bottom - 160 && r.left > 30 && r.right < innerWidth - 90) return [r.left + r.width / 2, r.top + r.height / 2]; } return null; })()")
    b0, b1, b2 = swipe(pin[0], pin[1], 5, 2) if pin else ({'x': 0}, {'x': 0}, {})
    s0 = t.evaluate(V); touch('touchStart', [(160, 300), (240, 340)])
    for i in range(1, 21): touch('touchMove', [(160 - i * 2, 300 - i * 1.4), (240 + i * 2, 340 + i * .6)]); t.wait_for_timeout(16)
    touch('touchEnd', []); t.wait_for_timeout(400); s1 = t.evaluate(V)
    ctr, rad = (200, 330), 60; w0 = t.evaluate(V); touch('touchStart', [(ctr[0] - rad, ctr[1]), (ctr[0] + rad, ctr[1])])
    for i in range(1, 31):
        q = math.radians(2 * i); touch('touchMove', [(ctr[0] - rad * math.cos(q), ctr[1] - rad * math.sin(q)), (ctr[0] + rad * math.cos(q), ctr[1] + rad * math.sin(q))]); t.wait_for_timeout(16)
    touch('touchEnd', []); t.wait_for_timeout(500); w1 = t.evaluate(V)
    t.screenshot(path=os.path.join(SHOTS, '平面地图_手机双指旋转.png'))
    check('手机平面地图：单指拖动跟手并滑行；从地名标签上开始拖也一直跟手；双指捏合只缩放不转（×%.1f），明确地拧一下才旋转（%.0f°）；无脚本错误' % (s1['s'] / s0['s'], w1['r'] - w0['r']),
          abs(a1['x'] - a0['x'] + 90) < 2 and abs(a1['y'] - a0['y'] - 45) < 2 and a2['x'] < a1['x'] - 10 and pin and abs(b1['x'] - b0['x'] - 75) < 2
          and s1['s'] / s0['s'] > 1.5 and s1['r'] == 0 and 20 < w1['r'] - w0['r'] < 61 and abs(w1['s'] / w0['s'] - 1) < .02 and not et, [a0, a1, a2, pin, b0, b1, s0, s1, w0, w1, et]); tp.close()

    m3 = browser.new_page(viewport={'width': 390, 'height': 800}, locale='zh-CN', timezone_id='Asia/Shanghai', has_touch=True, is_mobile=True); no_weather(m3, summer=True, flat=False); em = []
    m3.on('pageerror', lambda e: em.append(str(e)))
    m3.goto(URL + '?from=east-16&to=library&day=3&hour=10&mode=inside&detour=0.2#route', wait_until='networkidle'); m3.wait_for_timeout(2600)
    mm = m3.evaluate("({dim: document.body.dataset.dim, ok: Map3D.ok, rib: Map3D.ribbons().route, wide: document.documentElement.scrollWidth <= innerWidth + 1, pins: Labels3D.all('pin').length})")
    check('手机上也是 3D：路线画出、无横向滚动', mm['dim'] == '3d' and mm['ok'] and mm['rib'] > 5 and mm['wide'] and mm['pins'] >= 2 and not em, [mm, em])
    m3.screenshot(path=os.path.join(SHOTS, '3D_手机.png')); m3.close()

    # ---- phone ----
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='zh-CN', timezone_id='Asia/Shanghai'); no_weather(ctx)
    m = ctx.new_page(); merr = []
    m.on('pageerror', lambda e: merr.append(str(e)))
    m.goto(URL + '#route', wait_until='networkidle')
    m.select_option('#startPlace', 'east-16'); m.select_option('#endPlace', 'west-17')
    m.select_option('#travelDay', '4'); m.wait_for_timeout(300)
    check('手机端周四只走校内', '天渡' in m.inner_text('#routeResults'))
    wide = m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    check('手机端无横向滚动', wide)
    check('手机端页眉有天气入口，路线页有天气设定', m.locator('#wxChip').is_visible() and m.locator('.sky-pick button').count() == 5)
    m.wait_for_timeout(1500)
    head = m.evaluate("(() => { const b = document.getElementById('liveBtn').getBoundingClientRect(), h = document.querySelector('.site-head').getBoundingClientRect(); return b.height < 44 && b.right <= h.right + 1; })()")
    check('手机端页眉按钮不换行、不出界', head)
    m.screenshot(path=os.path.join(SHOTS, '手机_周四经天渡.png'))
    check('手机端无脚本错误', not merr, merr)
    verify_showcase(browser)
    browser.close()

print('\n' + ('全部通过' if not failed else f'{len(failed)} 项失败: ' + '；'.join(failed)))
sys.exit(1 if failed else 0)
