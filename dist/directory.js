'use strict';
const Directory=(()=>{
  const digits='零一二三四五六七八九';
  function normalize(s){
    return String(s||'').normalize('NFKC').toLowerCase().replace(/两/g,'二').replace(/[一二三四五六七八九十]+/g,m=>{
      if(!m.includes('十'))return String(digits.indexOf(m));
      const [a,b]=m.split('十');return String((a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0));
    }).replace(/西安翻译学院|校区|校内|学生宿舍|学生公寓|宿舍楼|公寓楼|宿舍|公寓|号楼|号|区|[\s·-]/g,'');
  }
  function matches(p,query){
    if(!query.trim())return true;
    const needle=normalize(query);
    const numbered=/^([东西]?)(\d+)$/.exec(needle);
    if(numbered)return (p.category==='宿舍'&&p.number===+numbered[2]&&(!numbered[1]||p.zone.startsWith(numbered[1])))||(!/宿舍|公寓/.test(query)&&[p.name,...(p.aliases||[])].some(n=>normalize(n)===needle));
    return [p.name,p.zone+p.name,p.category,...(p.aliases||[])].some(n=>needle?normalize(n).includes(needle):n.includes(query));
  }
  function loadSaved(){try{const v=JSON.parse(localStorage.getItem('sunwalk.saved')||'[]');return new Set(Array.isArray(v)?v:[]);}catch{return new Set();}}
  const saved=loadSaved();
  function toggle(id){if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem('sunwalk.saved',JSON.stringify([...saved]));}catch{}}
  function steps(result,nodes){
    const list=[];
    result.edges.forEach((e,i)=>{
      const a=nodes[result.ids[i]],b=nodes[e.to];
      const direction=['东','东南','南','西南','西','西北','北','东北'][(Math.round(Math.atan2(b[1]-a[1],b[0]-a[0])/(Math.PI/4))+8)%8];
      const prev=list.at(-1);
      if(prev&&prev.name===e.name&&prev.direction===direction&&prev.role===e.role){prev.meters+=e.meters;prev.last=i;}
      else list.push({name:e.name,direction,first:i,last:i,meters:e.meters,role:e.role});
    });
    // Tiny frontage connectors can sit only a pixel away from a junction.
    // Account for their length without asking the walker to turn for one metre.
    for(let i=list.length-1;i>=0&&list.length>1;i--){
      if(list[i].meters>5||['gate','skybridge'].includes(list[i].role))continue;
      const small=list[i],next=list[i+1]||list[i-1];
      next.meters+=small.meters;next.first=Math.min(next.first,small.first);next.last=Math.max(next.last,small.last);list.splice(i,1);
    }
    return list;
  }
  return {matches,normalize,saved,toggle,steps};
})();
