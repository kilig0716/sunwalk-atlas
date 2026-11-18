const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const env=vm.createContext({window:{},Intl,Date});
for(const f of ['assets/atlas-data.js','routing.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'dist',f),'utf8'),env);
const g=env.window.CAMPUS_ATLAS,R=vm.runInContext('Routing',env);
let failed=0;
function test(name,fn){try{fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name+':',e.message);}}
test('宾馆接近点必须在建筑右侧',()=>{const p=g.places.find(p=>p.id==='guest');assert.ok(p.access[0]>Math.max(...p.footprint.map(v=>v[0])));assert.match(p.approach,/右侧/);});
test('原图明确标注的遗漏要素进入网页',()=>{
  for(const id of ['e-dining-jian','e-plaza-hua','e-plaza-ming','w-gate-guard','w-pingpong','e-dining-shan','e-engineering-lab','w-yibo','w-carpentry','w-greenhouse','w-power','e-bridge-xiang','e-bridge-du','e-bridge-tong','e-bridge-rui','e-bridge-an','w-fang-garden'])assert.ok(g.places.some(p=>p.id===id),id);
});
test('禁出校日拒绝校外方式',()=>{for(const day of [1,2,4])assert.ok(R.plan(g,'east-16','west-17',12,.2,{day,mode:'outside'}).error,`day ${day}`);});
test('开放日校外跨区必须经西区正门，且不含天渡',()=>{for(const day of [3,5,6,7]){const r=R.plan(g,'east-16','west-17',12,.2,{day,mode:'outside'});assert.ok(!r.error,r.error);for(const p of r.choices){assert.ok(p.edges.some(e=>e.role==='outside'));assert.ok(p.ids.includes(g.access['west-gate']));assert.ok(!p.edges.some(e=>e.role==='skybridge'));}}});
test('禁出校日保留校内天渡路线',()=>{for(const day of [1,2,4]){const r=R.plan(g,'east-16','west-17',12,.2,{day,mode:'auto'});assert.ok(!r.error,r.error);assert.ok(r.choices.every(p=>p.edges.some(e=>e.role==='skybridge')&&!p.edges.some(e=>['outside','gate'].includes(e.role))));}});
test('天渡与地面道路无共用节点',()=>{const sky=new Set(g.edges.filter(e=>e.role==='skybridge').flatMap(e=>[e.a,e.b]));assert.ok(sky.size);for(const e of g.edges.filter(e=>e.role==='outside'))assert.ok(!sky.has(e.a)&&!sky.has(e.b));});
test('关闭天渡或西区正门后不能绕过规则',()=>{
  const closed={...g,edges:g.edges.map(e=>({...e,closed:e.role==='skybridge'}))};
  assert.ok(R.plan(closed,'east-16','west-17',12,.2,{day:1,mode:'auto'}).error);
  assert.ok(!R.plan(closed,'east-16','west-17',12,.2,{day:3,mode:'auto'}).error);
  const shut={...g,edges:g.edges.map(e=>({...e,closed:e.role==='gate'&&[e.a,e.b].includes(g.access['west-gate'])}))};
  assert.ok(R.plan(shut,'east-16','west-17',12,.2,{day:3,mode:'outside'}).error);
});
test('无效星期与方式不可绕过通行校验',()=>{
  for(const day of [0,8,NaN,1.5])assert.ok(R.plan(g,'east-16','west-17',12,.2,{day}).error);
  assert.ok(R.plan(g,'east-16','west-17',12,.2,{day:3,mode:'anything'}).error);
});
test('西区所有地面连接仅在正门',()=>{
  const westGate=g.access['west-gate'];let entries=0;
  for(const e of g.edges.filter(e=>e.role==='gate'))if(Math.min(g.nodes[e.a][0],g.nodes[e.b][0])<1065){entries++;assert.ok([e.a,e.b].includes(westGate));}
  assert.equal(entries,1);
});
test('七天所有住宿点跨区路线合法且不混用天渡与校外',()=>{
  let count=0;
  for(let day=1;day<=7;day++)for(const mode of ['auto','inside','outside'])for(const dest of g.places.filter(p=>p.category==='宿舍')){
    const start=dest.zone==='东区'?'west-17':'east-16';
    const r=R.plan(g,start,dest.id,12,.4,{day,mode});
    if(mode==='outside'&&[1,2,4].includes(day)){assert.ok(r.error);continue;}
    assert.ok(!r.error,`${day} ${mode} ${dest.id}: ${r.error}`);
    for(const p of r.choices){
      const sky=p.edges.some(e=>e.role==='skybridge'),outside=p.edges.some(e=>['outside','gate'].includes(e.role));
      assert.ok(!(sky&&outside));assert.ok(sky||outside);assert.ok(p.meters<=r.baseline*1.4+.001);
      if([1,2,4].includes(day)||mode==='inside')assert.ok(sky&&!outside);
      if(mode==='outside'){assert.ok(outside&&!sky);assert.ok(p.ids.includes(g.access['west-gate']));}
    }
    count++;
  }
  console.log('  verified',count,'available dorm/day/mode cases');
});
test('开放日自动路线距离与独立 Dijkstra 一致',()=>{
  function oracle(start,end,policy){
    const d=new Map(Object.keys(g.nodes).map(id=>[id,Infinity])),remaining=new Set(d.keys());d.set(start,0);
    const edges=g.edges.filter(e=>!e.closed&&(policy==='inside'?!['outside','gate'].includes(e.role):e.role!=='skybridge'));
    while(remaining.size){let u=null;for(const id of remaining)if(u===null||d.get(id)<d.get(u))u=id;
      if(!Number.isFinite(d.get(u))||u===end)break;remaining.delete(u);
      for(const e of edges){let v=e.a===u?e.b:e.b===u?e.a:null;if(v!==null&&remaining.has(v))d.set(v,Math.min(d.get(v),d.get(u)+e.meters));}
    }return d.get(end);
  }
  for(const a of ['east-16','guest','library','w-yibo','west-17','e-bridge-an'])for(const b of g.places){
    if(a===b.id)continue;
    const expected=Math.min(oracle(g.access[a],g.access[b.id],'inside'),oracle(g.access[a],g.access[b.id],'outside'));
    const actual=R.plan(g,a,b.id,12,0,{day:3,mode:'auto'});
    assert.equal(actual.baseline,expected,a+' → '+b.id);assert.ok(actual.choices.every(p=>p.meters===expected));
  }
});
if(failed)process.exitCode=1;
