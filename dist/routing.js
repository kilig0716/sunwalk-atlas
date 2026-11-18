'use strict';
const Routing = (() => {
  const speed = 1.25;
  const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
  function today(){
    const name=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short'}).format(new Date());
    return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(name)+1;
  }
  function outsideAllowed(graph,day){return (graph.rules?.outsideDays||[3,5,6,7]).includes(day);}
  // Samples follow shadeModel.hours (07 … 19); a three-value array is the old 08 / 12 / 16 form.
  function shadeAt(samples, hour, hours) {
    if (!Array.isArray(samples) || !samples.length || samples.some(x=>!Number.isFinite(x))) return null;
    hours = hours && hours.length===samples.length ? hours : samples.length===3 ? [8,12,16] : (globalThis.CAMPUS_ATLAS?.shadeModel?.hours || []);
    if (hours.length !== samples.length) return null;
    const last = hours.length-1;
    if (hour <= hours[0]) return samples[0];
    if (hour >= hours[last]) return samples[last];
    let i = 0; while (hour > hours[i+1]) i++;
    return samples[i] + (samples[i+1]-samples[i]) * (hour-hours[i]) / (hours[i+1]-hours[i]);
  }
  // Gates: from 21:00 (until 06:00, assumed) students may come in but not go out.
  function isNight(graph,h){const r=graph.rules?.nightEntryOnly||{from:21,assumedUntil:6};return h>=r.from||h<(r.assumedUntil??6);}
  function daylight(graph,h){const m=graph.shadeModel||{};return h>=(m.sunrise??6.3)&&h<=(m.sunset??19.1);}
  // `sun` is the share of direct sunlight the weather lets through (1 clear sky … 0 rain); it scales every exposure.
  // A building's doors lead to one indoor point. Those door links are open only for the two buildings the trip starts and ends in,
  // so a route can use whichever door is nearer but never cuts through somebody else's building.
  function adjacency(graph,hour,policy,sun=1,doors=null){
    const adj = Object.fromEntries(Object.keys(graph.nodes).map(id=>[id,[]]));
    const late=isNight(graph,hour), dark=!daylight(graph,hour), hours=graph.shadeModel?.hours;
    graph.edges.forEach((e,index)=>{
      const role=e.role||'campus';
      if(e.closed || e.meters<=0 || !adj[e.a] || !adj[e.b]) return;
      if(e.door&&!(doors&&doors.has(e.door)))return;
      if(policy==='inside'&&['outside','gate'].includes(role)||policy==='outside'&&role==='skybridge')return;
      const shade=dark?null:shadeAt(e.shade,hour,hours), seconds=e.meters/speed;
      const values={index,name:e.name||'校园步道',role,kind:e.kind,door:e.door,meters:e.meters,seconds,exposure:shade===null?0:seconds*(1-shade)*sun,unknown:dark?0:shade===null?seconds*sun:0,shade};
      if(late&&role==='gate'){const out=e.out??(String(e.a).startsWith('o')?e.a:e.b),inside=out===e.a?e.b:e.a;adj[out].push({...values,to:inside});return;}
      adj[e.a].push({...values,to:e.b}); adj[e.b].push({...values,to:e.a});
    });
    return adj;
  }
  // Dijkstra with a min heap supplies exact remaining-distance lower bounds.
  function distances(adj,end){
    // walk the edges backwards so one-way gates are measured in the direction of travel
    const rev=Object.fromEntries(Object.keys(adj).map(id=>[id,[]]));for(const id in adj)for(const e of adj[id])rev[e.to].push({to:id,meters:e.meters});
    const d=Object.fromEntries(Object.keys(adj).map(id=>[id,Infinity])),heap=[];
    function push(v){let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p][0]<=v[0])break;heap[i]=heap[p];i=p;}heap[i]=v;}
    function pop(){const result=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return result;}
    d[end]=0;push([0,end]);
    while(heap.length){const [cost,id]=pop();if(cost!==d[id])continue;for(const e of rev[id])if(cost+e.meters<d[e.to]){d[e.to]=cost+e.meters;push([d[e.to],e.to]);}}
    return d;
  }
  function candidates(adj,distance,start,end,limit){
    const labels=new Map(),result=[],queue=[{id:start,ids:[start],edges:[],meters:0,exposure:0,unknown:0}];
    // Nonnegative costs: loops cannot improve a nondominated label.
    // Each complete inside/outside policy keeps its own label set.
    for(let cursor=0;cursor<queue.length;cursor++){
      const p=queue[cursor],risk=p.exposure+p.unknown,seen=labels.get(p.id)||[];
      if(p.meters+distance[p.id]>limit+.00001||seen.some(l=>l.meters<=p.meters&&l.risk<=risk))continue;
      labels.set(p.id,[...seen.filter(l=>l.meters<p.meters||l.risk<risk),{meters:p.meters,risk}]);
      if(p.id===end){result.push({...p,seconds:p.meters/speed});continue;}
      for(const e of adj[p.id])if(p.meters+e.meters+distance[e.to]<=limit+.00001){
        queue.push({id:e.to,ids:[...p.ids,e.to],edges:[...p.edges,e],meters:p.meters+e.meters,exposure:p.exposure+e.exposure,unknown:p.unknown+e.unknown});
      }
    }
    return result;
  }
  function plan(graph,start,end,hour,detour,options={}){
    const day=options.day??today(),mode=options.mode??'auto';
    if(!Number.isInteger(day)||day<1||day>7||!['auto','inside','outside'].includes(mode))return {error:'请选择有效的出行星期和通行方式。'};
    if(!Number.isFinite(hour)||hour<0||hour>=24)return {error:'请选择 00:00 至 24:00 之间的出发时刻。'};
    const late=isNight(graph,hour),dark=!daylight(graph,hour),sun=options.sun??1;
    if(!Number.isFinite(sun)||sun<0||sun>1)return {error:'天气的日照系数须在 0 至 1 之间。'};
    const noSun=dark||sun===0;
    if(!Number.isFinite(detour)||detour<0||detour>.4)return {error:'绕行比例须在 0% 至 40% 之间。'};
    if(start===end)return {error:'起点和终点相同，请换一个地点。'};
    const doors=new Set([start,end]);
    start=graph.access?.[start]||start;end=graph.access?.[end]||end;
    if(!graph.nodes[start]||!graph.nodes[end])return {error:'请选择可用的起点和终点。'};
    const outside=outsideAllowed(graph,day);
    if(mode==='outside'&&!outside)return {error:weekdays[day-1]+'禁止出校，校外路线不可用。请选「自动比较」或「只走校内」。',day,mode,outsideAllowed:false};
    const policies=mode==='inside'||!outside?['inside']:mode==='outside'?['outside']:['inside','outside'];
    const searches=policies.map(policy=>{const adj=adjacency(graph,hour,policy,sun,doors);return {adj,d:distances(adj,end)};});
    const baseline=Math.min(...searches.map(s=>s.d[start]));
    if(!Number.isFinite(baseline))return {error:late&&mode==='outside'?'晚上 21:00 后所有校门学生只进不出，不能出校。请选「自动比较」或「只走校内」，跨区走西译天渡。':mode==='outside'?'当前起终点没有经校外的可用连接；天渡只能从校内到达。':'当前通行条件下两点不可达，请检查天渡、校门和道路状态。',day,mode};
    const all=searches.flatMap(s=>Number.isFinite(s.d[start])?candidates(s.adj,s.d,start,end,baseline*(1+detour)):[]);
    const choices=[];
    (noSun?[[dark?'夜间最短':options.sunless||'无日照最短',p=>p.meters]]:[['距离优先',p=>p.meters],['少晒优先',p=>p.exposure+p.unknown],['折中方案',p=>p.seconds+p.exposure+p.unknown]]).forEach(([label,score])=>{
      const chosen=all.reduce((best,p)=>score(p)<score(best) || (score(p)===score(best)&&p.meters<best.meters)?p:best);
      const existing=choices.find(x=>x.ids.join('|')===chosen.ids.join('|'));
      if(existing) existing.labels.push(label); else choices.push({...chosen,labels:[label],usesOutside:chosen.edges.some(e=>['outside','gate'].includes(e.role)),usesSkybridge:chosen.edges.some(e=>e.role==='skybridge')});
    });
    return {baseline,choices,total:all.length,day,mode,late,dark,sun,noSun,outsideAllowed:outside};
  }
  return {speed,shadeAt,plan,today,weekdays,outsideAllowed,isNight,daylight,adjacency};
})();
