// Run with Node. The routing checks need no packages. Browser checks are optional.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'dist');
const env=vm.createContext({window:{}});
for(const file of ['assets/atlas-data.js','assets/geo-data.js','assets/scenes.js','routing.js','directory.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),env);
}
const graph=env.window.CAMPUS_ATLAS,tour=env.window.CAMPUS_TOUR;
const routing=vm.runInContext('Routing',env);
assert.equal(tour.scenes.length,140);
for(const scene of tour.scenes){
  assert.match(scene.href,/^https:\/\/www\.720yun\.com\/vr\/a2bjzOkfrk4\?s=\d+$/);
  if(scene.photo)assert.ok(fs.existsSync(path.join(root,'assets',scene.photo)));
  if(scene.cube)for(const face of 'frblud')assert.ok(fs.existsSync(path.join(root,'assets',scene.cube.replace('{face}',face))));
}
assert.equal(tour.scenes.filter(s=>s.cube).length,4);
for(const p of graph.places){assert.ok(p.official[0]>0&&p.official[0]<graph.official.width&&p.official[1]>0&&p.official[1]<graph.official.height);}
const directory=vm.runInContext('Directory',env);
const dorms=graph.places.filter(p=>p.category==='宿舍');
assert.equal(dorms.length,34);
assert.equal(graph.places.filter(p=>p.category==='教工').length,5);
for(const term of ['东16','东十六','东区16号宿舍楼','东１６公寓']){
  assert.deepEqual(Array.from(dorms.filter(p=>directory.matches(p,term)),p=>p.id),['east-16']);
}
assert.ok(!dorms.some(p=>directory.matches(p,'西9')));
let count=0,longest=0;
for(const a of graph.places)for(const b of graph.places){
  const before=performance.now(),r=routing.plan(graph,a.id,b.id,12,.2);
  longest=Math.max(longest,performance.now()-before);
  if(a.id===b.id){assert.ok(r.error);continue;}
  assert.ok(!r.error,a.name+' → '+b.name+' '+r.error);count++;
  for(const path of r.choices){
    assert.ok(path.meters<=r.baseline*1.2+.0001);
    assert.equal(path.ids[0],graph.access[a.id]);assert.equal(path.ids.at(-1),graph.access[b.id]);
    assert.equal(path.edges.reduce((sum,e)=>sum+e.meters,0),path.meters);
    assert.ok(path.edges.every(e=>e.name));
  }
}
for(const a of dorms)for(const h of [8,10.5,16])for(const detour of [0,.1,.4]){
  const r=routing.plan(graph,'gate',a.id,h,detour);
  assert.ok(r.choices.every(c=>c.meters<=r.baseline*(1+detour)+.01));
}
console.log('PASS',count,'ordered building pairs;',dorms.length,'dorms; slowest route',Math.round(longest),'ms; assets and aliases OK');
if(process.argv.includes('--browser'))browser().catch(e=>{console.error(e);process.exitCode=1});
async function browser(){
  const {chromium}=require('playwright'),out=process.env.SUNWALK_QA;
  const b=await chromium.launch({channel:'msedge'});
  try{
    const ctx=await b.newContext({viewport:{width:1440,height:900},permissions:['geolocation'],geolocation:{latitude:34.02810,longitude:109.00399,accuracy:12}});
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(6000);
    const base=process.env.SUNWALK_URL||'http://127.0.0.1:8863';
    const click=s=>p.locator(s).first().click();
    async function snap(name){if(out)await p.screenshot({path:path.join(out,name+'.png')});}
    await p.goto(base,{waitUntil:'domcontentloaded'});await p.waitForSelector('.pin');await snap('desktop-v2');
    await click('[data-cat-filter="宿舍"]');await p.locator('#placeSearch').fill('东十六');assert.equal(await p.locator('.place-row').count(),1);
    await click('.place-row');await click('[data-save="east-16"]');await click('[data-route-to="east-16"]');
    await p.selectOption('#startPlace','west-17');await p.waitForSelector('.route-line',{state:'attached'});await snap('route-v2');
    await click('[data-act="begin-steps"]');assert.match(await p.locator('#mapCard').innerText(),/分步导览/);
    await click('[data-act="next-step"]');await click('[data-act="end-steps"]');await click('#officialBtn');
    assert.ok(await p.locator('.route-line').count());await click('[data-act="segments"]');await p.keyboard.press('Escape');
    const dl=p.waitForEvent('download');await click('[data-act="export"]');assert.match((await dl).suggestedFilename(),/svg$/);
    await click('[data-act="near-start"]');await click('[data-act="start-geo"]');await p.waitForSelector('[data-near="library"]');await click('[data-near="library"]');
    assert.equal(await p.locator('#startPlace').inputValue(),'library');assert.equal(await p.locator('#endPlace').inputValue(),'east-16');
    await click('#liveBtn');await click('[data-act="stop-geo"]');
    await click('#atlasBtn');await click('#nav [data-tab="pano"]');await p.waitForSelector('.vr-room img');await click('[data-vr="1"]');
    await click('#nav [data-tab="explore"]');await click('#amapBtn');await p.waitForSelector('#providerMap iframe');
    assert.match(await p.locator('#providerMap iframe').getAttribute('src'),/www\.amap\.com\/ssr\/embed\//);
    await click('#aboutBtn');await click('#modal [data-act="settings"]');await p.locator('#webMapKey').fill('invalid');await click('[data-act="apply-provider"]');assert.match(await p.locator('#configError').innerText(),/32/);await p.keyboard.press('Escape');
    await p.setViewportSize({width:390,height:844});await p.goto(base,{waitUntil:'domcontentloaded'});await p.waitForSelector('.pin');await snap('mobile-v2');
    await p.locator('#placeSearch').fill('西17');await click('.place-row');await click('[data-route-to="west-17"]');await click('[data-act="begin-steps"]');
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('mobile-guidance-v2');
    await p.goto(base+'/?place=east-16#explore');await p.waitForSelector('[data-route-to="east-16"]');
    assert.deepEqual(errs,[]);console.log('PASS desktop/mobile: search, favourite, cross-campus route, official plan, guidance, export, GPS origin, panorama, AMap, config validation and shared place');
  }finally{await b.close();}
}



