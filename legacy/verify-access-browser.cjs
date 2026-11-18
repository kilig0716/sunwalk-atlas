const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=process.env.SUNWALK_QA||path.join(__dirname,'..','qa');
const url=process.env.SUNWALK_URL||'http://127.0.0.1:8875';
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge'});
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
      const mobile=viewport.width<680,tag=mobile?'mobile':'desktop';
      const click=selector=>page.locator(selector).first().click();
      await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('.pin');
      await click('[data-act="coverage"]');assert.equal(await page.locator('[data-inspect]').count(),await page.evaluate(()=>window.CAMPUS_ATLAS.places.length));
      await click('[data-inspect="w-greenhouse"]');assert.equal(await page.locator('#mapCard h3').innerText(),'花房');
      assert.match(await page.locator('#mapCard .caption').innerText(),/西区/);
      await click('[data-route-to="w-greenhouse"]');
      await page.selectOption('#startPlace','east-16');await page.selectOption('#endPlace','west-17');
      await page.selectOption('#travelDay','1');await page.selectOption('#travelMode','auto');
      assert.match(await page.locator('#mapCard').innerText(),/经西译天渡/);
      assert.match(await page.locator('#accessLegend').innerText(),/校外禁行/);
      assert.ok(await page.locator('.route-line[stroke="#337db8"]').count());
      assert.equal(await page.locator('.route-line[stroke="#b57428"]').count(),0);
      await click('[data-act="begin-steps"]');
      await page.selectOption('#travelMode','outside');
      assert.equal(await page.locator('.route-line').count(),0);
      assert.match(await page.locator('#routeResults').innerText(),/周一禁止出校/);
      assert.equal(await page.locator('[data-act="next-step"]').count(),0);
      await page.selectOption('#travelDay','3');
      assert.match(await page.locator('#mapCard').innerText(),/校外通行/);
      assert.ok(await page.locator('.route-line[stroke="#b57428"]').count());
      assert.equal(await page.locator('.route-line[stroke="#337db8"]').count(),0);
      await page.screenshot({path:path.join(out,'sunwalk-v3-'+tag+'-outside.png')});
      const download=page.waitForEvent('download');await click('[data-act="export"]');
      const file=await download;const content=fs.readFileSync(await file.path(),'utf8');
      assert.match(content,/周三/);assert.match(content,/西区仅经正门/);
      await click('#officialBtn');
      assert.equal(await page.locator('#accessOverlay').getAttribute('viewBox'),'0 0 2048 1568');
      assert.equal(await page.locator('#pathOverlay').getAttribute('viewBox'),'0 0 2048 1568');
      await page.selectOption('#travelDay','4');
      assert.equal(await page.locator('.route-line').count(),0);assert.match(await page.locator('#mapCard').innerText(),/周四禁止出校/);
      await click('[data-act="use-inside"]');assert.match(await page.locator('#mapCard').innerText(),/经西译天渡/);
      await click('#atlasBtn');await click('[data-act="access-focus"]');
      await page.screenshot({path:path.join(out,'sunwalk-v3-'+tag+'-skybridge.png')});
      await click('[data-act="access-rules"]');assert.match(await page.locator('#modal').innerText(),/宾馆右侧/);await page.keyboard.press('Escape');
      await click('#nav [data-tab="explore"]');
      const additions=await page.evaluate(()=>window.CAMPUS_ATLAS.places.filter(p=>p.addedInCompletion).map(p=>({id:p.id,name:p.name})));
      for(const place of additions){await page.locator('#placeSearch').fill(place.name);assert.ok(await page.locator('#placeList [data-place="'+place.id+'"]').count(),place.name);}
      await page.locator('#placeSearch').fill('西译宾馆');await click('#placeList [data-place="guest"]');
      await page.screenshot({path:path.join(out,'sunwalk-v3-'+tag+'-hotel.png')});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);console.log('PASS',tag,'full inventory entries, added searches, weekday/mode invalidation, skybridge/main gate colours, source-map alignment, exported policy, hotel view');
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
