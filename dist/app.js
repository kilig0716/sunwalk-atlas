'use strict';
const $=id=>document.getElementById(id);
const BUILD='20261119';   // also used by index.html
const atlas=window.CAMPUS_ATLAS, tour=window.CAMPUS_TOUR, geo=window.GEO_CAMPUS;
const places=new Map(atlas.places.map(p=>[p.id,p])), scenes=new Map(tour.scenes.map(s=>[s.id,s]));
const localPano=new Set(window.PANO_LOCAL||[]);
for(const s of tour.scenes){if(localPano.has(s.id)){if(!s.cube)s.cube='pano/'+s.id+'/{face}.webp';if(!s.photo)s.photo='pano/'+s.id+'/thumb.webp';}}
// Scenes without a local photo are shown from the original 720 云 work (the image server refuses scripted downloads).
const tourUrl='https://www.720yun.com/vr/a2bjzOkfrk4',sceneUrl=id=>tourUrl+'?s='+id;
const hasImage=s=>!!(s&&(s.photo||s.cube));
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion=motionPreference.matches;
function setHtml(el,html){if(el.__html!==html){el.__html=html;el.innerHTML=html;}}
const byCategory={教学:'building',运动:'track',生活:'food',景观:'tree',交通:'gate',宿舍:'building',教工:'building'};
const links={gate:15468029,library:15468039,tech:15468057,track:15468025,gym:15468072,west:15468093,'west-gate':15468089,'west-lib':15468121,'w-square':15468094,'e-ball':15468075,'e-teach8':15468077,'e-teach9':15468061,'e-teach10':15468082,'w-teach3':15468090,'w-teach4':15468092,'w-teach5':15468095,
  conf:23260845,'gate-south':15468086,'e-office5':15468033,'e-train1':15468078,'e-train2':23260857,'e-train3':16046121,'west-dining':15468127,'w-ball':15468126,'w-golf':15468131,'w-fang-garden':15468091,'e-plaza-hua':15468076,'e-plaza-ming':15468069,'e-startup-street':15468037};
const panoPoints=atlas.panoramas||[],panoById=new Map(panoPoints.map(p=>[p.id,p]));
const mpp=atlas.shadeModel?.scale||.6;
// every panorama of the 720 云 work → building / road on the atlas (assets/scene-index.js)
const sceneIdx=window.SCENE_INDEX?.scenes||{},sceneTours=window.SCENE_INDEX?.tours||[],scenesOfPlace=new Map();
for(const s of tour.scenes){const r=sceneIdx[s.id];if(r?.p){if(!scenesOfPlace.has(r.p))scenesOfPlace.set(r.p,[]);scenesOfPlace.get(r.p).push(s.id);}}
for(const [pid,ids] of scenesOfPlace){const p=places.get(pid);if(p)p.aliases=[...(p.aliases||[]),...ids.map(i=>scenes.get(i)?.name).filter(Boolean)];}
function placeScenes(id){return scenesOfPlace.get(id)||[];}
// ---- 4 学部 + 6 学院 (assets/faculty-data.js, from the team's list): which faculty or college uses which building ----
const FAC=window.CAMPUS_FACULTY||{units:[],photos:{},unlisted:[]},facUnits=new Map(FAC.units.map(u=>[u.id,u])),facOf=new Map();
for(const u of FAC.units)for(const b of u.buildings){if(!facOf.has(b.place))facOf.set(b.place,[]);facOf.get(b.place).push({u,floor:b.floor});}
for(const [pid,list] of facOf){const p=places.get(pid);if(p)p.aliases=[...(p.aliases||[]),...list.flatMap(({u})=>[u.name,...u.depts,...u.keys])];}
const facGroup=id=>places.get(id)?.splitFrom||id;   // the three blocks of 6 号教学楼 are one “东区六号楼”
function facBase(id){return (places.get(facGroup(id))?.name||'').replace(/(A|东|西|南|北)楼$/,'');}
function facShort(id){return facBase(id).replace('教学楼','楼');}
function facWhere(u){const out=new Map();for(const b of u.buildings){const g=facGroup(b.place);if(!out.has(g))out.set(g,{id:g,name:facBase(b.place),short:facShort(b.place),floor:b.floor,count:0});out.get(g).count++;}return [...out.values()];}
function facLine(id){const l=facOf.get(id);if(!l)return null;const names=l.map(x=>x.u.name),all=names.join(' · ');return {text:all.length<=15?all:names[0]+' +'+(names.length-1),colors:l.map(x=>x.u.color)};}
function facMatches(q){const n=Directory.normalize(q);return n?FAC.units.filter(u=>[u.name,...u.depts,...u.keys].some(k=>Directory.normalize(k).includes(n))):[];}
function facPoints(u){return u.buildings.flatMap(b=>places.get(b.place)?.footprint||[]);}
function sceneWhere(id){const r=sceneIdx[id]||{};return r.p?places.get(r.p)?.name||'':r.a?(r.z==='全校'?'全校航拍':r.z+'航拍'):r.z||'';}
function tourPoints(i){return (sceneTours[i]?.stops||[]).map(id=>sceneIdx[id]).filter(r=>r&&r.x!==undefined).map(r=>[r.x,r.y]);}
const scopes=['精选','全部','东区室外','西区室外','楼内'];
function nearestPano(x,y,max=150){let best=null;for(const s of panoPoints){const d=Math.hypot(s.x-x,s.y-y);if(d<=max&&(!best||d<best.d))best={...s,d};}return best;}
function shadeColor(v,f=1){const t=Math.max(0,Math.min(1,v));const a=[232,148,52],m=[214,196,92],b=[22,118,74];const [p,q,k]=t<.25?[a,m,t/.25]:[m,b,Math.min(1,(t-.25)/.35)];const g=[158,174,166],w=(1-f)*.8;return 'rgb('+p.map((c,i)=>{const x=c+(q[i]-c)*k;return Math.round(x+(g[i]-x)*w);}).join(',')+')';}
function shadeHour(){return state.tab==='route'?state.hour:state.shadeHour;}
const featuredOrder=['library','gate','track','tech','gym','dining','garden','west'];
const state={tab:'explore',map:'atlas',selected:null,faculty:null,facLayer:false,cat:'全部',query:'',expanded:false,scene:15468024,sceneSearch:'',scope:'精选',page:0,
  from:'gate',to:'east-16',zone:'全校',step:-1,picking:false,hour:12,detour:.2,choice:0,day:Routing.today(),travel:'auto',shade:false,shadeHour:12,scenePlace:null,tourIdx:null,tourMap:null,panoLayer:false,locOnly:false,onlineScene:null,sky:'auto',choiceTouched:false,
  sunMode:(new URL(location.href).searchParams.get('sun')||window.SUNWALK_SUN)==='summer'?'summer':'today'};
// ---- the sun: today's date by default, or the summer design day of the shade survey ----
const designDate=atlas.shadeModel.designDate||atlas.shadeModel.date;
function sunDate(){return state.sunMode==='summer'?designDate:SunModel.today();}
function shadeRange(){const h=atlas.shadeModel.hours;return [h[0],h[h.length-1]];}
function applySun(){SunModel.apply(atlas,sunDate());const [a,b]=shadeRange();state.shadeHour=Math.max(a,Math.min(b,state.shadeHour));}
function dateWord(d=atlas.shadeModel.date){const [,m,day]=d.split('-').map(Number);return m+' 月 '+day+' 日';}
function leafOff(){const m=+atlas.shadeModel.date.slice(5,7);return m>=11||m<=3;}
function sunLabel(){return state.sunMode==='summer'?'夏季情景（'+dateWord()+'）':'今天（'+dateWord()+'）';}
applySun();
let currentPlan=null,vr=null,map=null,mapTiles=null,liveMarker=null,liveRadius=null,watch=null,fix=null,watchToken=0,geoStatus='',toastTimer=null;
let followFix=false;
const geoNames={library:'图书馆',dining:'餐饮中心',track:'操场',gym:'体育馆'};
const view={scale:1,base:1,x:0,y:0,width:1200,height:760,rot:0};
let planeSize=null;
// The flat map's camera: screen = (x, y) + scale · R(rot) · map point, with rot in degrees, clockwise on screen.
function rotCS(r){const a=r*Math.PI/180;return [Math.cos(a),Math.sin(a)];}
function toScreen(mx,my,v=view){const [c,s]=rotCS(v.rot);return [v.x+v.scale*(c*mx-s*my),v.y+v.scale*(s*mx+c*my)];}
function toMap(sx,sy,v=view){const [c,s]=rotCS(v.rot),dx=(sx-v.x)/v.scale,dy=(sy-v.y)/v.scale;return [c*dx+s*dy,c*dy-s*dx];}
function pinTo(m,p){const [c,s]=rotCS(view.rot);view.x=p[0]-view.scale*(c*m[0]-s*m[1]);view.y=p[1]-view.scale*(s*m[0]+c*m[1]);}   // put map point m under screen point p
function turnAngle(a){return ((a%360)+540)%360-180;}
// recently viewed places (kept in this browser only)
const recent=(()=>{let list=[];try{list=JSON.parse(localStorage.getItem('sunwalk.recent')||'[]').filter(id=>places.has(id));}catch{}
  return {get list(){return list;},add(id){list=[id,...list.filter(x=>x!==id)].slice(0,6);try{localStorage.setItem('sunwalk.recent',JSON.stringify(list));}catch{}}};})();
let emblemData='';
fetch('assets/xfu-emblem.png').then(r=>r.blob()).then(b=>{const fr=new FileReader();fr.onload=()=>{emblemData=fr.result;};fr.readAsDataURL(b);}).catch(()=>{});
function nowHour(){const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':');return (+h%24)+(+m)/60;}
function clock(h){const m=Math.round(h*60);return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function hl(text){const q=state.query.trim(),s=String(text),i=q?s.toLowerCase().indexOf(q.toLowerCase()):-1;return i<0?esc(s):esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+q.length))+'</mark>'+esc(s.slice(i+q.length));}
function shadeStrip(p){return '<span class="shade-strip" title="沿途遮阴：绿色荫凉，橙色暴晒">'+p.edges.map(e=>'<i style="flex:'+Math.max(1,e.meters)+';background:'+(e.shade===null?'#b9c0bb':shadeColor(e.shade))+'"></i>').join('')+'</span>';}
function shadeShare(p){return Math.max(0,Math.min(100,Math.round(p.edges.reduce((a,e)=>a+(e.shade??0)*e.seconds,0)/(p.seconds||1)*100)));}
function shortName(p){return p.category==='宿舍'&&p.number?p.zone[0]+p.number+'公寓':p.name;}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function timeLabel(h){return String(Math.floor(h)).padStart(2,'0')+':'+(h%1?'30':'00');}
function minutes(sec){return (sec/60).toFixed(1);}
function tripLabel(p){return p.usesOutside?(p.edges.some(e=>e.role==='gate'&&e.name.includes('西区正门'))?'校外通行 · 西区仅经正门':'经校外街道（太乙宫正街）'):p.usesSkybridge?'全程校内 · 经西译天渡':'全程校内步行';}
// route tab only: the chosen departure time decides whether gates are entry-only and whether there is any sun
function late(){return state.tab==='route'&&Routing.isNight(atlas,state.hour);}
function dark(){return state.tab==='route'&&!Routing.daylight(atlas,state.hour);}
function canExit(){return Routing.outsideAllowed(atlas,state.day)&&!late();}
// ---- weather: the forecast for 太乙宫街道, or a sky picked by hand; it decides how much the sun counts ----
function routeSky(){return Weather.sky(state.day,state.hour,state.sky);}
function nowSky(){return Weather.sky(Routing.today(),nowHour(),'auto');}
function viewSky(){return state.tab==='route'?routeSky():state.shade?Weather.sky(Routing.today(),state.shadeHour,state.sky):nowSky();}
function viewHour(){return state.tab==='route'?state.hour:state.shade?state.shadeHour:nowHour();}
function sunless(){return state.tab==='route'&&(dark()||routeSky().sun===0);}
function sunlessWord(){return dark()?'夜间无日照':routeSky().label+'天无直射日照';}
function skyText(s){return s.label+(Number.isFinite(s.temp)?' '+Math.round(s.temp)+'℃':'');}
function skyNote(s){
  if(s.source==='default')return '该时刻没有预报，按晴天估算';
  return ({manual:'手动设定',now:'实况',forecast:'预报'})[s.source]+' '+skyText(s)+' · '+(s.sun===0?'无直射日照':s.sun===1?'日照充足':'日照约为晴天的 '+Weather.pct(s)+'%');}
function skyShort(s,isDark){const t=s.temp,has=Number.isFinite(t);
  return isDark?(s.wet?'有'+s.label+'，记得带伞':'夜间无日照，走最近的路'):s.wet?'有'+s.label+'，记得带伞，走最近的路':s.sun<.5?'日照弱，不必绕路找荫凉':has&&t<12?'天冷，晒晒太阳更舒服':has&&t>=28&&s.sun>=.9?'晴热，尽量走林荫':'有日照，走林荫更舒服';}
function hourNote(){const s=sunAt(state.hour),k=routeSky(),night=Routing.isNight(atlas,state.hour);
  return (s?Weather.icon(k.kind,false,15)+'<span>太阳在'+sunWord(s.az)+'方，高 '+Math.round(s.el)+'° · '+esc(skyNote(k))+'</span>':icon('clock',13)+'<span>夜间无日照，只比较距离'+(k.source!=='default'?' · '+esc(skyText(k)):'')+'</span>')+(night?' · <b>校门只进不出</b>':'');}
function wxCell(h,cur){const k=Weather.kindOf(h.code,h.text)||'cloudy',K=Weather.KINDS[k],temp=Number.isFinite(h.temp)?Math.round(h.temp)+'°':'—';
  return '<button class="wx-cell'+(h.t===cur?' on':'')+(h.night?' night':'')+(h.hour===0?' newday':'')+'" data-wx-t="'+h.t+'" title="'+esc(String(h.hour).padStart(2,'0')+':00 '+(h.text||K.label)+' '+temp+(h.windD?' '+h.windD+' '+h.windL:'')+' · 日照约 '+Math.round(K.sun*100)+'%')+'"><small>'+String(h.hour).padStart(2,'0')+'时</small>'+Weather.icon(k,h.night,20)+'<b>'+temp+'</b><i style="--sun:'+K.sun+'"></i></button>';}
function wxNote(){const s=routeSky();return Weather.icon(s.kind,dark(),15)+'<span>'+esc(Routing.weekdays[state.day-1]+' '+timeLabel(state.hour)+' · '+skyNote(s))+'</span>';}
function skyPick(){return '<div class="sky-pick" role="group" aria-label="天气设定">'+[['auto','按预报'],['clear','晴'],['cloudy','多云'],['overcast','阴'],['rain','雨']].map(([k,l])=>'<button data-sky="'+k+'" aria-pressed="'+(state.sky===k)+'">'+(k==='auto'?'':Weather.icon(k,false,14))+l+'</button>').join('')+'</div>';}
function wxBlock(){const d=Weather.data,cur=Weather.at(state.day,state.hour)?.t;
  return '<div class="wx-block"><div class="control-line"><span>天气</span><button class="wx-src" data-act="wx">'+(d?esc('太乙宫街道 · '+(d.now?.time?d.now.time+' 实况 ':'')+(d.now?.text||'')+(Number.isFinite(d.now?.temp)?' '+d.now.temp+'℃':'')):'天气说明')+' ›</button></div>'+
    (d?'<div class="wx-strip" id="wxStrip" aria-label="未来 24 小时逐小时预报，点某个小时按那一刻规划">'+d.hours.map(h=>wxCell(h,cur)).join('')+'</div>':'<p class="wx-empty">'+Weather.icon('cloudy',false,16)+'<span>没有取到天气预报，路线先按晴天估算。联网后用「启动校园导览.cmd」打开会自动读取；也可以在下面手动选天气。</span></p>')+
    skyPick()+'<p class="wx-note" id="wxNote">'+wxNote()+'</p>'+sunPick()+'<p class="sun-line">'+esc(sunLine())+'</p></div>';}
function syncWx(){const note=$('wxNote');if(note)note.innerHTML=wxNote();const strip=$('wxStrip');if(!strip)return;
  const cur=Weather.at(state.day,state.hour)?.t;strip.querySelectorAll('.wx-cell').forEach(b=>b.classList.toggle('on',+b.dataset.wxT===cur));
  const on=strip.querySelector('.on');if(on)strip.scrollLeft=on.offsetLeft-strip.clientWidth/2+on.offsetWidth/2;}
function sunPick(){return '<div class="sun-pick" role="group" aria-label="太阳按哪一天计算"><span>太阳按</span>'+[['today','今天 '+dateWord(SunModel.today())],['summer','夏季 '+dateWord(designDate)]].map(([k,l])=>'<button data-sun="'+k+'" aria-pressed="'+(state.sunMode===k)+'">'+l+'</button>').join('')+'</div>';}
function sunLine(){const M=atlas.shadeModel;return '日出 '+clock(M.sunrise)+' · 日落 '+clock(M.sunset)+(leafOff()?' · 落叶季，林荫按夏季满叶测量，实际更晒':'');}
function dayGradient(){const M=atlas.shadeModel,p=h=>Math.max(0,Math.min(100,h/23.5*100)).toFixed(1)+'%',a=M.sunrise,b=M.sunset;
  return 'linear-gradient(90deg,#27364f 0,#27364f '+p(a-.6)+',#f6cf7c '+p(a+.6)+',#f8e3a0 '+p(a+1.8)+',#f0a530 '+p((a+b)/2)+',#f6cf7c '+p(b-1.6)+',#e58a3c '+p(b-.2)+',#27364f '+p(b+.8)+',#27364f 100%)';}
function setSun(mode){if(!['today','summer'].includes(mode)||mode===state.sunMode)return;state.sunMode=mode;applySun();
  if(state.tab==='route'){updateRoute();routeSide();}else if(state.tab==='explore'){exploreSide();refreshAccess();renderPins();}
  updateChip();applySky();if($('modal').open&&$('modalContent').querySelector('.wx-dialog'))weatherDialog();
  toast('太阳改按'+sunLabel()+'计算：日出 '+clock(atlas.shadeModel.sunrise)+'，日落 '+clock(atlas.shadeModel.sunset)+'。');}
function updateChip(){const chip=$('wxChip');if(!chip)return;const d=Weather.data,s=nowSky(),h=nowHour();
  chip.innerHTML=d?Weather.icon(s.kind,!Routing.daylight(atlas,h),20)+'<span><em>'+esc(s.label)+' </em>'+(Number.isFinite(s.temp)?Math.round(s.temp)+'℃':'')+'</span><small>太乙宫</small>':Weather.icon('cloudy',false,20)+'<span><em>天气</em></span>';
  chip.title=d?'校园天气：'+skyText(s)+' · '+skyShort(s,!Routing.daylight(atlas,h)):'校园天气（暂未取到预报）';}
function applySky(){const fx=$('skyFx');if(!fx)return;const on=state.tab!=='pano'&&['atlas','official'].includes(state.map),s=viewSky();
  fx.hidden=!on;fx.dataset.sky=s.source==='default'?'none':s.kind;fx.dataset.night=String(!is3d()&&!Routing.daylight(atlas,viewHour()));env3d();}
function setSky(kind){if(!(kind==='auto'||Weather.KINDS[kind]))return;state.sky=kind;
  if(state.tab==='route'){updateRoute();routeSide();}else{if(state.tab==='explore'&&state.shade)exploreSide();refreshAccess();renderPins();}
  if($('modal').open&&$('modalContent').querySelector('.wx-dialog'))weatherDialog();
  toast(kind==='auto'?'天气跟随预报。':'已按「'+Weather.KINDS[kind].label+'」估算日照。');}
function weatherDialog(){const d=Weather.data,h=nowHour(),s=nowSky(),isDark=!Routing.daylight(atlas,h),cur=Weather.at(state.day,state.hour)?.t;
  const stamp=d?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(d.fetchedAt)):'';
  dialog('校园天气','<div class="wx-dialog">'+(d?'<div class="wx-now" data-sky="'+s.kind+'">'+Weather.icon(s.kind,isDark,52)+'<div><strong>'+esc(skyText(s))+'</strong><span>'+esc(d.place)+(d.now?.time?' · '+esc(d.now.time)+' 实况':'')+(Number.isFinite(d.now?.humidity)?' · 湿度 '+d.now.humidity+'%':'')+(d.now?.wind?' · '+esc(d.now.wind):'')+(Number.isFinite(d.now?.hi)&&Number.isFinite(d.now?.lo)?'<br>今天 '+d.now.lo+' ~ '+d.now.hi+'℃':'')+'</span></div></div><p class="wx-say">'+icon('leaf',14)+esc(skyShort(s,isDark))+'。</p><h3>未来 24 小时</h3><div class="wx-hours">'+d.hours.map(x=>wxCell(x,cur)).join('')+'</div><p class="caption">点某个小时，就按那一刻的天气和时间规划路线。每格下面的黄条是日照强度。</p>'
      :'<p class="wx-empty">'+Weather.icon('cloudy',false,16)+'<span>现在没有取到天气预报。预报由本机的小服务读取：联网后双击「启动校园导览.cmd」打开页面即可。取不到时路线按晴天估算，你也可以手动选天气。</span></p>')+
    '<h3>手动设定天气</h3>'+skyPick()+'<h3>太阳按哪一天算</h3>'+sunPick()+'<p class="caption">'+esc(sunLine())+'。“今天”按当天日期计算太阳方位、日出日落和楼影；“夏季”是 720 云实景拍摄季节的开学日情景。</p>'+'<h3>天气怎样影响路线</h3><p>林荫有没有用，先看有没有太阳。路线里每段路的日照 = 步行时长 ×（1 − 遮阴率）× 天气的日照比例：</p><div class="wx-factors">'+Object.entries(Weather.KINDS).map(([k,v])=>'<span>'+Weather.icon(k,false,16)+v.label+' <b>'+Math.round(v.sun*100)+'%</b></span>').join('')+'</div><p>阴天、雾天日照弱，推荐直接走最近的路；雨雪天没有直射日照，只比较距离；气温低于 12℃ 时不建议为荫凉绕路；晴热（28℃ 以上）时推荐少晒的走法。</p><p class="caption">日照比例和温度界线是团队的估计，不是测量值。太阳方位、日出日落和楼影按'+esc(sunLabel())+'计算，天气只调整日照强弱。林荫是夏季满叶时的测量值，落叶季实际会更晒。</p>'+
    '<p class="caption">数据：'+sourceLink(d?.page||'https://forecast.weather.com.cn/town/weather1dn/101110102013.shtml','中国天气网 · 长安区太乙宫街道')+'（数据来源：中央气象台）。'+(d?'读取于 '+esc(stamp)+(Weather.source==='snapshot'?'（当前显示的是上次保存的预报）':'')+'。':'')+'本页不向天气网发送任何个人信息。</p><div class="small-actions"><button class="solid" data-act="plan-now">'+icon('route',14)+'按现在的天气规划</button><button data-act="wx-refresh">重新读取预报</button></div></div>','CAMPUS WEATHER');
}
function policyText(){return late()?'21:00 后所有校门只进不出；跨区只走校内天渡。':Routing.outsideAllowed(atlas,state.day)?'可走校外；地面进入西区仅经正门。':'禁止出校；跨区只走校内天渡。';}
function accessLegend(){return '<span><i class="legend-line campus"></i>校内</span><span><i class="legend-line bridge"></i>天渡</span><span><i class="legend-line '+(canExit()?'outside':'closed')+'"></i>'+(late()?'校门只进不出':'校外'+(canExit()?'可走':'禁行'))+'</span>';}
function syncMapStrokes(){
  document.querySelectorAll('#pathOverlay [data-stroke],#accessOverlay [data-stroke],#shadeOverlay [data-stroke]').forEach(el=>el.setAttribute('stroke-width',+el.dataset.stroke/view.scale));
  document.querySelectorAll('#pathOverlay [data-radius]').forEach(el=>el.setAttribute('r',+el.dataset.radius/view.scale));
}
// Sun azimuth / elevation for the chosen hour on the day in use (today, or the summer design day).
function sunAt(h){if(!Routing.daylight(atlas,h))return null;
  const p=SunModel.position(atlas.shadeModel.date,h,atlas.shadeModel.lat,atlas.shadeModel.lon);return {az:p.azimuth,el:Math.max(0,p.elevation)};}
function sunWord(az){return ['北','东北','东','东南','南','西南','西','西北'][Math.round(az/45)%8];}
function updateSun(){
  const dot=$('sunDot');if(!dot)return;const on=(state.shade||state.tab==='route')&&['atlas','official'].includes(state.map)&&state.tab!=='pano',s=on&&sunAt(shadeHour());
  dot.hidden=!s;if(!s)return;
  const k=viewSky();dot.style.opacity=(.35+.65*k.sun).toFixed(2);
  dot.style.transform='rotate('+(s.az-(is3d()?Map3D.view().bearing:(state.map==='atlas'?7:0)-view.rot))+'deg) translateY(calc(var(--sun-r) * -1))';
  dot.title=timeLabel(shadeHour())+' 太阳在'+sunWord(s.az)+'方（方位 '+Math.round(s.az)+'°，高度 '+Math.round(s.el)+'°），影子朝'+sunWord((s.az+180)%360)+'。'+(k.source!=='default'?' '+skyNote(k)+'。':'');
}
function refreshAccess(){
  const overlay=$('accessOverlay');overlay.setAttribute('viewBox','0 0 '+view.width+' '+view.height);
  const open=canExit();
  overlay.innerHTML=atlas.edges.filter(e=>e.role!=='campus').map(e=>{
    const a=atlas.nodes[e.a],b=atlas.nodes[e.b],sky=e.role==='skybridge',color=sky?'#4c83b8':e.closed?'#c0504d':open?'#b77830':'#909b9b';
    return '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+color+'" data-stroke="'+(sky?3:2)+'" '+(!sky?'stroke-dasharray="5 4"':'')+'/>';
  }).join('');
  renderShade();updateSun();access3d();
  syncMapStrokes();
  if($('accessLegend'))$('accessLegend').innerHTML=accessLegend()+(state.shade?'<span class="shade-legend"><i></i>'+timeLabel(shadeHour())+' 晒 → 荫</span>'+(sunAt(shadeHour())?'<span class="sun-note">太阳在'+sunWord(sunAt(shadeHour()).az)+' · 高 '+Math.round(sunAt(shadeHour()).el)+'°</span>':''):'')+(viewSky().source!=='default'?'<span class="sky-note">'+Weather.icon(viewSky().kind,!Routing.daylight(atlas,viewHour()),14)+esc(skyText(viewSky()))+'</span>':'');
  applySky();
  if($('mapDay'))$('mapDay').textContent=Routing.weekdays[state.day-1]+(state.day===Routing.today()?' · 今天':'')+(late()?' · 21:00 后':'');
}
// Summer shade of every walkway at the current hour: 720 云实景测点 + 楼栋阴影.
function renderShade(){
  shade3d();
  const layer=$('shadeOverlay');if(!layer)return;
  layer.setAttribute('viewBox','0 0 '+view.width+' '+view.height);
  if(!state.shade||state.map!=='atlas'||state.tab==='pano'||is3d()){layer.innerHTML='';return;}
  const h=shadeHour();
  const list=atlas.edges.filter(e=>e.kind!=='access'&&e.kind!=='door'&&e.role!=='gate'),night=!Routing.daylight(atlas,h),sunShare=viewSky().sun,tone=e=>{const s=night?null:Routing.shadeAt(e.shade,h);return night?'#8794a8':s===null?'#9aa4a0':shadeColor(s,sunShare);};
  if(layer.children.length===list.length){list.forEach((e,i)=>layer.children[i].style.stroke=tone(e));return;}
  layer.innerHTML=list.map(e=>{const a=atlas.nodes[e.a],b=atlas.nodes[e.b];
    return '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" style="stroke:'+tone(e)+'" data-stroke="'+(e.kind==='axis'?7:e.kind==='narrow'?3.5:5)+'" stroke-linecap="round" opacity=".9"/>';}).join('');
}
function policyDialog(){
  dialog('天渡与校门通行','<div class="policy-week"><b>周一 · 周二 · 周四</b><p>不能出校门去西区。往返东西区只走校内的西译天渡。</p><b>周三 · 周五 · 周六 · 周日</b><p>可以走校外（太乙宫正街），但地面进入西区只能经过西区正门。</p><b>每天 · 东区小南门</b><p>学生不能从小南门进出。出校走东区北门或南门，路线不会穿过小南门。</p><b>每天 · 晚上 21:00 后</b><p>所有校门学生只进不出。21:00 后不能出校，往返东西区只走校内的西译天渡；从校外回来可以进校。凌晨到 06:00 前按同样处理。</p></div><p>西译天渡只连接两侧校内：东端落在西译宾馆右侧的校内道路，西端接西区8号综合楼北侧道路。桥下太乙宫正街与天渡不相通，不能从校外直接上桥。宾馆左侧临街，不是校内通道。</p><p class="caption">依据你们提供的现场规则（2026-11-09、2026-11-11、2026-11-12）设置。临时管制以学校现场通知为准。</p><div class="small-actions"><button class="solid" data-act="access-focus">放大看天渡与校门</button><button data-act="plan-access">按星期规划路线</button></div>','CAMPUS ACCESS');
}
function coverage(){
  dialog('校园要素核对','<p>原图逐项录入 <b>'+atlas.places.length+'</b> 处目的地，含 34 处学生住宿点；路网 '+Object.keys(atlas.nodes).length+' 个节点、'+atlas.edges.length+' 段。所有楼栋、园地与服务点均可检索并规划到附近步道。原图字小的名称已对照 720 云实景场景名校正（诒萌路、诒俭餐厅、乒乓球场、诒华广场、诒鸣广场、钟塔）。</p><div class="small-actions"><button data-act="original-map">对照学校原图</button><button data-act="access-rules">查看通行规则</button></div>'+['东区','西区','跨区'].map(zone=>'<h3>'+zone+'</h3><div class="inventory-grid">'+atlas.places.filter(p=>p.zone===zone).map(p=>'<button data-inspect="'+p.id+'">'+esc(p.name)+(p.addedInCompletion?'<small>补录</small>':'')+'</button>').join('')+'</div>').join('')+'<p class="caption">白色通路为图示铺装；庭院、园林与停车场分别描绘。未凭空增加图中没有标注的宿舍编号。距离与楼门位置仍需现场核验。</p>','MAP INVENTORY');
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function dismiss(){if($('modal').open)$('modal').close();}
function dialog(title,body,kicker='SUNWALK ATLAS'){
  $('modalContent').innerHTML='<button class="close-card" data-act="dismiss" aria-label="关闭">'+icon('close')+'</button><span class="section-label">'+esc(kicker)+'</span><h2 id="dialogTitle">'+esc(title)+'</h2>'+body;
  if(!$('modal').open)$('modal').showModal();
}
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const b=$('modal').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dismiss();}});
function sourceLink(url,title){return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+' ↗</a>';}
function sources(){
  dialog('作品与数据来源','<div class="about-school"><img src="assets/xfu-logo.png" alt="西安翻译学院"><span>校园步行导览<br>晴行有方队 · 讯飞杯</span></div><p><b>向阳而行</b>是晴行有方队为西安翻译学院“讯飞杯”制作的校园步行导览。你可以先看实景认路，再比较不同出发时段的示例路线。</p><h3>校园全景与区位实景</h3><p>720 云作品《'+esc(tour.title)+'》，作者「'+esc(tour.author)+'」。索引收录 '+tour.scenes.length+' 个原作场景，保留原作场景编号。其中 '+tour.scenes.filter(s=>s.cube).length+' 处全景可在本页环视，'+tour.scenes.filter(s=>s.photo&&!s.cube).length+' 处有实景照片，其余场景引用 720 云原作的在线全景（断网时显示拍摄位置）。有本地照片的场景只读本地文件。</p><div class="modal-links">'+sourceLink(tourUrl,'720 云原作')+'</div><p class="caption">'+esc(tour.credit||'')+'。影像版权归原作者，补充照片见“全景漫游”页的说明。</p><h3>校园平面图与设备定位</h3><p>原图由参赛团队提供，简化导览图参照校办平面图绘制。地理地图采用 OpenStreetMap 社区地标及 WGS84 经纬度。建筑面中心代表大致位置。设备位置仅在本次页面会话中使用。</p><div class="modal-links">'+sourceLink(atlas.source,'校办学校地图')+sourceLink(geo.source,'校园地理坐标')+sourceLink(geo.license,'OSM 署名与许可')+'</div><h3>择荫路线的数据口径</h3><p>当前 '+atlas.edges.length+' 段路网按原图逐块描绘。宾馆右侧、校内天渡与星期出校限制按团队 2026-11-09 提供的现场规则设置；小南门学生不能通行（2026-11-11 补充），路线不会穿过此门；晚上 21:00 后所有校门学生只进不出（2026-11-12 补充）。路线支持全天 24 小时：日出前、日落后没有日照，只比较距离。校园详图收录 '+atlas.places.length+' 个目的地，住宿区以原图逐楼编号。图示距离按 '+mpp.toFixed(2)+' 米/像素估算，并用高德实测距离校核过（北大门到图书馆环岛约 246 米；示意图各处比例在 0.45—0.60 之间）。</p><p><b>林荫</b>：校方示意图的树木符号与实景不符（与实测林荫的拟合斜率约 '+(atlas.shadeModel?.fitLow?.[1]??0)+'），因此改用 720 云原作中 '+(atlas.shadeModel?.scenes||panoPoints.length)+' 个夏季室外全景实测：逐像素区分天空、树冠与建筑，统计头顶与低空方向的遮挡比例，再按距离插值到每段路；留一检验平均误差约 '+Math.round((atlas.shadeModel?.looMAE||0)*100)+' 个百分点。<b>楼荫</b>按楼栋轮廓、按层数估计的高度和 '+esc(atlas.shadeModel?.date||'')+' 的太阳位置投影计算。每次用同一出发时刻与 1.25 米/秒的步速比较，点击路段可查依据并打开对应实景。</p><button class="secondary" data-act="coverage">查看校园要素核对清单</button><h3>天气</h3><p>天气取自中国天气网的长安区太乙宫街道逐小时预报（数据来源：中央气象台），由本机服务读取，每 20 分钟最多读一次。路线里的日照按天气折算：晴 100%、多云 60%、霾和沙尘 50%、雾 30%、阴 20%、雨雪 0%；这些比例和“偏冷 12℃、晴热 28℃”的界线是团队的估计，不是测量值。没有预报的时刻按晴天估算。太阳方位、日出日落和楼影默认按当天日期在页面里计算（与制图工具同一套公式），也可以切到“夏季”情景（'+esc(dateWord(designDate))+'，720 云实景的拍摄季节）；林荫始终是夏季满叶时的测量值。</p><div class="modal-links">'+sourceLink('https://forecast.weather.com.cn/town/weather1dn/101110102013.shtml','中国天气网 · 太乙宫街道')+'</div><h3>楼内平面图与手绘小路</h3><p>6 号教学楼 A 楼的楼内导航依据团队提供的平面图「6号楼A楼05」（Sweet Home 3D 导出）：房间位置取自图中的矢量图形，名称和面积照图抄录。哪部楼梯通哪几层图上没有写，按南侧楼梯通 1—2 层、北侧楼梯通 2—4 层处理。另有 42 条小路是团队在地图截图上手绘补充的（2026-11-17），按宿舍楼的位置对齐后读出，未现场测量。</p><h3>学部与学院</h3><p>每栋教学楼归属哪个学部、学院，依据团队提供的《4学部+6学院》（2026-11-16）：名单写明了 4 个学部、6 个学院各自下设的系和所在楼号，并附有西区2/3/4/5号楼、东区8/10号楼门口标识牌的照片（地点卡里可以点开）。“东区六号楼”对应地图上 6 号教学楼的三栋；马克思主义学院只在东区4号综合楼三层，创新创业学院只在东区5号综合楼一层。名单没有写到的楼（如西区1号教学楼、各实训楼）不标学部。</p><h3>校徽</h3><p>页面中的校徽为西安翻译学院官方标识，取自学校官网，颜色和比例未作修改，仅用于标明本导览所属学校。校徽版权归学校所有。</p><h3>校外场景</h3><p>校园四周的道路、村镇和机构名称依据高德地图底图（© AutoNavi）人工描绘：北侧太乙宫集镇、东侧沙场村与驾校、南侧四皓村和教工住宅小区、西北方向的包茂高速与南五台服务区。校外部分只作示意，距离经过压缩，不参与步行计算。本页不嵌入高德地图，也不向高德发送请求。</p><h3>全景与楼栋的对应</h3><p>原作 '+tour.scenes.length+' 个场景已全部编入索引：'+(window.SCENE_INDEX?.counts?.located||0)+' 个定位到地图，其中 '+(window.SCENE_INDEX?.counts?.indoor||0)+' 个楼内场景按原作场景之间的连通关系归到 '+scenesOfPlace.size+' 处楼栋和地点。个别楼名（诒德楼、艺术设计实验教学中心）对应哪栋楼仍待现场核对，界面中已注明。</p>','ABOUT THE PROJECT');
}
function title(kicker,heading,subtitle){return '<header class="panel-heading"><div class="eyebrow">'+kicker+'</div><h1>'+heading+'</h1><p class="sub">'+subtitle+'</p></header>';}
function sheetGrip(label){
  const open=document.body.classList.contains('sheet-open');
  return '<div class="sheet-grip"><button type="button" data-act="sheet" aria-label="展开或收起'+label+'" aria-expanded="'+open+'"><i aria-hidden="true"></i><span>'+label+'</span><b>'+(open?'收起':'展开')+'</b>'+icon('chevron',12)+'</button></div>';
}
function setSheetOpen(open){
  const was=document.body.classList.contains('sheet-open');
  document.body.classList.toggle('sheet-open',open);
  // a phone's sheet comes back to rest showing its top (search, categories), not wherever the list was scrolled to
  if(was&&!open&&innerWidth<=680)$('sidebar').scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});
  const button=$('sidebar').querySelector('[data-act="sheet"]');
  if(button){
    button.setAttribute('aria-expanded',String(open));
    const label=button.querySelector('b');
    if(label)label.textContent=open?'收起':'展开';
  }
}
function searchBox(id,value,label){return '<label class="searchbox">'+icon('search')+'<input type="search" id="'+id+'" value="'+esc(value)+'" placeholder="'+label+'" aria-label="'+label+'"><kbd>/</kbd></label>';}
function placeIcon(p){return p.id==='library'?'book':byCategory[p.category]||'pin';}
function scenePhoto(s){return s?.photo?'assets/'+s.photo:null;}
const coverScenes = [
  {id:15468023, label:'全校鸟瞰'}, {id:15468024, label:'东区校园'},
  {id:15468026, label:'西区校园'}, {id:15468039, label:'图书馆广场'}
];
let coverIndex = 0;
function campusCover(){
  const scene = coverScenes[coverIndex];
  return '<section class="campus-cover" aria-label="校园全景取景点">'+
    '<img class="cover-image" alt="" src="'+esc(scenePhoto(scenes.get(scene.id)))+'">'+
    '<div class="cover-content"><p>'+icon('pin',13)+'西安翻译学院 · 太乙宫校区</p><h1>校园导航</h1>'+
    '<button class="cover-open" data-scene="'+scene.id+'" aria-label="进入'+scene.label+'全景">'+icon('pano',14)+'<span>'+scene.label+'</span>'+icon('arrow-up-right',13)+'</button></div>'+
    '<div class="cover-pager" role="group" aria-label="选择校园取景点">'+coverScenes.map((item,i)=>
      '<button type="button" data-cover="'+i+'" aria-label="预览'+item.label+'" title="'+item.label+'" aria-pressed="'+(i===coverIndex)+'"><i></i></button>').join('')+'</div></section>';
}
function previewCover(index){
  const frame = document.querySelector('.campus-cover'), next = coverScenes[index];
  if(!frame || !next || index === coverIndex)return;
  coverIndex = index;
  const image = frame.querySelector('.cover-image'), open = frame.querySelector('.cover-open');
  image.src = scenePhoto(scenes.get(next.id));
  open.dataset.scene = next.id;
  open.setAttribute('aria-label','进入'+next.label+'全景');
  open.querySelector('span').textContent = next.label;
  frame.querySelectorAll('[data-cover]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  if(!reduceMotion)image.animate([{opacity:.65,transform:'scale(1.025)'},{opacity:1,transform:'scale(1)'}],{duration:300,easing:'ease-out'});
}
function thumb(p){
  const s=scenes.get(links[p.id]);const photo=scenePhoto(s);
  return photo?'<img class="row-img" alt="" src="'+esc(photo)+'">':'<span class="row-thumb">'+icon(placeIcon(p))+'</span>';
}
function placesMatching(){
  return atlas.places.filter(p=>(state.zone==='全校'||p.zone===state.zone)&&(state.cat==='全部'||(state.cat==='收藏'?Directory.saved.has(p.id):state.cat===p.category))&&Directory.matches(p,state.query));
}
function todayCard(){
  const day=Routing.today(),h=nowHour(),gateNight=Routing.isNight(atlas,h),open=Routing.outsideAllowed(atlas,day)&&!gateNight,inModel=Routing.daylight(atlas,h),s=sunAt(h),up=inModel,sr=atlas.shadeModel.sunrise,ss=atlas.shadeModel.sunset;
  const t=Math.max(0,Math.min(1,(h-sr)/(ss-sr))),ang=Math.PI*(1-t),sx=(60+46*Math.cos(ang)).toFixed(1),sy=(54-40*Math.sin(ang)).toFixed(1);
  const k=nowSky(),wx=Weather.data;
  return '<section class="today-card '+(open?'open':'closed')+'" data-sky="'+(wx?k.kind:'none')+'" aria-label="今日校园"><div class="today-text"><span class="today-day">'+Routing.weekdays[day-1]+' · 今天</span><strong>'+(gateNight?'现在校门只进不出':open?'今天可以走校外':'今天不能出校')+'</strong><small>'+(gateNight?'21:00 后不能出校 · 跨区走西译天渡':open?'进西区只经西区正门 · 21:00 后只进不出':'跨区走校内的西译天渡')+'<br>小南门学生不通行</small></div>'+
    '<svg class="today-sun" viewBox="0 0 120 64" aria-hidden="true"><path d="M14 54A46 40 0 0 1 106 54" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 4" opacity=".45"/><path d="M6 54h108" stroke="currentColor" stroke-width="1.4" opacity=".35"/>'+(up?'<circle cx="'+sx+'" cy="'+sy+'" r="9" fill="#f6c445" opacity=".28"/><circle cx="'+sx+'" cy="'+sy+'" r="5.5" fill="#f6c445" stroke="#fff" stroke-width="1.5"/>':'')+'<text x="14" y="63" font-size="7" text-anchor="middle" fill="currentColor" opacity=".7">'+clock(sr)+'</text><text x="106" y="63" font-size="7" text-anchor="middle" fill="currentColor" opacity=".7">'+clock(ss)+'</text></svg>'+
    '<p class="today-now">'+icon('sun',13)+(s?'现在 '+clock(h)+' · 太阳在'+sunWord(s.az)+'方，影子朝'+sunWord((s.az+180)%360):'现在 '+clock(h)+' · 夜间无日照')+'</p>'+
    '<button class="today-wx'+(wx?'':' none')+'" data-act="wx">'+(wx?Weather.icon(k.kind,!inModel,22)+'<b>'+esc(skyText(k))+'</b><span>'+esc(skyShort(k,!inModel))+'</span>':Weather.icon('cloudy',false,20)+'<span>未取到天气预报，路线按晴天估算</span>')+icon('chevron',13)+'</button>'+
    '<div class="today-actions"><button data-act="plan-now">'+icon('route',14)+'规划现在出发</button>'+(inModel?'<button data-act="shade-now">'+icon('leaf',14)+'看此刻林荫</button>':'')+'</div></section>';
}
function exploreSide(){
  $('sidebar').innerHTML=sheetGrip('地点面板')+'<div class="explore-intro">'+campusCover()+
    searchBox('placeSearch',state.query,'搜索地点、宿舍楼号，如“东16”')+
    '<div class="quick-cats">'+[['宿舍','building'],['教学','book'],['生活','food'],['运动','track'],['收藏','bookmark']].map(([c,i])=>'<button data-cat-filter="'+c+'" aria-pressed="'+(state.cat===c)+'"><span>'+icon(i)+'</span>'+c+'</button>').join('')+'</div></div>'+
    '<div class="directory-controls"><div class="districts">'+['全校','东区','西区'].map(z=>'<button data-zone="'+z+'" class="'+(state.zone===z?'active':'')+'">'+z+'</button>').join('')+'</div><select aria-label="地点分类" id="listCat">'+['全部','宿舍','教学','生活','运动','景观','交通','教工','收藏'].map(c=>'<option '+(state.cat===c?'selected':'')+'>'+c+'</option>').join('')+'</select></div>'+
    '<div class="map-review-tools"><button data-act="access-rules">'+icon('route',14)+'天渡与校门规则</button><button data-act="shade-layer" aria-pressed="'+state.shade+'">'+icon('leaf',14)+'林荫分布</button><button data-act="coverage">'+icon('map',14)+'地图核对清单</button></div>'+'<div class="mini-tools"><span>小功能</span><button data-act="tool-original" aria-pressed="'+(state.map==='official')+'" title="团队提供的学校平面示意图">'+icon('map',13)+'学校原图</button><button data-act="tool-geo" aria-pressed="'+(state.map==='geo')+'" title="按经纬度显示的地理定位图">'+icon('globe',13)+'定位图</button></div>'+(state.shade?'<div class="shade-panel"><label for="shadeHour">林荫时段 <output id="shadeHourValue">'+timeLabel(state.shadeHour)+'</output></label><input id="shadeHour" type="range" min="'+shadeRange()[0]+'" max="'+shadeRange()[1]+'" step=".5" value="'+state.shadeHour+'"><p class="caption">绿色越深越荫凉，橙色为暴晒。圆点是 '+panoPoints.length+' 个 720 云夏季实景测点，点开可看实景。</p><p class="wx-note" id="shadeSky">'+Weather.icon(viewSky().kind,false,15)+'<span>'+esc('今天 '+timeLabel(state.shadeHour)+' · '+skyNote(viewSky()))+'</span></p>'+sunPick()+'<p class="sun-line">'+esc(sunLine())+'</p></div>':'')+'<div id="directoryHome"></div><div class="section-title"><h2 id="listHeading"></h2><span class="caption" id="placeCount"></span></div><div id="placeList"></div>';
  $('placeSearch').oninput=e=>{state.query=e.target.value;state.selected=null;state.expanded=false;updatePlaceList();renderPins();renderCard();};
  $('placeSearch').onfocus=()=>{if(innerWidth<=680)setSheetOpen(true);};
  $('placeSearch').onkeydown=e=>{if(e.isComposing||e.keyCode===229)return;
    const first=$('sidebar').querySelector('.fac-hits button,.room-row,.place-row');
    if(e.key==='ArrowDown'&&first){e.preventDefault();first.focus();}
    else if(e.key==='Enter'&&first&&state.query.trim()){e.preventDefault();first.click();}
    else if(e.key==='Escape'&&state.query){e.preventDefault();e.target.value='';state.query='';state.expanded=false;updatePlaceList();renderPins();}};
  $('listCat').onchange=e=>filterPlaces(e.target.value,state.zone);
  if($('shadeHour'))$('shadeHour').oninput=e=>{state.shadeHour=+e.target.value;$('shadeHourValue').value=timeLabel(state.shadeHour);$('shadeSky').innerHTML=Weather.icon(viewSky().kind,false,15)+'<span>'+esc('今天 '+timeLabel(state.shadeHour)+' · '+skyNote(viewSky()))+'</span>';refreshAccess();renderPins();};
  updatePlaceList();
}
function filterPlaces(cat,zone){
  state.cat=cat;state.zone=zone;state.selected=null;state.expanded=false;exploreSide();renderPins();renderCard();
  if(zone!=='全校'&&['atlas','official'].includes(state.map))zoneView(zone);
}
function updatePlaceList(){
  const all=placesMatching();
  const browse=!state.expanded&&!state.query&&state.cat==='全部'&&state.zone==='全校';
  const found=browse?['east-16','library','gate','west-1','clinic'].map(id=>places.get(id)):all;
  $('placeCount').textContent=all.length+' 处';
  $('listHeading').textContent=browse?'常用地点':state.cat==='收藏'?'我的收藏':state.cat==='宿舍'?'宿舍楼栋':'地点结果';
  // what was already on screen does not animate in again (a new selection redraws the list)
  const hadPanel=!!$('directoryHome').querySelector('.fac-panel'),listKey=found.map(p=>p.id).join(),calm=$('placeList').dataset.ids===listKey;
  $('placeList').dataset.ids=listKey;$('placeList').classList.toggle('calm',calm||reduceMotion);
  $('sidebar').classList.toggle('has-query',!!state.query.trim());
  $('directoryHome').replaceChildren();
  if(state.query.trim()&&typeof Indoor!=='undefined'){const hits=Indoor.search(state.query);   // room numbers of the buildings that have floor plans
    if(hits.length)$('directoryHome').insertAdjacentHTML('beforeend','<div class="room-hits"><span>楼内房间</span>'+hits.map(x=>'<button class="room-row" data-indoor="'+x.building+'" data-room="'+esc(x.room.id)+'"><b>'+esc(x.room.name)+'</b><small>'+esc(x.title+' '+x.room.floor+' 层'+(x.room.sub?' · '+x.room.sub:''))+'</small>'+icon('chevron',14)+'</button>').join('')+'</div>');}
  if(browse)$('directoryHome').insertAdjacentHTML('afterbegin',todayCard()+(recent.list.length?'<div class="recent"><span>最近查看</span>'+recent.list.map(id=>'<button data-place="'+id+'">'+esc(shortName(places.get(id)))+'</button>').join('')+'</div>':'')+facPanel());
  else if(state.cat==='教学'&&!state.query.trim())$('directoryHome').insertAdjacentHTML('afterbegin',facPanel());
  if(hadPanel)$('directoryHome').querySelector('.fac-panel')?.classList.add('calm');
  if(state.query.trim()){const fh=facMatches(state.query);   // a faculty, a department or a college by name: show where it is
    if(fh.length)$('directoryHome').insertAdjacentHTML('afterbegin','<div class="fac-hits"><span>'+icon('school',13)+'学部 / 学院</span>'+fh.map(u=>'<button data-faculty="'+u.id+'" style="--fc:'+u.color+'"><i></i><b>'+hl(u.name)+'</b><small>'+facWhere(u).map(w=>esc(w.short)+(w.floor?' '+w.floor:'')).join(' · ')+'</small>'+icon('chevron',14)+'</button>').join('')+'</div>');}
  const facRow=p=>{const f=facLine(p.id);return f?' · <em class="row-fac" style="--fc:'+f.colors[0]+'">'+esc(f.text)+'</em>':'';};
  $('placeList').innerHTML=found.map((p,i)=>'<button class="place-row '+(state.selected===p.id?'active':'')+'" data-place="'+p.id+'" style="--i:'+Math.min(i,12)+'">'+(p.number?'<span class="dorm-num">'+String(p.number).padStart(2,'0')+'</span>':thumb(p))+'<span class="row-copy"><strong>'+hl(p.name)+'</strong><small>'+p.zone+facRow(p)+' · '+esc(p.approach)+'</small></span>'+icon('chevron')+'</button>').join('')||'<p class="empty">'+(state.cat==='收藏'?'点击地点卡中的“收藏”，下次就能在这里找到。':'校图暂无匹配点位。可切换校区或清除分类再试。')+'</p>';
  if(browse)$('placeList').insertAdjacentHTML('beforeend','<button class="more" data-act="expand-list">全部 '+all.length+' 处目的地 '+icon('chevron',15)+'</button>');
  const otherHits=$('directoryHome').querySelectorAll('.room-row,.fac-hits button').length;
  if(!all.length&&otherHits){
    $('placeList').replaceChildren();
    $('listHeading').textContent='地点结果';
  }else if(!all.length)$('placeList').insertAdjacentHTML('beforeend','<button class="more" data-act="reset-filters">重置筛选</button>');
  $('listHeading').parentElement.hidden=!all.length&&otherHits>0;
}
const ROAD_NAMES=[['诒强路',1640,94],['诒文大道',1450,282],['诒和路',1640,701],['诒才路',850,927],['诒德大道',1548,1040,1],['诒萌路',1874,459,1],['诒滨路',1811,645,1],['诒雅路',1310,852,1],['诒颖路',574,716,1],['宾馆右侧步道',1188,754,1],['太乙宫正街',1098,1000,1],['街面不能上天渡',1098,828],['小南门 · 学生不通行',1150,1256]];
const BLOCK_SHAPE=new Map(atlas.structures.map(s=>[s.id,s.polygon]));
// ---- 学部 colours on the map: every faculty building when the layer is on, or the buildings of the faculty in focus ----
function facLead(){const u=state.tab==='explore'&&facUnits.get(state.faculty);return new Set(u?facWhere(u).map(w=>w.id):[]);}   // labels that must show
function facTints(){
  const focus=state.tab==='explore'?facUnits.get(state.faculty):null,out=[];
  if(state.tab!=='explore'||!(state.facLayer||focus))return out;
  for(const [pid,l] of facOf){const p=places.get(pid);if(!p)continue;const inF=!!focus&&l.some(x=>x.u===focus);
    if(!state.facLayer&&!inF)continue;out.push({p,colors:inF?[focus.color]:l.map(x=>x.u.color),focus:inF,dim:!!focus&&!inF});}
  return out;
}
function renderFacOverlay(){
  const layer=$('facOverlay');if(!layer)return;layer.setAttribute('viewBox','0 0 '+view.width+' '+view.height);
  if(state.map!=='atlas'||is3d()){setHtml(layer,'');return;}
  const list=facTints(),defs=[];
  const body=list.map((t,i)=>{let fill=t.colors[0];
    // a building shared by several units is striped in their colours
    if(t.colors.length>1){const id='fp-'+t.p.id,n=t.colors.length;defs.push('<pattern id="'+id+'" width="'+(7*n)+'" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">'+t.colors.map((c,k)=>'<rect x="'+7*k+'" width="7" height="10" fill="'+c+'"/>').join('')+'</pattern>');fill='url(#'+id+')';}
    return [t.p.footprint,...(t.p.parts||[]).map(id=>BLOCK_SHAPE.get(id)).filter(Boolean)].map(shape=>'<polygon class="'+(t.focus?'focus':t.dim?'dim':'')+'" style="--i:'+i+'" points="'+shape.map(pt=>pt.join(',')).join(' ')+'" fill="'+fill+'" stroke="'+t.colors[0]+'"/>').join('');}).join('');
  setHtml(layer,(defs.length?'<defs>'+defs.join('')+'</defs>':'')+body);
}
let fac3dKey='';
function fac3d(){
  if(!ready3d)return;
  const list=is3d()?facTints():[],key=list.map(t=>t.p.id+(t.focus?'*':t.dim?'-':'')).join(',');if(key===fac3dKey)return;
  const was=fac3dKey.split(',').filter(k=>k.endsWith('*')).join(','),now=list.filter(t=>t.focus).map(t=>t.p.id+'*').join(',');fac3dKey=key;
  Map3D.setTint(list.map(t=>({place:t.p.id,colors:t.colors.map(cssRgb),a:t.focus?.8:t.dim?.16:.6})),{pulse:now&&now!==was?2600:0});
}
function facRank(p){const head=facOf.has(p.id)&&facGroup(p.id)===p.id;return head&&state.facLayer&&state.tab==='explore'?-40:featuredOrder.includes(p.id)?-10:head?-5:p.category==='宿舍'?0:2;}
// the space a card takes at the bottom of the map, so a camera move does not frame things behind it
// Measured from layout offsets, not the on-screen box, so a card that is still sliding in counts at its resting place.
function cardPad(fallback){const c=$('mapCard')?.firstElementChild,s=$('stage');if(!c||!s||!c.offsetHeight)return fallback;
  let top=0;for(let el=c;el&&el!==s;el=el.offsetParent)top+=el.offsetTop;
  return Math.max(fallback,Math.round(s.clientHeight-top+14));}
function facWidth(fl){return Math.ceil(fl.text.length*10.6)+26+fl.colors.length*9;}   // the faculty line under a label: 10.5px text after one dot per unit
function facInk(c){const v=cssRgb(c);return 'rgb('+v.map(x=>Math.round(x*255*.7)).join(',')+')';}
function renderPins(){
  if(!['atlas','official'].includes(state.map)||state.tab==='pano')return;
  if(is3d()){renderPins3D();return;}
  const display=state.tab==='explore'?placesMatching():atlas.places,lead=facLead();
  const priority=p=>p.id===state.selected||state.tab==='route'&&[state.from,state.to].includes(p.id)?-100:lead.has(p.id)?-50:facRank(p);
  const matches=[...display].sort((a,b)=>priority(a)-priority(b));
  const ppins=[];
  // Every label that may show, in the order they claim space. Where each one lands is worked out by placePins, which a
  // camera move calls on its own: moving the map never rebuilds this list.
  pinList=matches.map((p,i)=>{
    const [x,y]=p.official,endpoint=state.tab==='route'&&[state.from,state.to].includes(p.id);
    const selected=state.selected===p.id||endpoint, name=p.category==='宿舍'&&p.number?p.zone[0]+p.number+'公寓':p.name, fl=facLine(p.id);
    return {i,id:p.id,x,y,w:Math.max(name.length*12+28+(endpoint?20:0),fl?facWidth(fl):0),h:fl?38:24,keep:selected||lead.has(p.id),
      html:'<button class="pin '+(selected?'active':'')+(fl?' has-fac':'')+(lead.has(p.id)?' fac-lead':'')+'" style="left:'+x+'px;top:'+y+'px'+(fl?';--fc:'+fl.colors[0]:'')+'" data-cat="'+p.category+'" data-place="'+p.id+'" title="'+esc(p.name+(fl?' · '+facOf.get(p.id).map(x=>x.u.name).join('、'):''))+'">'+icon(placeIcon(p))+(endpoint?(p.id===state.from?'起 · ':'终 · '):'')+esc(name)+(fl?'<small class="pin-fac">'+facDots(fl.colors)+esc(fl.text)+'</small>':'')+'</button>'};
  });
  if(state.shade&&state.map==='atlas'){
    const hi=shadeHour()>=11&&shadeHour()<=13;
    for(const s of panoPoints){
      const tree=hi?s.tree[1]:s.tree[0];
      ppins.push('<button class="pano-pin" style="left:'+s.x+'px;top:'+s.y+'px;--tone:'+shadeColor(tree)+'" data-scene="'+s.id+'" title="720 云实景测点：'+esc(s.name)+' · 林荫 '+Math.round(tree*100)+'%" aria-label="打开实景 '+esc(s.name)+'">'+icon('pano',12)+'</button>');}
  }
  if(state.panoLayer&&state.map==='atlas'){
    const vis=()=>true;
    const stops=state.tourMap!==null?sceneTours[state.tourMap].stops:[];
    for(const s of tour.scenes){const r=sceneIdx[s.id];if(!r||r.x===undefined||r.i||!vis(r.x,r.y)||(state.shade&&panoById.has(s.id)))continue;
      const order=stops.indexOf(s.id);
      ppins.push('<button class="pano-pin'+(order>=0?' stop':'')+'" style="left:'+r.x+'px;top:'+r.y+'px" data-scene="'+s.id+'" title="实景：'+esc(s.name)+'" aria-label="打开实景 '+esc(s.name)+'">'+(order>=0?order+1:icon('pano',12))+'</button>');}
    for(const [pid,ids] of scenesOfPlace){const n=ids.filter(i=>sceneIdx[i].i).length,p=places.get(pid);if(!n||!p||!vis(p.x,p.y))continue;
      ppins.push('<button class="pano-pin indoor" style="left:'+(p.x+18)+'px;top:'+(p.y+15)+'px" data-place-scenes="'+pid+'" title="'+esc(p.name)+' · 楼内全景 '+n+' 个">'+n+'</button>');}
  }
  setHtml($('panoPins'),ppins.join(''));
  placePins();
  const layer=$('footprints');
  layer.setAttribute('viewBox','0 0 '+view.width+' '+view.height);
  const buildingIds=new Set(atlas.structures.map(s=>s.id));
  setHtml(layer,[...display].sort((a,b)=>Number(buildingIds.has(a.id))-Number(buildingIds.has(b.id))).map(p=>[p.footprint,...(p.parts||[]).map(id=>BLOCK_SHAPE.get(id)).filter(Boolean)].map(shape=>'<polygon class="'+(p.id===state.selected?'marked ':'')+(!buildingIds.has(p.id)&&!p.sharedFootprint?'open-area':'')+'" points="'+shape.map(pt=>pt.join(',')).join(' ')+'" data-place="'+p.id+'"><title>'+esc(p.name)+'</title></polygon>').join('')).join(''));
  renderFacOverlay();
}
let pinList=[];
// Which labels show at the current camera: the ones in the window first (as many as fit without overlapping), then a ring
// around it, so a quick pan never uncovers an empty edge before the next placement. Kept elements are reused.
function placePins(){
  if(!['atlas','official'].includes(state.map)||state.tab==='pano'||is3d())return;
  const v=$('mapViewport'),width=v.clientWidth,height=v.clientHeight,[c,s]=rotCS(view.rot),accepted=[],shown=[];
  const mx=Math.max(120,width*.25),my=Math.max(100,height*.25);
  for(const ring of [false,true])for(const it of pinList){
    const px=view.x+view.scale*(c*it.x-s*it.y),py=view.y+view.scale*(s*it.x+c*it.y);
    if((px< -40||px>width+40||py< -20||py>height+30)!==ring)continue;
    if(ring&&(px< -mx||px>width+mx||py< -my||py>height+my))continue;
    const rect=[px-it.w/2,py-it.h-4,px+it.w/2,py+4];
    if((ring||!it.keep)&&accepted.some(q=>q[0]<rect[2]+3&&q[2]>rect[0]-3&&q[1]<rect[3]&&q[3]>rect[1]))continue;
    accepted.push(rect);shown.push(it);
  }
  keyedHtml($('mapPins'),shown.sort((a,b)=>a.i-b.i));
  setHtml($('roadNames'),state.map==='atlas'&&view.scale>.65?ROAD_NAMES.map(([name,x,y,vertical])=>'<span class="road-name '+(vertical?'vertical':'')+'" style="left:'+x+'px;top:'+y+'px">'+name+'</span>').join(''):'');
}
// Put exactly `items` ({id, html}) in `box`, in that order: an element whose markup did not change stays the same element,
// so it is neither drawn again nor loses hover or focus.
function keyedHtml(box,items){
  const old=box.__keyed||new Map(),next=new Map();
  for(const it of items){let el=old.get(it.id);
    if(!el||el.__html!==it.html){const t=document.createElement('template');t.innerHTML=it.html;el=t.content.firstElementChild;el.__html=it.html;}
    next.set(it.id,el);}
  const keep=new Set(next.values());
  for(const el of [...box.children])if(!keep.has(el))el.remove();
  let at=box.firstElementChild;
  for(const el of next.values()){if(el===at)at=at.nextElementSibling;else box.insertBefore(el,at);}
  box.__keyed=next;box.__html=null;
}
let pinFrame=0,camAnim=0,camHold=false,settleTimer=0,wheelTo=0,flyGoal=null;
// Ease the map camera from where it is to wherever `move` puts it: the point in the middle of the view travels in a straight
// line on the map while the zoom changes evenly and the map turns the shorter way round.
function fly(move,ms=440){
  const s={x:view.x,y:view.y,scale:view.scale,rot:view.rot};stopFly();
  camHold=true;try{move();}finally{camHold=false;}
  const e={x:view.x,y:view.y,scale:view.scale,rot:view.rot},v=$('mapViewport'),cx=v.clientWidth/2,cy=v.clientHeight/2,dr=turnAngle(e.rot-s.rot);
  if(reduceMotion||!cx||!s.scale||!flyReady||(Math.abs(s.x-e.x)<1&&Math.abs(s.y-e.y)<1&&Math.abs(s.scale/e.scale-1)<.002&&Math.abs(dr)<.1)){applyTransform();return;}
  const sc=toMap(cx,cy,s),ec=toMap(cx,cy,e),t0=performance.now();
  const step=now=>{const t=Math.min(1,(now-t0)/ms),q=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    view.scale=s.scale*Math.pow(e.scale/s.scale,q);view.rot=s.rot+dr*q;pinTo([sc[0]+(ec[0]-sc[0])*q,sc[1]+(ec[1]-sc[1])*q],[cx,cy]);
    if(t>=1){Object.assign(view,e);camAnim=0;flyGoal=null;}else camAnim=requestAnimationFrame(step);
    applyTransform();};
  Object.assign(view,s);camAnim=requestAnimationFrame(step);flyGoal=e;
}
let flyReady=false;
function stopFly(){cancelAnimationFrame(camAnim);camAnim=0;wheelTo=0;flyGoal=null;}
// Turn the flat map about the middle of the view. Presses that come quickly add up: each one turns on from where the
// turn under way was going to end.
function turnBy(deg,now){
  const v=$('mapViewport'),c=[v.clientWidth/2,v.clientHeight/2],to=camAnim&&flyGoal||view,m=toMap(c[0],c[1],to),rot=to.rot+deg,scale=to.scale;
  const go=()=>{view.rot=rot;view.scale=scale;pinTo(m,c);applyTransform();};
  if(now){stopFly();go();}else fly(go,320);
}
let flatMap=false;
// ---- 3D model of the campus (map3d.js). The flat map stays: the 2D / 3D button, ?view=2d, or a device without WebGL2. ----
state.dim=(new URL(location.href).searchParams.get('view')||window.SUNWALK_VIEW)==='2d'?'2d':'3d';
let ready3d=false,view3dSet=false,walk3d=null,switching=false,pin3dKey=null,pin3dItems=[];
let settleDimension=null;
// sunlight and shadows in the 3D model are optional; the default is an even light that looks the same at any hour
state.light3d=(()=>{try{return localStorage.getItem('sunwalk.light3d')==='1';}catch{return false;}})();
function init3d(){
  if(ready3d||state.dim!=='3d')return ready3d;
  if(typeof Map3D==='undefined'||!window.CAMPUS_3D){state.dim='2d';return false;}
  ready3d=Map3D.init($('map3d'),atlas,window.CAMPUS_3D,{get reduceMotion(){return reduceMotion;},groundUrl:'assets/campus-ground.svg?v='+BUILD,onMove:on3dMove,onPick:on3dPick,onHover:on3dHover,onFrame:on3dFrame,onReady:()=>schedulePins()});
  if(!ready3d){state.dim='2d';toast('这台设备不支持 3D 显示，已改用平面地图。');}
  return ready3d;
}
function is3d(){return state.dim==='3d'&&ready3d&&state.map==='atlas'&&state.tab!=='pano';}
// The part of the view panels leave free. On a phone the card at the bottom is measured (it can be taller or shorter),
// and the column of map tools on the right is kept clear.
function pads3d(){const mobile=innerWidth<=680,card=f=>mobile?cardPad(f):f;
  return {left:mobile?14:44,right:mobile?56:74,top:mobile?98:112,bottom:state.tab==='route'?card(mobile?150:215):state.selected?card(mobile?120:150):state.faculty&&state.tab==='explore'?cardPad(150):mobile?40:64};}
// A tall map (a tablet held upright) looks down more steeply, so the campus fills the height instead of leaving sky above it.
function overview3d(ms){const mobile=innerWidth<=680,s=$('stage'),tall=!mobile&&s.clientHeight>s.clientWidth*1.25;Map3D.fit(mobile?[[1140,60],[2040,60],[2040,1300],[1140,1300]]:[[30,280],[2040,40],[2040,1300],[30,1300]],pads3d(),{bearing:0,pitch:mobile?52:tall?62:50,ms});}
function sync3d(){
  if(state.dim==='3d'&&state.map==='atlas'&&state.tab!=='pano')init3d();
  const on=is3d();document.body.dataset.dim=on?'3d':'2d';$('map3d').hidden=!on;$('pins3d').hidden=!on;if(!on){$('tip3d').hidden=true;$('walker3d').hidden=true;}
  dimButtons(state.map==='atlas'?(state.dim==='3d'&&ready3d?'3d':'2d'):null);
  const compass=document.querySelector('.compass'),turnable=on||['atlas','official'].includes(state.map)&&state.tab!=='pano';
  compass.disabled=!turnable;   // the flat map turns too, so its compass also brings north back up
  compass.setAttribute('aria-label',compass.title=on?'将三维地图转回正北':turnable?'将地图转回正北':'地图指北针');
  $('light3d').setAttribute('aria-pressed',String(state.light3d));
  if(on){Map3D.resize();env3d();
    if(!view3dSet){view3dSet=true;overview3d(0);
      // first look: the camera settles from above while the buildings rise
      if(!reduceMotion){const v=Map3D.view();Map3D.setView({...v,dist:v.dist*1.2,pitch:14,grow:0});Map3D.flyTo({...v,grow:1},1500);}}}
}
const DECK3D=()=>window.CAMPUS_3D.bridge.deck*Map3D.M;
function p3(id){const n=atlas.nodes[id];return [n[0],n[1],id[0]==='b'?DECK3D():0];}
function cssRgb(c){if(c[0]==='#')return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);return c.match(/[\d.]+/g).slice(0,3).map(v=>v/255);}
// The sun of the hour shown lights the model: its azimuth and elevation for the date in use, dimmed by the weather.
function env3d(){
  if(!ready3d)return;const M=atlas.shadeModel,p=SunModel.position(M.date,viewHour(),M.lat,M.lon),k=viewSky();
  Map3D.setEnv({az:p.azimuth,el:Routing.daylight(atlas,viewHour())?Math.max(p.elevation,1):Math.min(p.elevation,-4),sun:k.sun,season:state.sunMode==='today'&&leafOff()?1:0,light:state.light3d});
}
function access3d(){
  if(!ready3d)return;if(!is3d()){Map3D.setRibbon('access',null);return;}const open=canExit();
  Map3D.setRibbon('access',atlas.edges.filter(e=>e.role!=='campus').map(e=>{const sky=e.role==='skybridge';return {pts:[p3(e.a),p3(e.b)],w:sky?4.5:3.2,col:[...cssRgb(sky?'#4c83b8':e.closed?'#c0504d':open?'#b77830':'#909b9b'),.9],lift:1.3};}),{order:0});
}
function shade3d(){
  if(!ready3d)return;if(!is3d()||!state.shade){Map3D.setRibbon('shade',null);return;}
  const h=shadeHour(),night=!Routing.daylight(atlas,h),sunShare=viewSky().sun;
  Map3D.setRibbon('shade',atlas.edges.filter(e=>e.kind!=='access'&&e.kind!=='door'&&e.role!=='gate').map(e=>{const s=night?null:Routing.shadeAt(e.shade,h);
    return {pts:[p3(e.a),p3(e.b)],w:e.kind==='axis'?8.5:e.kind==='narrow'?4.2:6.2,col:[...cssRgb(night?'#8794a8':s===null?'#9aa4a0':shadeColor(s,sunShare)),.93],lift:.9};}),{order:1});
}
function route3d(){
  const names=['alts','casing','route','flow'],clear=()=>{names.forEach(k=>Map3D.setRibbon(k,null));walk3d=null;$('walker3d').hidden=true;};
  if(!is3d()){clear();return;}
  if(state.tab==='explore'&&state.tourMap!==null){const pts=tourPoints(state.tourMap).map(p=>[p[0],p[1],0]);clear();
    Map3D.setRibbon('casing',[{pts,w:9,col:[1,1,1,.95],lift:1.2}],{order:2});Map3D.setRibbon('route',[{pts,w:4.6,col:[.71,.39,.16,1],lift:1.5}],{order:3,xray:true});Map3D.setRibbon('flow',[{pts,w:4.6,col:[1,1,1,.9],lift:1.8}],{order:4,flow:true});return;}
  if(state.tab!=='route'||!currentPlan?.choices?.length){clear();return;}
  const p=currentPlan.choices[state.choice],steps=state.step>=0?Directory.steps(p,atlas.nodes):null,cur=steps?.[state.step];
  const walkable=r=>{const ids=r.ids.filter((id,i)=>!(i===0&&r.edges[0]?.kind==='door')&&!(i===r.ids.length-1&&r.edges.at(-1)?.kind==='door'));return ids.map(p3);};   // the link from a door to the inside is not drawn
  Map3D.setRibbon('alts',currentPlan.choices.filter(r=>r!==p).map(r=>({pts:walkable(r),w:3.6,col:[.47,.43,.32,.8],lift:1})),{order:2});
  Map3D.setRibbon('casing',[{pts:walkable(p),w:10.5,col:[1,1,1,.96],lift:1.2}],{order:3,xray:true});
  Map3D.setRibbon('route',p.edges.map((e,i)=>e.kind==='door'?null:{pts:[p3(p.ids[i]),p3(e.to)],w:6.4,lift:1.5,
    col:[...cssRgb(state.step<0||(cur&&i>=cur.first&&i<=cur.last)?(e.role==='skybridge'?'#337db8':['outside','gate'].includes(e.role)?'#b57428':'#087951'):'#849d94'),1]}).filter(Boolean),{order:4,xray:true});
  const part=(cur?p.ids.slice(cur.first,cur.last+2):state.step<0?p.ids:[]).filter(id=>id[0]!=='h').map(p3);
  if(part.length>1){Map3D.setRibbon('flow',[{pts:part,w:6.4,col:[1,1,1,.92],lift:1.8}],{order:5,flow:true});
    const cum=[0];for(let i=1;i<part.length;i++)cum.push(cum[i-1]+Math.hypot(part[i][0]-part[i-1][0],part[i][1]-part[i-1][1]));
    walk3d={pts:part,cum,total:cum.at(-1),dur:Math.max(4,Math.min(14,cum.at(-1)*mpp/22))};}
  else{Map3D.setRibbon('flow',null);walk3d=null;$('walker3d').hidden=true;}
}
// ---- labels over the 3D model are painted on one canvas ----
// About 40 DOM labels moving on every frame cost more than the whole 3D scene: on the integrated GPU a camera flight ran
// at about 60 frames a second with them and at the screen's full rate without. Each label is drawn once into a small
// sprite; a camera move only copies the sprites to their new places. Clicks and hover are resolved from the coordinates.
const lab3d={items:[],shown:[],sprites:new Map(),hover:null,ctx:null,dpr:0,w:0,h:0,dirty:false,rebuilds:0,draws:0,font:'',measure:null};
const ICON2D=new Map();
function icon2d(name){
  if(!ICON2D.has(name)){const p=new Path2D();
    for(const m of (iconPaths[name]||iconPaths.pin).matchAll(/<(path|circle|ellipse|rect)\b([^>]*)>/g)){
      const a=k=>{const r=m[2].match(new RegExp('\\b'+k+'="([^"]*)"'));return r?r[1]:0;},q=new Path2D();
      if(m[1]==='path'){p.addPath(new Path2D(a('d')));continue;}
      if(m[1]==='circle')q.arc(+a('cx'),+a('cy'),+a('r'),0,7);else if(m[1]==='ellipse')q.ellipse(+a('cx'),+a('cy'),+a('rx'),+a('ry'),0,0,7);else q.rect(+a('x'),+a('y'),+a('width'),+a('height'));
      p.addPath(q);}
    ICON2D.set(name,p);}
  return ICON2D.get(name);
}
function rrect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function sprite3d(it){
  const dpr=lab3d.dpr,fc=it.kind==='pin'?it.fac:null,key=[it.kind,it.text,it.icon,it.cat,it.active?1:0,it.tone,it.variant,it.side||0,dpr,fc?fc.text+fc.colors:'',it.lead?1:0].join('|');
  let s=lab3d.sprites.get(key);if(s)return s;
  const F=lab3d.font||(lab3d.font=getComputedStyle(document.body).fontFamily||'sans-serif'),m=lab3d.measure||(lab3d.measure=document.createElement('canvas').getContext('2d'));
  const tw=(font,text,ls=0)=>{m.font=font;return Math.ceil(m.measureText(text).width+ls*text.length);};
  const glyph=(g,name,x,y,size,color)=>{g.save();g.translate(x,y);g.scale(size/24,size/24);g.lineWidth=1.7;g.lineCap=g.lineJoin='round';g.strokeStyle=color;g.stroke(icon2d(name));g.restore();};
  const shadow=(g,c,blur,dy)=>{g.shadowColor=c;g.shadowBlur=blur*dpr;g.shadowOffsetY=dy*dpr;},plain=g=>{g.shadowColor='transparent';g.shadowBlur=0;g.shadowOffsetY=0;};
  let w,h,ax,ay,hit=null,paint;
  // the faculty line under a teaching building's name: one dot per faculty or college, then the name(s)
  const ff='700 10.5px '+F,ft=fc?tw(ff,fc.text)+fc.colors.length*9+2:0;
  const facRow=(g,x,y,ink)=>{for(const c of fc.colors){g.beginPath();g.arc(x+3.5,y,3.6,0,7);g.fillStyle=c;g.fill();g.lineWidth=1.3;g.strokeStyle='#fff';g.stroke();x+=9;}
    g.font=ff;g.textBaseline='middle';if(ink){g.fillStyle=ink;g.fillText(fc.text,x+2,y+.5);return;}g.lineJoin='round';g.lineWidth=3;g.strokeStyle='#fff';g.strokeText(fc.text,x+2,y+.5);g.fillStyle=facInk(fc.colors[0]);g.fillText(fc.text,x+2,y+.5);};
  if(it.kind==='pin'&&it.active){
    const f='700 12px '+F,t=tw(f,it.text),bw=7+19+5+Math.max(t,ft)+10,bh=fc?48:34,L=10,T=8,mid=fc?T+17:T+bh/2;w=bw+2*L;h=T+bh+24;ax=w/2;ay=T+bh;hit=[L,T,bw,bh];
    paint=g=>{const gr=g.createLinearGradient(L,T,L+bw,T+bh);gr.addColorStop(0,'#0b7a5e');gr.addColorStop(1,'#075441');
      shadow(g,'rgba(6,74,59,.3)',10,5);g.fillStyle=gr;rrect(g,L,T,bw,bh,8);g.fill();plain(g);
      g.beginPath();g.moveTo(ax-5,ay-1);g.lineTo(ax,ay+5);g.lineTo(ax+5,ay-1);g.fillStyle='#086249';g.fill();
      g.beginPath();g.arc(ax,ay+10,11,0,7);g.fillStyle='rgba(8,115,82,.14)';g.fill();g.beginPath();g.arc(ax,ay+10,5,0,7);g.fillStyle='#178366';g.fill();g.lineWidth=2;g.strokeStyle='#fff';g.stroke();
      g.fillStyle='rgba(255,255,255,.14)';rrect(g,L+7,mid-9.5,19,19,4);g.fill();glyph(g,it.icon,L+9.5,mid-7,14,'#fff');
      g.font=f;g.textBaseline='middle';g.fillStyle='#fff';g.fillText(it.text,L+31,mid+.5);
      if(fc){g.fillStyle='rgba(255,255,255,.16)';g.fillRect(L+31,T+26.5,bw-41,1);facRow(g,L+31,T+36,'rgba(255,255,255,.92)');}};
  }else if(it.kind==='pin'){
    const f='700 12px '+F,t=tw(f,it.text),bw=20+4+Math.max(t,ft)+3,L=5,T=5;w=bw+2*L;h=fc?46:32;ax=w/2;ay=fc?42:28;hit=[L-2,T-2,bw+4,fc?38:24];
    const tone=it.lead&&fc?fc.colors[0]:{宿舍:'#859fcb',生活:'#c89865',运动:'#6da5b6'}[it.cat]||'#76a09d';
    paint=g=>{g.fillStyle=tone;rrect(g,L,T,20,20,6);g.fill();g.lineWidth=1;g.strokeStyle='#fff';g.stroke();glyph(g,it.icon,L+3.5,T+3.5,13,'#fff');
      g.font=f;g.textBaseline='middle';g.lineJoin='round';g.lineWidth=3;g.strokeStyle='#fff';g.strokeText(it.text,L+24,T+10.5);g.fillStyle='#476273';g.fillText(it.text,L+24,T+10.5);
      if(fc)facRow(g,L+24,T+28);};
  }else if(it.kind==='door'){
    const f='700 10.5px '+F,t=tw(f,it.text),bw=t+14,bh=17,L=8,T=5;w=bw+2*L;h=T+bh+8+3;ax=w/2;ay=T+bh+8;
    paint=g=>{const c=it.side===2?'#3d6889':it.side?'#66716d':'#6b3f22';shadow(g,'rgba(0,0,0,.24)',7,3);g.fillStyle=c;rrect(g,L,T,bw,bh,8.5);g.fill();plain(g);g.fillRect(ax-1,T+bh-.5,2,8.5);
      g.font=f;g.textBaseline='middle';g.fillStyle='#fff';g.fillText(it.text,L+7,T+bh/2+.5);};
  }else if(it.kind==='pano'){
    const f='700 11px '+F,num=it.text||'',pill=it.variant==='indoor',d=it.variant==='stop'?24:pill?20:22,bw=pill?Math.max(20,tw(f,num)+12):d,P=5;w=bw+2*P;h=d+2*P;ax=w/2;ay=h/2;hit=[P-2,P-2,bw+4,d+4];
    paint=g=>{shadow(g,'rgba(29,59,47,.4)',4,1);g.fillStyle=pill?'#7a4fb0':it.variant==='stop'?'#b5632a':it.tone||'#2b7a55';rrect(g,P,P,bw,d,d/2);g.fill();plain(g);g.lineWidth=2;g.strokeStyle='#fff';rrect(g,P,P,bw,d,d/2);g.stroke();
      if(num){g.font=f;g.textBaseline='middle';g.textAlign='center';g.fillStyle='#fff';g.fillText(num,ax,ay+.5);}else glyph(g,it.icon||'pano',ax-6,ay-6,12,'#fff');};
  }else{
    const f='11px '+F,ls=2,t=tw(f,it.text,ls);w=t+12;h=22;ax=w/2;ay=h/2;
    paint=g=>{g.font=f;if('letterSpacing' in g)g.letterSpacing=ls+'px';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=2.5;g.strokeStyle='rgba(255,255,255,.85)';g.strokeText(it.text,6,ay+.5);g.fillStyle='#5d6d60';g.fillText(it.text,6,ay+.5);};
  }
  const c=document.createElement('canvas');c.width=Math.ceil(w*dpr);c.height=Math.ceil(h*dpr);const g=c.getContext('2d');g.scale(dpr,dpr);paint(g);
  s={c,w,h,ax,ay,hit};lab3d.sprites.set(key,s);return s;
}
function renderPins3D(){
  Map3D.setSelected(state.tab==='explore'?state.selected:null);renderFacOverlay();fac3d();
  const ends=state.tab==='route'?[state.from,state.to]:[],display=state.tab==='explore'?placesMatching():atlas.places,noon=shadeHour()>=11&&shadeHour()<=13;
  const key=[state.tab,state.selected,ends.join('>'),state.shade,state.shade&&noon,state.panoLayer,state.tourMap,display.length,state.query,state.cat,state.zone,state.faculty,state.facLayer].join('|');
  if(key!==pin3dKey){pin3dKey=key;lab3d.rebuilds++;lab3d.hover=null;
    // The list is rebuilt only when what is shown changes; a camera move just redraws it.
    const items=[],lead=facLead(),priority=p=>p.id===state.selected||ends.includes(p.id)?-100:lead.has(p.id)?-50:facRank(p);
    for(const p of [...display].sort((a,b)=>priority(a)-priority(b))){
      const endpoint=ends.includes(p.id),selected=state.selected===p.id||endpoint,name=p.category==='宿舍'&&p.number?p.zone[0]+p.number+'公寓':p.name,fl=facLine(p.id);
      items.push({kind:'pin',id:p.id,text:(endpoint?(p.id===state.from?'起 · ':'终 · '):'')+name,icon:placeIcon(p),cat:p.category,active:selected,sel:selected||lead.has(p.id),lead:lead.has(p.id),title:p.name,data:{place:p.id},fac:fl,
        x:p.official[0],y:p.official[1],h:Map3D.top(p.id)+5,box:Math.max(name.length*12+28+(endpoint?20:0),fl?facWidth(fl):0),bh:fl?40:26});
    }
    // the doors of the building in question: brown 正门, blue 后门, grey 侧门
    for(const id of [state.tab==='explore'?state.selected:null,...ends].filter(Boolean))for(const d of places.get(id)?.doors||[])
      items.push({kind:'door',text:doorKind(d)+' · '+d.label.split('（')[0],side:d.kind==='main'?0:d.kind==='back'?2:1,x:d.x,y:d.y,h:4.6*Map3D.M,far:1700});
    if(state.shade)for(const s of panoPoints){const tree=noon?s.tree[1]:s.tree[0];
      items.push({kind:'pano',id:s.id,tone:shadeColor(tree),icon:'pano',title:'720 云实景测点：'+s.name+' · 林荫 '+Math.round(tree*100)+'%',data:{scene:s.id},x:s.x,y:s.y,h:2});}
    if(state.panoLayer){const stops=state.tourMap!==null?sceneTours[state.tourMap].stops:[];
      for(const s of tour.scenes){const r=sceneIdx[s.id];if(!r||r.x===undefined||r.i||(state.shade&&panoById.has(s.id)))continue;const order=stops.indexOf(s.id);
        items.push({kind:'pano',id:s.id,variant:order>=0?'stop':'',text:order>=0?String(order+1):'',icon:'pano',title:'实景：'+s.name,data:{scene:s.id},x:r.x,y:r.y,h:2});}
      for(const [pid,ids] of scenesOfPlace){const n=ids.filter(i=>sceneIdx[i].i).length,p=places.get(pid);if(!n||!p)continue;
        items.push({kind:'pano',id:pid,variant:'indoor',text:String(n),title:p.name+' · 楼内全景 '+n+' 个',data:{placeScenes:pid},x:p.x+14,y:p.y+10,h:Map3D.top(pid)+2});}}
    for(const [name,x,y] of ROAD_NAMES)items.push({kind:'road',text:name,x,y,h:1,far:1900});
    // labels that were not on screen before fade in; a label that has just been selected pops
    const now=performance.now(),seen=new Set(lab3d.shown.map(e=>labKey(e.it))),wasActive=new Set(lab3d.items.filter(it=>it.active).map(labKey));
    for(const it of items){const k=labKey(it);it.born=reduceMotion||seen.has(k)?0:now;it.pop=!reduceMotion&&it.active&&!wasActive.has(k)?now:0;}
    lab3d.items=items;
  }
  drawLabels3D();
}
function labKey(it){return it.kind+'|'+(it.id||'')+'|'+(it.kind==='pin'?it.title:it.text);}
function drawLabels3D(){
  const cv=$('pins3d'),[w,h]=Map3D.size(),dpr=Math.min(window.devicePixelRatio||1,2),v=Map3D.view(),accepted=[],shown=[];
  if(lab3d.dpr!==dpr){lab3d.dpr=dpr;lab3d.sprites.clear();}
  if(lab3d.w!==w||lab3d.h!==h||cv.width!==Math.round(w*dpr)){lab3d.w=w;lab3d.h=h;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
  const g=lab3d.ctx||(lab3d.ctx=cv.getContext('2d'));g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv.width,cv.height);
  for(const it of lab3d.items){   // the same thinning as before: a label gives way to one placed earlier
    const s=Map3D.project(it.x,it.y,it.h*v.grow);
    if(!s||s.x<-40||s.x>w+40||s.y<(it.box?4:-12)||s.y>h+30||(it.far&&v.dist>it.far))continue;
    if(it.box){const r=[s.x-it.box/2,s.y-(it.bh||26),s.x+it.box/2,s.y+4];if(!it.sel&&accepted.some(q=>q[0]<r[2]+3&&q[2]>r[0]-3&&q[1]<r[3]&&q[3]>r[1]))continue;accepted.push(r);}
    shown.push({it,x:s.x,y:s.y});
  }
  const now=performance.now();let moving=false;
  for(const top of [false,true])for(const e of shown){   // selected labels are painted last, on top
    if(!!e.it.sel!==top)continue;const sp=sprite3d(e.it);e.l=Math.round((e.x-sp.ax)*dpr)/dpr;e.t=Math.round((e.y-sp.ay)*dpr)/dpr;e.w=sp.w;e.h=sp.h;e.hit=sp.hit&&e.it.data?[e.l+sp.hit[0],e.t+sp.hit[1],sp.hit[2],sp.hit[3]]:null;
    const a=e.it.born?Math.min(1,(now-e.it.born)/260):1,p=e.it.pop?Math.min(1,(now-e.it.pop)/320):1;
    if(a<1||p<1){moving=true;const s=p<1?1+.16*Math.sin(p*Math.PI)*(1-p)-.1*(1-p)*(1-p):1,lift=(1-a)*(1-a)*7;   // fade up into place / a small overshoot
      g.globalAlpha=a*a*(3-2*a);g.drawImage(sp.c,Math.round((e.x-sp.ax*s)*dpr),Math.round((e.y-sp.ay*s+lift)*dpr),Math.round(sp.c.width*s),Math.round(sp.c.height*s));g.globalAlpha=1;}
    else g.drawImage(sp.c,Math.round(e.l*dpr),Math.round(e.t*dpr));
    if(e.it===lab3d.hover&&e.hit){g.save();g.scale(dpr,dpr);g.lineWidth=2;g.strokeStyle='#0b5e43';rrect(g,e.hit[0]-1,e.hit[1]-1,e.hit[2]+2,e.hit[3]+2,e.it.kind==='pano'?e.hit[3]/2+1:8);g.stroke();g.restore();}
  }
  lab3d.shown=shown;lab3d.dirty=false;lab3d.draws++;
  if(!moving)for(const it of lab3d.items){it.born=0;it.pop=0;}   // all settled: later moves draw at full strength at once
  else if(!lab3d.fadeRaf)lab3d.fadeRaf=requestAnimationFrame(()=>{lab3d.fadeRaf=0;if(is3d())drawLabels3D();});
}
function label3dAt(x,y){let hit=null;for(const e of lab3d.shown){const r=e.hit;if(r&&x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3]&&(!hit||e.it.sel||!hit.sel))hit=e.it;}return hit;}
// a label does what the button it replaced did: the page's one click handler reads the same data-* attributes
function fireLabel(it){const b=$('labelProxy');for(const k of Object.keys(b.dataset))delete b.dataset[k];Object.assign(b.dataset,it.data);b.className=it.kind==='pin'?'pin':'';b.click();}
window.Labels3D={list:k=>lab3d.shown.filter(e=>!k||e.it.kind===k).map(e=>({kind:e.it.kind,text:e.it.text,id:e.it.id,active:!!e.it.active,fac:e.it.fac?.text||null,x:e.x,y:e.y,hit:e.hit})),
  all:k=>lab3d.items.filter(it=>!k||it.kind===k).map(it=>({kind:it.kind,text:it.text,id:it.id,active:!!it.active,fac:it.fac?.text||null})),
  at:(x,y)=>{const it=label3dAt(x,y);return it?{kind:it.kind,text:it.text,id:it.id}:null;},stats:()=>({rebuilds:lab3d.rebuilds,draws:lab3d.draws,sprites:lab3d.sprites.size,nodes:$('pins3d').childElementCount})};
// ---- 2D ↔ 3D: the flat map and the model show the same ground from straight above, so one can turn into the other ----
// A map turned clockwise by rot looks like the model seen with bearing −rot, so a turn carries over both ways.
function view2dTo3d(){const v=$('mapViewport'),w=v.clientWidth,h=v.clientHeight,c=toMap(w/2,h/2);return {x:c[0],z:c[1],dist:h/(2*view.scale*Math.tan(Map3D.FOV/2)),bearing:-view.rot,pitch:0,grow:0};}
function view3dTo2d(){const c=Map3D.view(),v=$('mapViewport'),h=v.clientHeight;stopFly();view.scale=h/(2*c.dist*Math.tan(Map3D.FOV/2));view.rot=turnAngle(-c.bearing);pinTo([c.x,c.z],[v.clientWidth/2,h/2]);applyTransform();}
function dimButtons(d){for(const [id,k] of [['dim3dBtn','3d'],['dim2dBtn','2d']]){$(id).classList.toggle('active',d===k);$(id).setAttribute('aria-pressed',String(d===k));}}
function chooseDim(d){
  settleDimension?.();
  if(state.map!=='atlas'){state.dim=d;showMap('atlas');return;}   // coming back from 学校原图 / 定位图
  if((d==='3d')!==is3d())switchDim();
}
function switchDim(){
  if(switching)return;
  if(state.map!=='atlas'){state.dim='3d';showMap('atlas');return;}
  const to3=!is3d(),cv=$('map3d'),body=document.body,layers=()=>{renderPins();renderPath();refreshAccess();};
  let openingFrame=0,fadeTimer=0;
  function finish(){
    if(settleDimension!==finish)return;
    settleDimension=null;switching=false;
    cancelAnimationFrame(openingFrame);clearTimeout(fadeTimer);
    if(to3)Map3D.setView({pitch:50,grow:1});
    else if(state.dim!=='2d'){
      Map3D.setView({pitch:0,grow:0});view3dTo2d();state.dim='2d';   // the flat map keeps the model's heading
    }
    cv.style.opacity='';body.classList.remove('dim-switch');sync3d();layers();
  }
  if(to3){
    state.dim='3d';if(!init3d()){showMap('atlas');return;}
    toast('3D 校园：拖动平移，滚轮缩放，按住右键或 Shift 拖动旋转。');
    view3dSet=true;
    if(!reduceMotion){body.classList.add('dim-switch');cv.style.opacity='0';}
    sync3d();Map3D.setView(view2dTo3d());layers();
  }else{
    toast('平面地图：拖动平移，滚轮缩放，按住右键或 Shift 拖动旋转。');dimButtons('2d');
  }
  switching=true;settleDimension=finish;
  if(reduceMotion){finish();return;}
  if(to3){
    openingFrame=requestAnimationFrame(()=>{cv.style.opacity='';Map3D.flyTo({pitch:50,grow:1},850,finish);});
  }else{
    Map3D.flyTo({pitch:0,grow:0},640,()=>{
      view3dTo2d();state.dim='2d';body.classList.add('dim-switch');layers();cv.style.opacity='0';
      fadeTimer=setTimeout(finish,360);
    });
  }
}
// User input can take ownership of the camera before its flyTo callback runs.
for(const event of ['pointerdown','wheel','keydown']){
  document.addEventListener(event,()=>settleDimension?.(),{capture:true,passive:true});
}
let bearing3d=null;
function on3dMove(){lab3d.dirty=true;updateMapScale();if(!$('tip3d').hidden)$('tip3d').hidden=true;   // the labels are redrawn in the same frame as the model (on3dFrame)
  const b=(-Map3D.view().bearing).toFixed(1);if(b!==bearing3d){bearing3d=b;$('mapUI').style.setProperty('--bearing',b+'deg');updateSun();}}
function on3dPick(hit,x,y){$('tip3d').hidden=true;const L=x===undefined?null:label3dAt(x,y);if(L){fireLabel(L);return;}if(hit?.place)pickPlace(hit.place,false);}
function on3dHover(id,x,y,block){const t=$('tip3d'),L=x===undefined?null:label3dAt(x,y);
  if(L!==lab3d.hover){lab3d.hover=L;drawLabels3D();}
  if(L){$('map3d').style.cursor='pointer';t.hidden=L.kind==='pin';if(L.kind!=='pin'){t.textContent=L.title;t.style.left=x+'px';t.style.top=y+'px';}return;}
  const p=id&&places.get(id);if(!p){t.hidden=true;return;}
  const info=window.CAMPUS_3D.buildings[block||p.sharedFootprint||p.id];t.hidden=false;t.textContent=p.name+(info&&info.floors?' · '+info.floors+' 层':'')+(facOf.has(p.id)?' · '+facOf.get(p.id).map(x=>x.u.name).join('、'):'');t.style.left=x+'px';t.style.top=y+'px';}
function on3dFrame(now){
  if(is3d()){const s=Map3D.size();if(lab3d.dirty||s[0]!==lab3d.w||s[1]!==lab3d.h)drawLabels3D();}
  const el=$('walker3d');if(!walk3d||!is3d()||reduceMotion){el.hidden=true;return;}
  const d=(now/1000%walk3d.dur)/walk3d.dur*walk3d.total;let i=0;while(i<walk3d.cum.length-2&&walk3d.cum[i+1]<d)i++;
  const a=walk3d.pts[i],b=walk3d.pts[i+1],k=(d-walk3d.cum[i])/Math.max(.001,walk3d.cum[i+1]-walk3d.cum[i]),s=Map3D.project(a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k+3);
  el.hidden=!s;if(s)el.style.transform='translate3d('+s.x.toFixed(1)+'px,'+s.y.toFixed(1)+'px,0)';
}
function doorSrc(p){const s=p.doors?.[0]?.src;return s==='地面'||s==='航拍'?'依据 720 云实景':s==='平面图'?'依据团队提供的楼层平面图':s==='团队'?'依据团队在地图上的标注':s==='类推'?'宿舍门按实景所见类推在山墙端':'全景里看不到，按朝向步道的一侧推定';}
function doorKind(d){return d.kind==='main'?'正门':d.kind==='back'?'后门':'侧门';}
function doorLine(p){const a=p.edges[0],b=p.edges.at(-1),parts=[];if(a?.kind==='door')parts.push('从'+a.name+'出');if(b?.kind==='door'&&p.edges.length>1)parts.push('到'+b.name);return parts.length?'<br>'+esc(parts.join(' → ')):'';}
function schedulePins(){if(!pinFrame)pinFrame=requestAnimationFrame(()=>{pinFrame=0;renderPins();});}
function zoneView(zone){
  if(!['atlas','official'].includes(state.map))showMap('atlas');
  if(is3d()){if(zone==='全校')overview3d();else Map3D.fit(atlas.places.filter(p=>p.zone===zone).map(p=>p.official),pads3d(),{});return;}
  if(zone==='全校'){fly(()=>measurePlane(true));return;}
  const list=atlas.places.filter(p=>p.zone===zone);
  fitPoints(list.map(p=>p.official));
}
function fitPoints(points,o={}){
  settleDimension?.();
  if(!points.length)return;
  if(is3d()){Map3D.fit(points,pads3d(),{minDist:260,...o});return;}
  const v=$('mapViewport'),w=v.clientWidth,h=v.clientHeight,[c,s]=rotCS(view.rot);
  // measured the way the points lie on screen, so a turned map frames them just as well
  const xs=points.map(p=>c*p[0]-s*p[1]),ys=points.map(p=>s*p[0]+c*p[1]),left=Math.min(...xs),top=Math.min(...ys),rw=Math.max(...xs)-left,rh=Math.max(...ys)-top;
  const mobile=innerWidth<=680,marginX=mobile?120:160,topSpace=mobile?96:110,card=f=>mobile?cardPad(f):f;
  const bottomSpace=state.tab==='route'?card(mobile?150:215):state.selected?card(mobile?120:150):state.faculty&&state.tab==='explore'?cardPad(150):45,usableHeight=Math.max(95,h-topSpace-bottomSpace);
  fly(()=>{view.scale=Math.max(view.base*.5,Math.min(view.base*6,(w-marginX)/Math.max(rw,110),usableHeight/Math.max(rh,110)));
    view.x=w*.5-(left+rw/2)*view.scale;view.y=topSpace+usableHeight/2-(top+rh/2)*view.scale;applyTransform();});
}
function measurePlane(overview=false){
  const orig=state.map==='official';view.width=orig?atlas.official.width:atlas.width;view.height=orig?atlas.official.height:atlas.height;
  const plane=$('mapPlane');plane.style.width=view.width+'px';plane.style.height=view.height+'px';
  const img=plane.querySelector('.base-map'),src=orig?atlas.official.image:'assets/campus.svg?v='+BUILD+(flatMap?'#flat':'');if(img.getAttribute('src')!==src)img.src=src;
  const ext=!orig&&atlas.extent?atlas.extent:null;
  Object.assign(img.style,ext?{left:ext.x+'px',top:ext.y+'px',width:ext.w+'px',height:ext.h+'px',right:'auto',bottom:'auto'}:{left:'',top:'',width:'',height:'',right:'',bottom:''});
  const w=$('mapViewport').clientWidth,h=$('mapViewport').clientHeight;
  if(!w||!h)return;
  planeSize={width:w,height:h};view.rot=0;   // a fresh view of the whole map is north up
  view.base=Math.min(w/view.width,h/(orig?view.height:1320));
  view.scale=view.base;view.x=(w-view.width*view.scale)/2;view.y=(h-view.height*view.scale)/2;
  if(ext){const fx=-150,fy=-130,fw=2360,fh=1590;view.scale=view.base=Math.min(w/fw,h/fh);view.x=(w-fw*view.scale)/2-fx*view.scale;view.y=(h-fh*view.scale)/2-fy*view.scale;}
  if(!orig&&!overview&&innerWidth<=680){view.scale=Math.max(view.base,h/1540);view.x=w/2-1440*view.scale;view.y=(h-1320*view.scale)/2;}
  refreshAccess();
  applyTransform();
}
let pinScale=0,pinTurn=null,strokeScale=0,placeTimer=0,placeAt=0;
function applyTransform(){
  const v=$('mapViewport'),vw=v.clientWidth,vh=v.clientHeight;view.rot=turnAngle(view.rot);
  // keep some of the map in the window: the box around the (possibly turned) drawing may not leave it
  const xs=[],ys=[];for(const [px,py] of [[0,0],[view.width,0],[0,view.height],[view.width,view.height]]){const q=toScreen(px,py);xs.push(q[0]);ys.push(q[1]);}
  view.x+=Math.min(vw-55-Math.min(...xs),Math.max(55-Math.max(...xs),0));view.y+=Math.min(vh-45-Math.min(...ys),Math.max(45-Math.max(...ys),0));
  if(camHold)return;
  const plane=$('mapPlane'),r=view.rot;plane.style.transform='translate('+view.x+'px,'+view.y+'px)'+(r?' rotate('+r+'deg)':'')+' scale('+view.scale+')';
  // Composite the layer only while it is moving; once it rests the browser repaints it at the real zoom, so text and lines stay sharp.
  plane.classList.add('moving');clearTimeout(settleTimer);settleTimer=setTimeout(settleMap,180);
  // Labels keep their size and stay upright: only the three layers that hold them hear about the zoom and the turn.
  const k=(vw<600?.88:1)/view.scale,labels=[$('mapPins'),$('panoPins'),$('roadNames')];
  if(k!==pinScale||r!==pinTurn)plane.classList.add('scaling');
  if(k!==pinScale){pinScale=k;for(const el of labels)el.style.setProperty('--counter',k);}
  if(r!==pinTurn){pinTurn=r;for(const el of labels)el.style.setProperty('--unrot',-r+'deg');$('roadNames').style.setProperty('--flip',Math.abs(r)>90?'180deg':'0deg');
    $('mapUI').style.setProperty('--rot2d',r+'deg');updateSun();}
  if(view.scale!==strokeScale){strokeScale=view.scale;syncMapStrokes();}   // a pan leaves the line widths alone
  placeSoon();
  updateMapScale();
}
// While the map moves, the labels are placed again at most about nine times a second; once it rests, all of it is redone.
function placeSoon(){if(!placeTimer)placeTimer=setTimeout(()=>{placeTimer=0;placeAt=performance.now();placePins();},Math.max(0,placeAt+110-performance.now()));}
let crispScale=0;
function settleMap(){
  const plane=$('mapPlane'),img=plane.querySelector('.base-map');plane.classList.remove('moving','scaling');
  // At rest the drawing lies on whole screen pixels (a pan can end between two), so its layer is shown without blurring.
  if(!view.rot){const dpr=devicePixelRatio||1,o=$('mapViewport').getBoundingClientRect(),ox=o.left+view.x+view.scale*img.offsetLeft,oy=o.top+view.y+view.scale*img.offsetTop;
    view.x+=Math.round(ox*dpr)/dpr-ox;view.y+=Math.round(oy*dpr)/dpr-oy;plane.style.transform='translate('+view.x+'px,'+view.y+'px) scale('+view.scale+')';}
  // after a zoom the drawing is painted once at the new size
  if(Math.abs(view.scale/crispScale-1)>.001){crispScale=view.scale;img.classList.add('refresh');requestAnimationFrame(()=>requestAnimationFrame(()=>img.classList.remove('refresh')));}
  renderPins();
}
function updateMapScale(){
  const scale=$('mapScale');
  if(!scale||state.tab==='pano')return;
  // For a perspective view, measure horizontally at the point the camera looks at.
  const metersPerPixel=is3d()?2*Map3D.view().dist*Math.tan(Map3D.FOV/2)*mpp/Map3D.size()[1]:mpp/view.scale;
  if(!Number.isFinite(metersPerPixel)||metersPerPixel<=0)return;
  const limit=metersPerPixel*(innerWidth<=680?53:83), unit=10**Math.floor(Math.log10(limit));
  const distance=(limit>=5*unit?5:limit>=2*unit?2:1)*unit;
  const width=Math.round(distance/metersPerPixel)+'px', label=distance>=1000?(distance/1000)+' km':distance+' m';
  if(scale.firstElementChild.textContent!==label)scale.firstElementChild.textContent=label;
  if(scale.lastElementChild.style.width!==width)scale.lastElementChild.style.width=width;
}
function zoom(factor,cx,cy,smooth){
  if(state.map==='geo'){map?.setZoom(map.getZoom()+Math.sign(factor-1));return;}
  if(is3d()){Map3D.zoom(factor,cx,cy,smooth);return;}
  const v=$('mapViewport');cx??=v.clientWidth/2;cy??=v.clientHeight/2;
  // Wheel steps are eased and add up, so a spin of the wheel is one smooth move (as in 3D).
  if(smooth==='wheel'&&!reduceMotion){
    const to=clampScale((camAnim&&wheelTo||view.scale)*factor),from=view.scale,t0=performance.now();stopFly();wheelTo=to;
    const step=now=>{const t=Math.min(1,(now-t0)/170),ratio=from*Math.pow(to/from,1-Math.pow(1-t,3))/view.scale;
      view.x=cx-(cx-view.x)*ratio;view.y=cy-(cy-view.y)*ratio;view.scale*=ratio;
      if(t<1)camAnim=requestAnimationFrame(step);else{camAnim=0;wheelTo=0;}
      applyTransform();};
    camAnim=requestAnimationFrame(step);return;
  }
  const next=clampScale(view.scale*factor),ratio=next/view.scale;
  const go=()=>{view.x=cx-(cx-view.x)*ratio;view.y=cy-(cy-view.y)*ratio;view.scale=next;applyTransform();};
  if(smooth)fly(go,260);else{stopFly();go();}
}
function clampScale(k){return Math.max(view.base*.65,Math.min(Math.max(view.base*8,1.7),k));}
function centerPlace(p){
  const pos=state.map==='official'?p.official:[p.x,p.y];if(!pos)return;
  const mobile=innerWidth<=680;
  // On a phone the card covers the lower part of the map: bring the place to the middle of what stays visible.
  if(is3d()){const dist=Math.min(Map3D.view().dist,640);if(mobile&&Map3D.focus)Map3D.focus([pos[0],pos[1],Map3D.top(p.id)||0],pads3d(),{dist});else Map3D.flyTo({x:pos[0],z:pos[1]+Map3D.view().dist*.04,dist});return;}
  const v=$('mapViewport'),top=mobile?96:0,cy=mobile?top+(v.clientHeight-top-cardPad(40))/2:v.clientHeight*.43;
  fly(()=>{view.scale=Math.max(view.scale,mobile?.96:1.05);pinTo(pos,[v.clientWidth/2,cy]);applyTransform();});
}
function pickPlace(id,center=true){
  const p=places.get(id);if(!p)return;
  settleDimension?.();
  if(state.tab==='route'){
    if(state.picking==='from')state.from=id;else state.to=id;
    state.picking=false;state.step=-1;state.choice=0;calculate();routeSide();renderPins();renderPath();renderCard();fitRoute();return;
  }
  setSheetOpen(false);
  state.selected=id;recent.add(id);
  if(state.faculty&&!facUnits.get(state.faculty).buildings.some(b=>facGroup(b.place)===facGroup(id)))state.faculty=null;   // another building: leave the faculty view
  if(state.map==='geo'){
    const g=geo.pois.find(n=>n.name===geoNames[id]);
    if(g)map.setView([g.lat,g.lon],18);else{showMap('atlas');toast('该地标已在校园导览图中打开。');}
  }
  // the card first, so the camera knows how much of the map it covers
  renderPins();updatePlaceList();renderCard();
  if(center&&['atlas','official'].includes(state.map))centerPlace(p);
  if(innerWidth<=680&&center)$('stage').scrollIntoView({block:'start'});
}
// ---- 学部 / 学院 in the cards and the sidebar ----
function facDots(colors){return colors.map(c=>'<i style="background:'+c+'"></i>').join('');}
function facBlock(p){
  const l=facOf.get(p.id),photo=FAC.photos?.[p.id];
  if(!l)return FAC.unlisted?.includes(p.id)?'<p class="fac-none">'+icon('info',13)+'<span>团队提供的《4学部+6学院》名单里没有写到这栋楼，归属待确认。</span></p>':'';
  return '<div class="fac-block"><span class="fac-kicker">所属学部 / 学院</span><div class="fac-list">'+l.map(({u,floor},i)=>'<button class="fac-chip" data-faculty="'+u.id+'" style="--fc:'+u.color+';--i:'+i+'" title="在地图上看'+esc(u.name)+'的全部楼"><i></i><span><b>'+esc(u.name)+'</b><small>'+(floor?'在这栋楼的'+floor:u.depts.length?u.depts.slice(0,3).join('、')+(u.depts.length>3?' 等 '+u.depts.length+' 个':''):u.kind)+'</small></span>'+icon('chevron',13)+'</button>').join('')+'</div>'+
    (photo?'<button class="fac-photo" data-fac-photo="'+p.id+'" title="'+esc(photo.caption)+'"><img alt="'+esc(photo.caption)+'" src="'+photo.src+'" width="'+photo.w+'" height="'+photo.h+'" loading="lazy"><span>'+icon('camera',12)+'门口标识</span></button>':'')+'</div>';
}
function facCard(u){
  const where=facWhere(u),sameBlock=w=>FAC.units.filter(x=>x!==u&&x.buildings.some(b=>facGroup(b.place)===w.id));
  return '<div class="fac-card" style="--fc:'+u.color+'"><button class="close-card" data-act="faculty-clear" aria-label="关闭学部卡">'+icon('close')+'</button><span class="section-label">'+(u.kind==='学部'?'FACULTY · 学部':'COLLEGE · 学院')+'</span><h3><i></i>'+esc(u.name)+'</h3>'+
    (u.depts.length?'<p class="fac-depts">'+u.depts.map((d,i)=>'<span style="--i:'+i+'">'+esc(d)+'</span>').join('')+'</p>':'')+
    '<div class="fac-where">'+where.map((w,i)=>'<button data-place="'+w.id+'" style="--i:'+i+'">'+icon('building',14)+'<span><b>'+esc(w.name)+(w.count>1?' · '+w.count+' 栋':'')+'</b><small>'+(w.floor?'只在 '+w.floor:'整栋')+(sameBlock(w).length?' · 同楼还有'+sameBlock(w).map(x=>x.name).join('、'):'')+'</small></span>'+icon('chevron',13)+'</button>').join('')+'</div>'+
    '<div class="small-actions"><button class="solid" data-route-to="'+where[0].id+'">'+icon('route')+'去'+esc(where[0].short)+'</button><button data-act="faculty-layer" aria-pressed="'+state.facLayer+'">'+(state.facLayer?'只看这个':'看全部学部')+'</button></div><p class="caption">依据团队提供的《4学部+6学院》和楼门口标识牌照片。</p></div>';
}
function facPanel(){
  if(!FAC.units.length)return '';
  const tile=(u,i)=>'<button class="fac-tile'+(state.faculty===u.id?' on':'')+'" data-faculty="'+u.id+'" style="--fc:'+u.color+';--i:'+i+'" aria-pressed="'+(state.faculty===u.id)+'"><i></i><b>'+esc(u.name)+'</b><small>'+facWhere(u).map(w=>esc(w.short)+(w.count>1?'（'+w.count+'栋）':'')+(w.floor?' '+w.floor:'')).join(' · ')+'</small></button>';
  const div=FAC.units.filter(u=>u.kind==='学部'),col=FAC.units.filter(u=>u.kind==='学院');
  return '<section class="fac-panel" aria-label="学部与学院分布"><div class="fac-head">'+icon('school',18)+'<span><b>学部与学院</b><small>'+div.length+' 个学部 · '+col.length+' 个学院 · 点开看楼栋</small></span><button data-act="faculty-layer" aria-pressed="'+state.facLayer+'">'+icon('layers',13)+'地图着色</button></div><div class="fac-grid">'+div.map(tile).join('')+'</div><div class="fac-grid small">'+col.map((u,i)=>tile(u,i+div.length)).join('')+'</div></section>';
}
function facPhoto(id){const ph=FAC.photos?.[id],p=places.get(id);if(!ph||!p)return;
  dialog(p.name+' · 门口标识','<figure class="fac-figure"><img src="'+ph.src+'" alt="'+esc(ph.caption)+'" width="'+ph.w+'" height="'+ph.h+'"><figcaption>'+esc(ph.caption)+'。照片取自团队提供的《4学部+6学院》。</figcaption></figure><div class="small-actions">'+(facOf.get(id)||[]).map(({u})=>'<button data-faculty="'+u.id+'" style="--fc:'+u.color+'" class="fac-mini"><i></i>'+esc(u.name)+'</button>').join('')+'</div>','FACULTY SIGN');}
// focus one faculty: its buildings light up on the map (2D and 3D) and the camera frames them
function focusFaculty(id){
  const u=facUnits.get(id);if(!u)return;dismiss();setSheetOpen(false);
  if(state.tab!=='explore'){state.faculty=id;state.selected=null;setTab('explore');}
  if(state.map!=='atlas')showMap('atlas');
  state.faculty=id;state.selected=null;
  if(state.tab==='explore')updatePlaceList();
  renderPins();renderCard();fitPoints(facPoints(u),{minDist:330});
}
function clearFaculty(){state.faculty=null;if(state.tab==='explore')updatePlaceList();renderPins();renderCard();}
let cardKey='';
function renderCard(){
  const c=$('mapCard'),key=[state.tab,state.map,state.selected,state.faculty,state.step,state.tab==='route'?state.from+'>'+state.to+'#'+state.choice:''].join('|');
  drawCard(c);
  if(key!==cardKey){cardKey=key;const el=c.firstElementChild;if(el){el.classList.remove('card-enter');void el.offsetWidth;el.classList.add('card-enter');}}
}
// a building with floor plans gets a way in: the door the outdoor route arrives at is carried over
function indoorBtn(id,plan){if(typeof Indoor==='undefined'||!Indoor.has(id))return '';const e=plan?.edges?.at(-1),door=e?.kind==='door'&&e.door===id?e.name.slice(places.get(id).name.length):'';
  return '<button class="indoor-btn" data-indoor="'+id+'"'+(door?' data-door="'+esc(door)+'"':'')+'>'+icon('layers',14)+'楼内导航</button>';}
function drawCard(c){
  if(state.tab==='route'){
    const p=currentPlan?.choices?.[state.choice],focusAction=c.contains(document.activeElement)?document.activeElement.dataset.act:null;
    const show=html=>{
      c.innerHTML=html;
      if(!focusAction)return;
      const action=({'begin-steps':'next-step','end-steps':'begin-steps'})[focusAction]||focusAction;
      (c.querySelector('[data-act="'+action+'"]:not(:disabled)')||c.querySelector('[data-act="begin-steps"],[data-act="route-play"]'))?.focus({preventScroll:true});
    };
    if(!p){
      const same=state.from===state.to;
      show('<div class="route-summary route-unavailable"><strong>'+icon('info',18)+(same?'请重新选择终点':'当前条件无法通行')+'</strong><p>'+esc(currentPlan?.error||'请选择起终点')+'</p><button data-act="'+(same?'route-change-end':'use-inside')+'">'+(same?'选择终点':'改为只走校内')+icon('arrow',14)+'</button></div>');return;
    }
    const playing=routeDemoTimer!==null,playIcon='<i class="route-play-icon" aria-hidden="true"></i>';
    const destination=places.get(state.to);
    if(state.step>=0){
      const steps=Directory.steps(p,atlas.nodes),st=steps[state.step],finished=!st;
      const completed=steps.slice(0,state.step).reduce((sum,step)=>sum+step.meters,0),remaining=Math.max(0,p.meters-completed);
      let heading='到达'+destination.name+'附近',detail=esc(destination.accessNote||''),near=null;
      if(st){
        const seg=p.edges.slice(st.first,st.last+1),known=seg.filter(e=>Number.isFinite(e.shade));
        const seconds=known.reduce((sum,e)=>sum+e.seconds,0);
        const shade=seconds?Math.round(known.reduce((sum,e)=>sum+e.shade*e.seconds,0)/seconds*100):null;
        const pts=p.ids.slice(st.first,st.last+2).map(id=>atlas.nodes[id]);
        near=nearestPano(pts.reduce((sum,q)=>sum+q[0],0)/pts.length,pts.reduce((sum,q)=>sum+q[1],0)/pts.length,160);
        heading='沿'+st.name+'向'+st.direction+'行走';
        detail='本段约 <b>'+st.meters+'</b> 米 · '+(sunless()?esc(sunlessWord()):shade===null?'本段遮阴未知':'本段遮阴约 <b>'+shade+'</b>%');
      }
      const stepCount=Math.min(state.step+1,steps.length),playLabel=playing?'暂停演示':finished?'重新演示':'自动演示';
      const stops=finished?indoorBtn(state.to,p):near?'<button data-scene="'+near.id+'" title="'+esc(near.name)+'">'+icon('pano',14)+'沿途实景</button>':'';
      show('<section class="route-summary route-guide" aria-label="路线分步导览"><div class="route-guide-head"><span class="guide-mode">'+icon(finished?'pin':'walk',15)+(finished?'已抵达终点':'分步导览')+'</span><span class="guide-count">'+stepCount+' / '+steps.length+' 段</span>'+(!finished?'<button data-act="end-steps">总览'+icon('frame',13)+'</button>':'')+'</div>'+
        '<h3>'+esc(heading)+'</h3><p class="guide-metrics">'+detail+'</p><div class="guide-progress" role="progressbar" aria-label="已导览的路线距离" aria-valuemin="0" aria-valuemax="'+p.meters+'" aria-valuenow="'+completed+'" aria-valuetext="已导览约 '+completed+' 米，全程约 '+p.meters+' 米"><i style="width:'+Math.min(100,completed/(p.meters||1)*100)+'%"></i></div>'+
        '<div class="guide-caption"><span>'+(finished?'全程约 '+p.meters+' 米':'距终点约 '+remaining+' 米')+'</span>'+stops+'</div>'+
        '<div class="small-actions guide-controls"><button data-act="prev-step"'+(state.step===0?' disabled':'')+'>'+icon('chevron',14)+'上一段</button><button class="solid" data-act="route-play" aria-pressed="'+playing+'" title="'+(playing?'暂停并停留在当前路段':'每 4 秒演示下一段')+'">'+playIcon+playLabel+'</button><button data-act="next-step">'+(finished?'回到总览':state.step===steps.length-1?'到达终点':'下一段')+icon('chevron',14)+'</button></div></section>');return;
    }
    const summaryLinks=indoorBtn(state.to,p)+'<button data-act="segments">'+icon('list',13)+'路段依据</button><button data-act="export">'+icon('download',13)+'保存路线卡</button><button data-act="share-route">'+icon('arrow-up-right',13)+'分享</button>';
    show('<section class="route-summary route-overview" aria-label="所选路线"><span class="access-trip">'+icon('route',15)+Routing.weekdays[state.day-1]+(late()?' · 21:00 后只进不出':'')+' · '+tripLabel(p)+'</span>'+
      '<h3><span>'+esc(places.get(state.from).name)+'</span>'+icon('arrow',17)+'<span>'+esc(destination.name)+'</span></h3>'+
      '<p class="overview-metrics"><span><b>'+p.meters+'</b> 米</span><span><b>'+minutes(p.seconds)+'</b> 分钟</span><span>'+esc(p.labels.join(' / '))+'</span></p>'+
      '<p class="route-extra">'+clock(state.hour)+' 出发，约 '+clock(state.hour+p.seconds/3600)+' 到 · '+(sunless()?sunlessWord():'沿途约 '+shadeShare(p)+'% 在荫凉里')+(currentPlan.sky&&currentPlan.sky.source!=='default'?' · '+esc(skyText(currentPlan.sky)):'')+doorLine(p)+'</p>'+(sunless()?'':shadeStrip(p))+
      '<div class="small-actions guide-entry"><button class="solid" data-act="begin-steps">'+icon('walk',15)+'分步导览</button><button data-act="route-play" aria-pressed="false" title="每 4 秒演示下一段">'+playIcon+'自动演示</button></div><div class="route-card-links">'+summaryLinks+'</div></section>');return;
  }
  if(state.map==='geo'&&(watch!==null||geoStatus)){
    c.innerHTML='<div class="geo-card"><span class="section-label">LIVE LOCATION</span><h3>'+esc(fix?'我的实时位置':'设备定位')+'</h3><p>'+esc(geoStatus)+'</p>'+(fix?'<p>WGS84 · '+fix.lat.toFixed(6)+', '+fix.lon.toFixed(6)+'<br>精度约 ±'+Math.round(fix.accuracy)+' 米 · '+esc(new Date(fix.time).toLocaleTimeString('zh-CN'))+' 更新</p>':'')+'<div class="small-actions">'+(watch!==null?'<button data-act="stop-geo">停止定位</button>':'<button data-act="geo-consent">重试定位</button>')+'<button data-act="fit">返回校园</button></div></div>';return;
  }
  const p=places.get(state.selected);
  if(p){
    const inScenes=placeScenes(p.id),s=[links[p.id],...inScenes].map(i=>scenes.get(i)).find(hasImage)||scenes.get(links[p.id])||scenes.get(inScenes[0]),near=nearestPano(p.x,p.y,140),nearScene=near&&scenes.get(near.id),view360=s||nearScene;
    const shadeLine=near?'<p class="caption shade-note">'+icon('leaf',13)+' 附近实景「'+esc(near.name)+'」约 '+Math.round(near.d*mpp)+' 米：低角度方向林荫 '+Math.round(near.tree[0]*100)+'%，正午 '+Math.round(near.tree[1]*100)+'%（720 云夏季实景测量）</p>':'';
    // heading · details (description, faculty, doors, notes) · actions. On a phone the details fold to one-line rows and the actions scroll sideways (polish.css).
    const saved=Directory.saved.has(p.id);
    c.innerHTML='<div class="place-card" data-cat="'+esc(p.category)+'"><button class="close-card" data-act="clear-place" aria-label="关闭地点卡">'+icon('close')+'</button><div class="selected-heading">'+(view360?.photo?'<img alt="" src="'+scenePhoto(view360)+'">':'<span class="heading-icon" aria-hidden="true">'+icon(placeIcon(p),22)+'</span>')+'<div><span class="section-label">SELECTED LANDMARK</span><h3>'+esc(p.name)+'</h3><span class="caption">'+p.category+' · '+esc(p.zone)+(facOf.has(p.id)?' · <em class="fac-tag" style="--fc:'+facOf.get(p.id)[0].u.color+'">'+esc(facLine(p.id).text)+'</em>':'')+'</span></div></div>'+
      '<div class="card-body"><p>'+esc(p.description)+'</p>'+facBlock(p)+(p.doors?'<p class="caption door-note">'+p.doors.map(d=>'<span><b class="'+d.kind+'">'+doorKind(d)+'</b>'+esc(d.label)+'</span>').join('')+'<small>'+esc(doorSrc(p))+'</small></p>':'')+((atlas.rules?.closedGates||[]).includes(p.id)?'<p class="gate-closed">'+icon('close',13)+' 学生不能从这个门进出</p>':'')+shadeLine+'</div>'+
      '<div class="card-actions"><div class="small-actions"><button class="solid" data-route-to="'+p.id+'">'+icon('route')+'去这里</button>'+(view360?'<button data-scene="'+view360.id+'">'+icon('pano')+(s?'查看实景':'附近实景')+'</button>':'')+indoorBtn(p.id)+'<button data-origin="'+p.id+'">'+icon('walk',14)+'从这出发</button><button data-save="'+p.id+'" aria-pressed="'+saved+'">'+icon('bookmark',14)+(saved?'已收藏':'收藏')+'</button></div>'+
      '<div class="place-links">'+(inScenes.length?'<button data-place-scenes="'+p.id+'">'+icon('pano',13)+'相关全景 '+inScenes.length+' 个</button>':'')+'<button data-act="share-place">'+icon('arrow-up-right',13)+'分享地点</button></div></div></div>';return;
  }
  const fu=state.tab==='explore'&&facUnits.get(state.faculty);
  if(fu){c.innerHTML=facCard(fu);return;}
  c.innerHTML='<button class="map-callout" data-tab="route"><span class="portal-icon">'+icon('leaf')+'</span><span><strong>试试择荫路线</strong><small>比较距离与日照，找到适合你的走法</small></span>'+icon('chevron')+'</button>';
}
function showMap(mode){
  settleDimension?.();
  if(state.tab==='route'&&!['atlas','official'].includes(mode)){setTab('explore');}
  if(!['atlas','official','geo'].includes(mode))mode='atlas';
  $('zoneSwitch').hidden=!['atlas','official'].includes(mode);
  document.body.dataset.layer=mode;
  state.map=mode;const isGeo=mode==='geo';sync3d();
  $('geoMap').hidden=!isGeo;$('mapViewport').hidden=isGeo;
  document.querySelectorAll('.mini-tools [data-act]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.act===(mode==='official'?'tool-original':mode==='geo'?'tool-geo':''))));
  const back=$('layerBack');back.hidden=mode==='atlas';if(mode!=='atlas')back.innerHTML=icon(mode==='official'?'map':'globe',14)+'<b>'+(mode==='official'?'学校原图':'定位图')+'</b><span>返回校园地图</span>'+icon('close',12);
  $('mapFoot').innerHTML='<span>'+(isGeo?'地理位置 · WGS84':mode==='official'?'团队提供 · 西安翻译学院平面示意图':'校园导览示意 · 参照校方平面图绘制')+'</span>';
  if(['atlas','official'].includes(mode)){$('mapFoot').innerHTML='<button id="mapDay" data-act="plan-access"></button><div id="accessLegend" class="access-legend"></div><span class="map-attribution">校内按原图描绘 · 校外据高德示意</span><div class="map-scale" id="mapScale" title="视野中心地面的图估比例尺" aria-label="图估比例尺"><b></b><i></i></div>';}
  refreshAccess();
  if(isGeo){openGeo();renderCard();}else{measurePlane();renderPins();renderPath();renderCard();if(state.tab==='route')fitRoute();}   // the card before the camera: it decides how much map stays free
}
function fit(){
  if(state.map==='geo'){followFix=false;map?.fitBounds(geo.pois.map(p=>[p.lat,p.lon]),{padding:[42,32],maxZoom:17});}
  else if(is3d())overview3d();else{fly(()=>measurePlane(true));} 
}
function openGeo(){
  if(!map){
    map=L.map('geoMap',{zoomControl:false,attributionControl:true,maxZoom:19}).setView(geo.center,17);
    map.attributionControl.setPrefix(false);
    map.on('dragstart',()=>{followFix=false;});
    map.createPane('localBase').style.zIndex=190;
    const colors={campus:['#a6b9a3','#edf1dd'],building:['#a5afa0','#d1d8c9'],water:['#86bdcc','#b0d9e2'],sport:['#95b196','#bdd2a9'],green:['#c6d7bd','#d8e5c9'],road:['#fffdf5','#fffdf5'],path:['#beb092','#beb092']};
    L.geoJSON(window.GEO_BASE,{pane:'localBase',interactive:false,style:f=>{
      const k=f.properties.kind,[color,fillColor]=colors[k];return {pane:'localBase',color,fillColor,fillOpacity:.95,weight:k==='road'?5:k==='path'?2:1,dashArray:k==='path'?'3 4':null};
    }}).addTo(map);
    mapTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map);
    mapTiles.on('tileerror',()=>{if(!$('tileNotice')){const n=document.createElement('div');n.id='tileNotice';n.className='map-error';n.textContent='网络底图暂未载入 · 校园区域使用离线地图';$('geoMap').append(n);}});
    let someLoaded=false;mapTiles.on('tileload',()=>{someLoaded=true;});mapTiles.on('load',()=>{if(someLoaded)$('tileNotice')?.remove();someLoaded=false;});
    geo.pois.forEach(p=>{
      const marker=L.marker([p.lat,p.lon],{title:p.name,icon:L.divIcon({className:'',html:'<span class="geo-icon">'+icon('pin')+'</span>',iconSize:[24,24],iconAnchor:[10,22]})}).addTo(map);
      marker.bindPopup('<b>'+esc(p.name)+'</b><br>WGS84 · '+p.lat.toFixed(5)+', '+p.lon.toFixed(5)+'<br>'+sourceLink(p.source,'查看坐标来源'));
    });
  }
  requestAnimationFrame(()=>map.invalidateSize());
}
function geoConsent(){
  if(watch!==null){if(state.tab!=='explore')setTab('explore');showMap('geo');followFix=true;if(fix)map.setView([fix.lat,fix.lon],17);else toast('正在等待设备返回位置。');return;}
  dialog('查看我的实时位置','<p>允许后，浏览器会持续更新位置、精度和更新时间。地理地图按当前视野向 OpenStreetMap 请求底图。你可以随时停止定位，页面不保存轨迹。</p><div class="dialog-actions"><button class="primary" data-act="start-geo">'+icon('locate')+'开始定位</button><button class="secondary" data-act="dismiss">继续浏览</button></div>','LOCATION ACCESS');
}
function clearWatch(){
  locateForRoute=false;
  watchToken++;
  if(watch!==null)navigator.geolocation?.clearWatch(watch);
  watch=null;fix=null;liveMarker?.remove();liveRadius?.remove();liveMarker=null;liveRadius=null;
  $('liveBtn').classList.remove('on');$('liveBtn').querySelector('span').textContent='实时定位';
}
function startGeo(){
  dismiss();if(watch!==null)return;
  if(state.tab!=='explore')setTab('explore');state.selected=null;showMap('geo');
  if(!window.isSecureContext||!navigator.geolocation){geoStatus='当前浏览器环境不支持定位，请使用 HTTPS 或本机 localhost 打开。';renderCard();return;}
  geoStatus='等待浏览器授权与设备定位信号…';renderCard();
  let first=true;followFix=true;const token=++watchToken;
  watch=navigator.geolocation.watchPosition(pos=>{
    if(token!==watchToken)return;
    fix={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,time:pos.timestamp};
    if(!Number.isFinite(fix.accuracy)||fix.accuracy<0){geoStatus='当前定位精度无效，请重试。';fix=null;renderCard();return;}const point=[fix.lat,fix.lon];if(!liveMarker){
      liveMarker=L.marker(point,{title:'我的实时位置',icon:L.divIcon({className:'position-beacon',iconSize:[16,16]})}).addTo(map);
      liveRadius=L.circle(point,{radius:fix.accuracy,color:'#3986d5',weight:1,fillOpacity:.09}).addTo(map);
    }else{liveMarker.setLatLng(point);liveRadius.setLatLng(point).setRadius(fix.accuracy);}
    if(followFix&&state.map==='geo'&&state.tab==='explore'){map.setView(point,first?(fix.accuracy<300?17:13):map.getZoom(),{animate:false});first=false;}
    const d=map.distance(point,geo.center);
    geoStatus=d>1500?'距校园参考点约 '+(d/1000).toFixed(1)+' 公里，可点“返回校园”浏览地标。':'距校园参考点约 '+Math.round(d)+' 米。蓝色圆圈表示定位精度范围。';
    $('liveBtn').classList.add('on');$('liveBtn').querySelector('span').textContent='定位中';renderCard();if(locateForRoute)nearbyStart();
  },err=>{
    if(token!==watchToken)return;
    if(err.code===1){clearWatch();geoStatus='位置权限未开启。可在浏览器的站点设置中授权后重试。';}
    else{geoStatus=(err.code===3?'本次定位超时。':'设备暂时失去定位信号。')+(fix?'下方为最近一次位置，正在等待信号恢复。':'正在等待信号，可检查系统定位服务或停止定位。');}
    renderCard();
  },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  renderCard();
}
function fitRoute(o){const p=currentPlan?.choices?.[state.choice];if(p)fitPoints([...p.ids.map(id=>atlas.nodes[id]),places.get(state.from).official,places.get(state.to).official],o);}
let routeDemoTimer=null;
function stopRouteDemo(){
  if(routeDemoTimer!==null)clearInterval(routeDemoTimer);
  routeDemoTimer=null;
}
function pauseRouteDemo(){
  if(routeDemoTimer===null)return;
  stopRouteDemo();
  if(state.tab==='route')renderCard();
}
function toggleRouteDemo(){
  if(routeDemoTimer!==null){pauseRouteDemo();return;}
  const p=currentPlan?.choices?.[state.choice];
  if(state.tab!=='route'||!p||document.hidden)return;
  const total=Directory.steps(p,atlas.nodes).length;
  if(!total)return;
  routeDemoTimer=setInterval(()=>{
    if(document.hidden||$('modal').open||state.tab!=='route'){pauseRouteDemo();return;}
    stepTo(state.step+1,true);
  },4000);
  if(state.step<0||state.step>=total)stepTo(0,true);
  else renderCard();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseRouteDemo();});
window.addEventListener('pagehide',pauseRouteDemo);
$('modal').addEventListener('toggle',()=>{if($('modal').open)pauseRouteDemo();});
function stepTo(n,automatic=false){
  const p=currentPlan?.choices?.[state.choice];if(!p)return;
  const steps=Directory.steps(p,atlas.nodes);
  if(!automatic||n>=steps.length)stopRouteDemo();
  state.step=n>steps.length?-1:Math.max(-1,n);
  setSheetOpen(false);renderCard();   // the card first: the camera frames the part of the map it leaves free
  if(state.step<0)fitRoute({bearing:0,pitch:50});else if(state.step<steps.length){const st=steps[state.step],pts=p.ids.slice(st.first,st.last+2).map(id=>atlas.nodes[id]),a=pts[0],b=pts.at(-1);
    // in 3D the camera turns to face the way you walk
    fitPoints(pts,{bearing:Math.atan2(b[0]-a[0],a[1]-b[1])/Math.PI*180,pitch:58,minDist:430});}
  else centerPlace(places.get(state.to));
  renderPath();
  const status=$('routeStepStatus'),card=$('mapCard');
  if(status)status.textContent=state.step<0?'已返回路线总览。':(card.querySelector('.guide-count')?.textContent||'')+'，'+card.querySelector('h3').textContent+'。';
}
function calculate(){const sky=routeSky();
  stopRouteDemo();state.step=-1;
  currentPlan=Routing.plan(atlas,state.from,state.to,state.hour,state.detour,{day:state.day,mode:state.travel,sun:sky.sun,sunless:sky.kind==='snow'?'雪天最短':'雨天最短'});
  currentPlan.sky=sky;currentPlan.advice=currentPlan.error?null:Weather.advise(sky,currentPlan.dark);
  // the weather names one of the compared routes; it is preselected until the walker picks another
  currentPlan.rec=currentPlan.advice?.pick?currentPlan.choices.findIndex(p=>p.labels.includes(currentPlan.advice.pick)):-1;
  state.choice=Math.min(state.choice,Math.max(0,(currentPlan.choices?.length||1)-1));
  if(!state.choiceTouched&&currentPlan.rec>=0)state.choice=currentPlan.rec;}
function options(selected){return ['东区','西区','跨区'].map(z=>'<optgroup label="'+z+'">'+atlas.places.filter(p=>p.zone===z).map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+p.name+'</option>').join('')+'</optgroup>').join('');}
function routeSide(){
  const side=$('sidebar'),active=side.contains(document.activeElement)?document.activeElement:null;
  const attr=['data-sky','data-sun','data-detour','data-wx-t','data-act'].find(name=>active?.hasAttribute(name));
  const focus=active?.id?'#'+CSS.escape(active.id):attr?'['+attr+'="'+CSS.escape(active.getAttribute(attr))+'"]':null;
  side.innerHTML=sheetGrip('路线面板')+title('WALKING DIRECTIONS','步行路线','选择起终点，按出发时刻比较距离和沿途日照。')+
    '<section class="route-places" aria-labelledby="routePlacesTitle"><div class="section-title"><h2 id="routePlacesTitle">起点与终点</h2><button class="secondary" data-act="swap">'+icon('switch',13)+'交换起终点</button></div>'+
    '<div class="form-card"><div class="point-field"><span class="dot"></span><label for="startPlace">起点</label><select id="startPlace">'+options(state.from)+'</select></div><div class="point-field"><span class="dot"></span><label for="endPlace">终点</label><select id="endPlace">'+options(state.to)+'</select></div></div>'+
    '<div class="route-origin-tools"><button data-act="pick-origin" aria-pressed="'+!!state.picking+'">'+icon('pin',14)+(state.picking?'点图中地点作起点':'地图选起点')+'</button><button data-act="near-start">'+icon('locate',14)+'从定位附近出发</button></div></section>'+
    '<section class="route-compare" aria-labelledby="routeCompareTitle"><div class="section-title"><h2 id="routeCompareTitle" tabindex="-1">路线比较</h2><span class="caption">步速 1.25 米/秒</span></div><div id="routeResults"></div></section>'+
    '<section class="route-settings" aria-labelledby="routeSettingsTitle"><div class="section-title"><h2 id="routeSettingsTitle" tabindex="-1">出发条件</h2><button class="route-jump" data-act="route-compare">查看路线比较'+icon('arrow',13)+'</button></div>'+
    '<div class="access-controls"><div class="access-heading"><label for="travelDay">出行星期与通行方式</label><button data-act="today">恢复今天</button></div><div class="travel-fields"><select id="travelDay" aria-label="出行星期">'+Routing.weekdays.map((label,i)=>'<option value="'+(i+1)+'" '+(state.day===i+1?'selected':'')+'>'+label+(Routing.today()===i+1?' · 今天':'')+'</option>').join('')+'</select><select id="travelMode" aria-label="通行方式">'+[['auto','自动比较'],['inside','只走校内'],['outside','校外经正门']].map(([value,label])=>'<option value="'+value+'" '+(state.travel===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div>'+
    '<div class="access-notice" id="accessNotice" role="status"><b>'+policyText()+'</b><span>天渡只连校内，校外不能直接上桥。小南门学生不能通行。21:00 后所有校门只进不出。</span><button data-act="access-rules">通行规则与示意 ↗</button></div></div>'+
    '<div class="route-time"><div class="control-line"><label for="hour">'+icon('clock',15)+'出发时刻</label><span class="hour-tools"><button class="now-btn" data-act="hour-now">现在</button><output id="hourValue" for="hour">'+timeLabel(state.hour)+'</output></span></div><input id="hour" class="hour24" type="range" min="0" max="23.5" step=".5" style="background:'+dayGradient()+'" value="'+state.hour+'" aria-label="出发时刻，全天 24 小时" aria-valuetext="'+timeLabel(state.hour)+'">'+
    '<div class="range-legend day24"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:30</span><i class="tick-21" title="21:00 起所有校门学生只进不出">21</i></div><p class="hour-note" id="hourNote">'+hourNote()+'</p></div>'+wxBlock()+
    '<div class="control-line">可接受的额外路程</div><div class="route-options" role="group" aria-label="可接受的额外路程">'+[0,.1,.2,.4].map(r=>'<button data-detour="'+r+'" class="'+(r===state.detour?'active':'')+'" aria-pressed="'+(r===state.detour)+'">'+(r?Math.round(r*100)+'%':'不绕行')+'</button>').join('')+'</div></section>'+
    '<div class="demo-note">'+icon('sun',14)+' 太阳按'+esc(sunLabel())+'计算，日照强弱按天气折算。林荫取自 720 云夏季实景测量'+(leafOff()?'（落叶季实际更晒）':'')+'，楼荫按太阳位置计算。距离为图示估算。<button class="link-btn" data-act="shade-layer">'+(state.shade?'隐藏':'显示')+'林荫分布</button></div><span id="routeStepStatus" class="route-sr" role="status" aria-live="polite" aria-atomic="true"></span>';
  $('startPlace').onchange=e=>{state.from=e.target.value;updateRoute();};
  $('endPlace').onchange=e=>{state.to=e.target.value;updateRoute();};
  $('hour').oninput=e=>{state.hour=+e.target.value;e.target.setAttribute('aria-valuetext',timeLabel(state.hour));$('hourValue').value=timeLabel(state.hour);$('hourNote').innerHTML=hourNote();updateRoute();syncWx();const b=$('accessNotice')?.querySelector('b');if(b)b.textContent=policyText();};
  $('travelDay').onchange=e=>{state.day=+e.target.value;updateRoute();routeSide();};
  $('travelMode').onchange=e=>{state.travel=e.target.value;updateRoute();};
  refreshAccess();
  routeResults();syncWx();
  if(focus)side.querySelector(focus)?.focus({preventScroll:true});
}
function jumpToRouteControl(id){
  if(innerWidth<=680)setSheetOpen(true);
  const el=$(id);
  el?.focus({preventScroll:true});
  el?.scrollIntoView({block:'start',behavior:reduceMotion?'instant':'smooth'});
}
function updateRoute(){state.picking=false;state.step=-1;state.choice=0;state.choiceTouched=false;calculate();routeResults();renderPath();renderPins();refreshAccess();renderCard();fitRoute();}
function routeResults(){
  const result=$('routeResults');if(!result)return;
  const focusChoice=result.contains(document.activeElement)?document.activeElement.dataset.choice:undefined;
  const sky=currentPlan.sky||routeSky(),off=sunless(),adv=currentPlan.advice;
  const departure='<button class="route-departure" data-act="route-settings"><span>'+icon('clock',14)+esc(Routing.weekdays[state.day-1]+' · '+clock(state.hour))+'<i></i>'+Weather.icon(sky.kind,dark(),14)+esc(sky.source==='default'?'晴天估算':sky.label)+'</span><b>调整条件'+icon('chevron',13)+'</b></button>';
  if(currentPlan.error){
    const same=state.from===state.to;
    result.innerHTML=departure+'<p class="empty" role="status">'+esc(currentPlan.error)+'</p><button class="secondary" data-act="'+(same?'route-change-end':'use-inside')+'">'+(same?'选择终点':'改为只走校内')+'</button>';return;
  }
  result.innerHTML=departure+currentPlan.choices.map((p,i)=>{
    const recommended=i===currentPlan.rec,arrival=clock(state.hour+p.seconds/3600);
    const metrics='<span><b>'+p.meters+'<small>米</small></b>步行距离</span><span><b>'+minutes(p.seconds)+'<small>分</small></b>预计用时</span>'+
      (off?'<span><b>'+arrival+'</b>预计到达</span>':'<span><b>'+minutes(p.exposure)+'<small>分</small></b>'+(sky.sun<1?'折算日照':'日照时间')+'</span>');
    const note=off?esc(sunlessWord())+(late()?' · 校门只进不出':''):'<span>沿途约 '+shadeShare(p)+'% 的时间在荫凉里</span><span>'+arrival+' 到</span>';
    return '<button class="route-option '+(i===state.choice?'selected':'')+(recommended?' recommended':'')+'" data-choice="'+i+'" aria-pressed="'+(i===state.choice)+'">'+
      '<strong><span class="route-option-icon">'+icon(i===0?'walk':'leaf',16)+'</span><span class="route-option-name">'+esc(p.labels[0])+(p.labels.length>1?'<small> · '+esc(p.labels.slice(1).join(' / '))+'</small>':'')+'</span><i class="route-option-check" aria-hidden="true"></i></strong>'+
      '<span class="route-option-meta"><small class="trip-type">'+tripLabel(p)+'</small>'+(recommended?'<em class="rec-tag">'+Weather.icon(sky.kind,dark(),13)+'天气推荐</em>':'')+'</span>'+
      '<span class="metric">'+metrics+'</span>'+(off?'':shadeStrip(p))+'<small class="strip-note">'+note+'</small>'+(p.unknown?'<small class="caption">另有 '+Math.round(p.unknown)+' 秒路段遮阴未知</small>':'')+'</button>';
  }).join('')+(adv?.why?'<div class="caption wx-advice">'+Weather.icon(sky.kind,dark(),15)+'<span>'+esc(adv.why)+'</span></div>':'')+(!off&&currentPlan.choices.length===1?'<div class="caption route-same">当前条件下三种偏好选中了同一路线。</div>':'');
  if(focusChoice!==undefined)result.querySelector('[data-choice="'+focusChoice+'"]')?.focus({preventScroll:true});
}
let lastRouteKey='';
function renderPath(){
  if(ready3d)route3d();
  const overlay=$('pathOverlay');overlay.innerHTML='';overlay.classList.remove('fresh');
  if(is3d())return;
  overlay.setAttribute('viewBox','0 0 '+view.width+' '+view.height);
  if(state.tab==='explore'&&state.tourMap!==null&&state.map==='atlas'){const pts=tourPoints(state.tourMap).map(p=>p.join(',')).join(' ');
    overlay.innerHTML='<polyline points="'+pts+'" fill="none" stroke="#fff" data-stroke="7" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+pts+'" fill="none" stroke="#b5632a" data-stroke="3" stroke-linecap="round" stroke-linejoin="round"/><polyline class="route-flow" pathLength="'+Math.max(8,pts.split(' ').length*6)+'" points="'+pts+'" fill="none" stroke="#fff" data-stroke="1.4" stroke-dasharray="1 3" stroke-linecap="round" stroke-linejoin="round"/>';overlay.classList.add('fresh');syncMapStrokes();return;}
  if(state.tab!=='route'||!['atlas','official'].includes(state.map)||!currentPlan?.choices?.length)return;
  // the link from a door to the middle of the building is not drawn: with several doors it would cut across the building
  const p=currentPlan.choices[state.choice],xy=id=>atlas.nodes[id].join(','),walkIds=r=>{const w=r.ids.filter(id=>id[0]!=='h');return w.length>1?w:r.ids;},wp=walkIds(p);
  const lines=currentPlan.choices.filter(r=>r!==p).map(r=>'<polyline points="'+walkIds(r).map(xy).join(' ')+'" fill="none" stroke="#776e51" data-stroke="3" stroke-dasharray="6 5" stroke-linejoin="round"/>');
  lines.push('<polyline class="route-casing" pathLength="1" points="'+wp.map(xy).join(' ')+'" fill="none" stroke="white" data-stroke="8" stroke-linecap="round" stroke-linejoin="round"/>');
  const allSteps=state.step>=0?Directory.steps(p,atlas.nodes):null,cur=allSteps?.[state.step],part=(cur?p.ids.slice(cur.first,cur.last+2):state.step<0?p.ids:[]).filter(id=>id[0]!=='h');
  const partMeters=cur?cur.meters:p.meters,n=p.edges.length;
  p.edges.forEach((e,i)=>{if(e.kind==='door')return;const [x1,y1]=atlas.nodes[p.ids[i]],[x2,y2]=atlas.nodes[e.to];lines.push('<line class="route-line" style="--d:'+(i/n*.7).toFixed(3)+'s" data-segment="'+i+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+((state.step<0||(()=>{const st=Directory.steps(p,atlas.nodes)[state.step];return st&&i>=st.first&&i<=st.last;})())?(e.role==='skybridge'?'#337db8':['outside','gate'].includes(e.role)?'#b57428':'#087951'):'#849d94')+'" data-stroke="5" stroke-linecap="round"><title>'+esc(e.name)+' · '+e.meters+' 米</title></line>');});
  for(const id of [wp[0],wp.at(-1)]){
    const [x,y]=atlas.nodes[id];lines.push('<circle cx="'+x+'" cy="'+y+'" data-radius="5" fill="#fff" stroke="#177451" data-stroke="2"/>');
  }
  if(part.length>1){
    lines.push('<polyline class="route-flow" pathLength="'+Math.max(8,partMeters/5).toFixed(1)+'" points="'+part.map(xy).join(' ')+'" fill="none" stroke="#fff" data-stroke="1.6" stroke-dasharray="1 3" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>');
    if(!reduceMotion)lines.push('<g class="route-walker"><circle data-radius="9" fill="#f2c14e" opacity=".35"/><circle data-radius="5" fill="#f2c14e" stroke="#fff" data-stroke="2"/><animateMotion dur="'+Math.max(4,Math.min(14,partMeters/22)).toFixed(1)+'s" repeatCount="indefinite" path="M'+part.map(xy).join(' L')+'"/></g>');
  }
  const key=[state.from,state.to,state.choice,state.day,state.travel,state.detour,p.meters,p.ids.length].join('|');
  overlay.innerHTML=lines.join('');if(key!==lastRouteKey&&state.step<0)overlay.classList.add('fresh');lastRouteKey=key;syncMapStrokes();
}
function segments(idx){
  const p=currentPlan?.choices?.[state.choice];if(!p)return;
  const chosen=Number.isInteger(idx)?[p.edges[idx]]:p.edges;
  const delta=p.meters-currentPlan.baseline,base=currentPlan.choices[0];
  dialog(Number.isInteger(idx)?'路段 '+String(idx+1).padStart(2,'0'):'为什么选这条路线',
    '<p><b>'+places.get(state.from).name+' → '+places.get(state.to).name+'</b><br>'+timeLabel(state.hour)+' 出发，'+p.labels.join(' / ')+' · '+tripLabel(p)+'。相对当前规则下最短路线多走 '+delta+' 米，估算日照相差 '+minutes(Math.abs(p.exposure-base.exposure))+' 分钟。</p>'+
    '<ul class="segment-list">'+chosen.map((e,j)=>{const src=atlas.edges[e.index]?.shadeSrc,sc=src?.scene&&scenes.get(src.scene),pick=v=>v?(Routing.shadeAt(v,state.hour)??0):0;
      return '<li><b>路段 '+String((idx??j)+1).padStart(2,'0')+'</b>　'+e.meters+' 米 · '+esc(e.name)+' · '+(sunless()?sunlessWord():e.shade===null?'遮阴资料未知':'遮阴 '+Math.round(e.shade*100)+'%')+(src&&!dark()?'（林荫 '+Math.round(pick(src.tree)*100)+'% · 楼荫 '+Math.round(pick(src.building)*100)+'%）':'')+'<br>预计步行 '+Math.round(e.seconds)+' 秒 · 估算日照 '+Math.round(e.exposure)+' 秒'+(src?'<br><small>依据：'+esc(src.grade)+(sc?' · 720 云「'+esc(sc.name)+'」约 '+src.meters+' 米 <button class="link-btn" data-scene="'+sc.id+'">'+'看实景'+'</button>':'')+'</small>':'')+'</li>';}).join('')+'</ul><p>林荫来自 720 云夏季实景的天空遮挡测量（按距离插值），楼荫按楼栋轮廓、估计层高与 '+esc(atlas.shadeModel?.date||'')+' 太阳位置计算；两者合成后在 '+clock(shadeRange()[0])+'—'+clock(shadeRange()[1])+' 的 '+atlas.shadeModel.hours.length+' 个时刻之间线性插值，日出前、日落后按无日照处理，按固定出发时刻计算。路段日照 = 步行时长 ×（1 − 遮阴率）× 天气的日照比例'+(currentPlan.sky&&currentPlan.sky.source!=='default'?'（当前'+esc(skyNote(currentPlan.sky))+'）':'')+'。'+(p.unknown?'未知路段时长 '+Math.round(p.unknown)+' 秒，单列计入比较惩罚。':'')+'</p>','ROUTE EVIDENCE');
}
function exportCard(){
  const p=currentPlan?.choices?.[state.choice];if(!p)return;
  const start=places.get(state.from).name,end=places.get(state.to).name;
  const polys=(p.ids.filter(id=>id[0]!=='h').length>1?p.ids.filter(id=>id[0]!=='h'):p.ids).map(id=>atlas.nodes[id]);
  const xs=polys.map(n=>n[0]),ys=polys.map(n=>n[1]);const x0=Math.min(...xs),y0=Math.min(...ys);
  const w=Math.max(1,Math.max(...xs)-x0),h=Math.max(1,Math.max(...ys)-y0),scale=Math.min(590/w,115/h);
  const pts=polys.map(([x,y])=>[360+(x-x0-w/2)*scale,237+(y-y0-h/2)*scale]);
  const txt=(x,y,size,content,fill='#183d2e')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+fill+'">'+esc(content)+'</text>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="530" viewBox="0 0 720 530" font-family="Microsoft YaHei, sans-serif"><rect width="720" height="530" rx="22" fill="#f6f8ef"/><rect width="720" height="97" fill="#086447"/>'+(emblemData?'<rect x="606" y="12" width="96" height="73" rx="12" fill="#fff"/><image href="'+emblemData+'" x="614" y="19" width="80" height="59.5"/>':'')+txt(30,33,13,'SUNWALK ATLAS   /   校园步行卡','#d7eac8')+txt(30,70,27,'向阳而行 · '+p.labels.join(' / '),'#fff')+txt(30,140,23,start+' → '+end)+'<polyline points="'+pts.map(x=>x.join(',')).join(' ')+'" fill="none" stroke="#168158" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'+[pts[0],pts[pts.length-1]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="7" fill="#d2aa40" stroke="#fff" stroke-width="2"/>').join('')+txt(30,340,21,p.meters+' 米    步行 '+minutes(p.seconds)+' 分钟    '+(sunless()?sunlessWord():'估算日照 '+minutes(p.exposure)+' 分钟')+(currentPlan.sky&&currentPlan.sky.source!=='default'?'    天气 '+skyText(currentPlan.sky):''))+txt(30,378,16,Routing.weekdays[state.day-1]+' '+timeLabel(state.hour)+' · '+tripLabel(p)+'    步速 1.25 米/秒    绕行上限 '+Math.round(state.detour*100)+'%')+txt(30,408,14,'天渡仅连校内，不能从校外上桥。周一、二、四禁止出校；西区地面仅经正门。')+txt(30,431,14,'小南门学生不通行；晚上 21:00 后所有校门学生只进不出。')+txt(30,458,14,'林荫：720 云夏季实景测量 · 楼荫：'+atlas.shadeModel.date+' 太阳位置投影 · 图估距离，按出发时刻冻结计算。')+txt(30,498,13,'晴行有方队 · 西安翻译学院    '+new Date().toLocaleDateString('zh-CN'),'#607365')+'</svg>';
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='向阳而行_'+start+'至'+end+'_情景路线卡.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('已生成可保存的路线卡。');
}
function panoSide(){
  const filt=state.tourIdx!==null?'<div class="pano-filter">'+icon('route',13)+'<b>游线 · '+esc(sceneTours[state.tourIdx].name)+'</b><button data-act="tour-map">在地图上看</button><button data-act="clear-scene-filter">退出</button></div>'
    :state.scenePlace?'<div class="pano-filter">'+icon('pin',13)+'<b>'+esc(places.get(state.scenePlace)?.name||'')+'</b><button data-inspect="'+state.scenePlace+'">地图定位</button><button data-act="clear-scene-filter">看全部</button></div>':'';
  $('sidebar').innerHTML=sheetGrip('全景面板')+title('PANORAMA COLLECTION','全景漫游','从空中看校区，走进楼宇与广场。')+
    searchBox('sceneSearch',state.sceneSearch,'搜索场景或楼栋，如“图书馆”')+
    '<div class="pano-side-tools" role="group" aria-label="按场景类型筛选">'+scopes.map(s=>'<button class="scope '+(s===state.scope&&!filt?'active':'')+'" aria-pressed="'+(s===state.scope&&!filt)+'" data-scope="'+s+'">'+s+'</button>').join('')+'</div>'+filt+
    '<div class="section-title"><h2>场景目录</h2><span class="caption" id="sceneCount"></span></div><div id="sceneList"></div>'+
    '<div class="pano-survey"><h3>'+icon('route',14)+'实景游线</h3><p class="caption">按原作场景之间的连通关系编排，逐站浏览，也可以在地图上看线路。</p><div class="tour-list">'+sceneTours.map((t,i)=>'<button class="tour-card '+(state.tourIdx===i?'active':'')+'" data-tour="'+i+'"><strong>'+esc(t.name)+'</strong><small>'+esc(t.desc)+' · '+t.stops.length+' 站</small></button>').join('')+'</div></div>'+
    '<div class="pano-survey"><h3>'+icon('leaf',14)+'实景林荫测点</h3><p class="caption">原作中 '+panoPoints.length+' 个室外地面场景拍摄于夏季。我们逐像素区分天空、树冠和建筑，测出每个点头顶与低空方向被遮挡的比例，作为择荫路线的林荫依据。</p><button class="secondary" data-act="survey-map">在地图上看测点与林荫分布</button></div>'+
    '<div class="pano-survey"><h3>'+icon('pano',14)+'本地素材包</h3><p class="caption">现有 <b>'+tour.scenes.filter(s=>s.cube).length+'</b> 处可环视全景、<b>'+tour.scenes.filter(s=>s.photo&&!s.cube).length+'</b> 处实景照片；其余 '+tour.scenes.filter(s=>!hasImage(s)).length+' 个场景在线引用 720 云原作，断网时显示拍摄位置。</p><button class="secondary" data-act="pano-help">如何补充全景照片</button></div>'+
    '<p class="caption">影像来源 · 720 云「全景漫游」《'+esc(tour.title)+'》 · 版权归原作者 · '+sourceLink(tourUrl,'原作')+'</p>';
  $('sceneSearch').oninput=e=>{state.sceneSearch=e.target.value;state.page=0;sceneList();};
  $('sceneSearch').onfocus=()=>{if(innerWidth<=680)setSheetOpen(true);};
  $('sceneSearch').onkeydown=e=>{
    if(e.isComposing||e.keyCode===229)return;
    const first=$('sceneList').querySelector('.scene-row');
    if(e.key==='ArrowDown'&&first){e.preventDefault();first.focus();}
    else if(e.key==='Enter'&&first&&state.sceneSearch.trim()){e.preventDefault();first.click();}
    else if(e.key==='Escape'&&state.sceneSearch){e.preventDefault();e.target.value='';state.sceneSearch='';state.page=0;sceneList();}
  };
  sceneList();
}
function sceneMatches(){
  const query=state.sceneSearch.trim();
  if(state.tourIdx!==null&&!query)return sceneTours[state.tourIdx].stops.map(id=>scenes.get(id)).filter(Boolean);
  return tour.scenes.filter(s=>{const r=sceneIdx[s.id]||{};
    if(query)return s.name.includes(query)||(places.get(r.p)?.name||'').includes(query);
    if(state.scenePlace)return r.p===state.scenePlace;
    return state.scope==='全部'||(state.scope==='精选'?!!s.photo:state.scope==='楼内'?!!r.i:state.scope==='东区室外'?r.z==='东区'&&!r.i&&!r.a:state.scope==='西区室外'?r.z==='西区'&&!r.i&&!r.a:true);});
}
function sceneThumb(s){const r=sceneIdx[s.id]||{};return s.photo?'<img class="row-img" loading="lazy" src="'+esc(scenePhoto(s))+'" alt="">':'<span class="row-thumb '+(r.i?'indoor':r.a?'aerial':'')+'">'+icon(r.i?'building':'pin')+'</span>';}
function sceneList(){
  const matches=sceneMatches(),numbered=state.tourIdx!==null&&!state.sceneSearch.trim();
  const maxPage=Math.max(1,Math.ceil(matches.length/9));state.page=Math.min(maxPage-1,state.page);
  $('sceneCount').textContent=matches.length+' 个场景';
  $('sceneList').innerHTML=matches.slice(state.page*9,state.page*9+9).map((s,i)=>{const r=sceneIdx[s.id]||{};
    return '<button class="scene-row '+(s.id===state.scene?'active':'')+'" '+(s.id===state.scene?'aria-current="true" ':'')+'data-scene="'+s.id+'">'+sceneThumb(s)+'<span class="row-copy"><strong>'+(numbered?(state.page*9+i+1)+'. ':'')+esc(s.name)+'</strong><small>'+esc(sceneWhere(s.id)||'位置待核')+' · '+(s.cube?'360° 可环视':s.photo?'实景照片':(r.i?'楼内':r.a?'航拍':'室外')+' · 720 云在线')+(panoById.has(s.id)?' · 林荫 '+Math.round(panoById.get(s.id).tree[0]*100)+'%':'')+'</small></span>'+icon('chevron')+'</button>';}).join('')||'<p class="empty">没有找到这个场景。试试“图书馆”或“广场”。</p>';
  if(maxPage>1)$('sceneList').insertAdjacentHTML('beforeend','<div class="pager"><button data-page="-1" '+(state.page===0?'disabled':'')+'>上一页</button><span>'+(state.page+1)+' / '+maxPage+'</span><button data-page="1" '+(state.page+1>=maxPage?'disabled':'')+'>下一页</button></div>');
}
function sceneNav(s){
  const r=sceneIdx[s.id]||{},p=r.p&&places.get(r.p),nb=(r.n||[]).map(id=>scenes.get(id)).filter(Boolean).slice(0,6);
  let tourBar='';
  if(state.tourIdx!==null){const st=sceneTours[state.tourIdx].stops,i=st.indexOf(s.id);if(i>=0)tourBar='<span class="nav-tour"><button data-scene="'+st[Math.max(0,i-1)]+'" '+(i===0?'disabled':'')+'>上一站</button><b>'+(i+1)+' / '+st.length+'</b><button data-scene="'+st[Math.min(st.length-1,i+1)]+'" '+(i===st.length-1?'disabled':'')+'>下一站</button></span>';}
  return '<nav class="pano-nav" aria-label="场景导航"><span class="nav-where">'+icon('pin',13)+esc(sceneWhere(s.id)||'位置待核')+(r.t?'<small>'+esc(r.t)+'</small>':'')+'</span>'+(r.x!==undefined?'<button data-act="scene-locate">'+icon('map',13)+'地图定位</button>':'')+(p?'<button data-route-to="'+p.id+'">'+icon('route',13)+'去这里</button>':'')+tourBar+(nb.length?'<span class="nav-next"><span>相邻场景</span>'+nb.map(n=>'<button data-scene="'+n.id+'">'+esc(n.name)+'</button>').join('')+'</span>':'')+'</nav>';
}
let panoAutoChoice;
function resetPano(){
  const host=$('panoView');
  if(document.fullscreenElement===host&&state.tab!=='pano')document.exitFullscreen().catch(()=>{});
  vr?.destroy();vr=null;host.replaceChildren();
}
function panoFullButton(){
  const active=document.fullscreenElement===$('panoView'),label=active?'退出全屏':'全屏';
  return '<button type="button" data-act="full" aria-pressed="'+active+'" aria-label="'+label+'" title="'+label+'">'+icon('expand',17)+'</button>';
}
function locatorStage(s,unreadable=false){
  const r=sceneIdx[s.id]||{},ext=atlas.extent||{x:0,y:0,w:atlas.width,h:atlas.height},located=r.x!==undefined,x=located?r.x:1180,y=located?r.y:700;
  const heading=located?'拍摄位置 · '+esc(sceneWhere(s.id))+(r.i?'（楼内）':''):'拍摄位置待核';
  const hint=unreadable?'本地影像未能载入，可以重试。':'本地素材包里没有这张全景'+(navigator.onLine?'，可在线打开 720 云原作。':'，联网后可打开 720 云原作。');
  return '<div class="pano-stage locator" id="panoStage" tabindex="0" role="region" aria-label="'+esc(s.name)+'的拍摄位置"><div class="loc-map"><img alt="" draggable="false" src="assets/campus.svg?v='+BUILD+'" style="width:'+ext.w+'px;height:'+ext.h+'px;transform:translate('+(ext.x-x)+'px,'+(ext.y-y)+'px)"></div>'+(located?'<span class="loc-ring"></span><span class="loc-ring late"></span><span class="loc-dot">'+icon(r.i?'building':'pano',17)+'</span>':'')+
    '<div class="pano-shade"></div><div class="pano-bottom"><div class="pano-title"><span class="pano-chip">'+heading+'</span><strong>'+esc(s.name)+'</strong><small class="pano-hint" role="status">'+hint+'</small></div></div><div class="pano-top">'+(unreadable?'<button data-act="pano-retry">'+icon('rotate',15)+'重试影像</button>':'')+'<button data-act="pano-online">'+icon('pano')+'在线全景（720 云）</button><button data-act="pano-help" aria-label="补充本地照片" title="补充本地照片">'+icon('info')+'</button>'+panoFullButton()+'</div></div>';
}
function panoHelp(){
  const missing=tour.scenes.filter(s=>!hasImage(s)).length;
  dialog('补充本地全景照片','<p>有本地照片的场景只读取工程里 <b>dist/assets</b> 下的文件。目前还有 <b>'+missing+'</b> 个场景没有本地照片：联网时引用 720 云原作的在线全景，断网时显示拍摄位置。720 云的图片服务器会拒绝脚本批量下载，所以这些照片没有随工程附带。</p><h3>怎么补</h3><p>1. 取得全景照片：向原作者（720 云「全景漫游」）或学校宣传部门索取原图，或自己拍摄。每个场景一张 2:1 的全景展开图，或六张立方体面图。</p><p>2. 把文件按场景编号或场景名命名（如 <b>15468040.jpg</b>、<b>图书馆.jpg</b>），放进一个文件夹。</p><p>3. 在工程目录运行 <b>python -B tools/import_panoramas.py 素材文件夹</b>，刷新页面即可环视。运行时加 <b>--list</b> 可列出还缺哪些场景。</p><p class="caption">'+esc(tour.credit||'')+'。照片版权归原作者，放进参赛作品前请取得许可并保留署名。</p>','LOCAL PANORAMA PACK');
}
function renderPano(){
  const s=scenes.get(state.scene);if(!s)return;
  resetPano();
  const host=$('panoView'),name=esc(s.name),nav=sceneNav(s);
  host.tabIndex=-1;
  host.dataset.current=String(tour.scenes.indexOf(s)+1);
  const local=hasImage(s);
  if(navigator.onLine&&(state.onlineScene===s.id||(!local&&!state.locOnly))){
    const back=s.cube?'看本地全景':s.photo?'看本地照片':'看拍摄位置';
    host.innerHTML='<div class="external-pano"><div class="external-bar"><span>'+icon('pano',15)+' 720 云在线全景 · '+name+'</span><span class="bar-actions"><button data-act="pano-local">'+icon(local?'pano':'map',14)+back+'</button>'+sourceLink(sceneUrl(s.id),'独立打开')+panoFullButton()+'</span></div><iframe title="'+name+' · 720 云全景" src="'+esc(sceneUrl(s.id))+'" loading="lazy" allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>'+nav+'</div>';
    return;
  }
  if(!local){host.innerHTML=locatorStage(s)+nav;return;}
  const onlineButton='<button data-act="pano-online">'+icon('pano',16)+'在线全景（720 云）</button>';
  const controls=s.cube?
    '<button data-vr="-1" aria-label="向左环视" title="向左环视">'+icon('chevron',16)+'</button><button data-vr="1" aria-label="向右环视" title="向右环视">'+icon('chevron',16)+'</button>'+
    '<button data-vrzoom="-12" aria-label="放大" title="放大">'+icon('plus',16)+'</button><button data-vrzoom="12" aria-label="缩小" title="缩小">'+icon('minus',16)+'</button>'+
    '<button data-act="vr-auto" aria-pressed="false"><i aria-hidden="true"></i>自动环视</button><button data-act="vr-reset" title="恢复初始视角（Home）">'+icon('frame',14)+'复位</button>':onlineButton;
  const label=name+(s.cube?'全景，方向键环视，加减键缩放，Home 键复位':'实景照片');
  const preview=scenePhoto(s);
  host.innerHTML='<div class="pano-stage '+(s.cube?'':'still')+'" id="panoStage" tabindex="0" role="region" aria-label="'+label+'">'+
    (preview?'<img class="scene-img" src="'+esc(preview)+'" alt="'+name+'实景" draggable="false">':'')+
    '<div class="pano-shade"></div><div class="pano-top">'+panoFullButton()+'</div><div class="pano-bottom"><div class="pano-title"><span class="pano-chip">'+(s.cube?'360° 全景':'实景照片')+'</span><strong>'+name+'</strong><small class="pano-hint" role="status">'+(s.cube?'拖动环视 · 滚轮或双指缩放':'本地实拍 · 可打开原作环视')+'</small></div><div class="pano-controls" role="group" aria-label="实景操作">'+controls+'</div></div></div>'+nav;
  const stage=$('panoStage'),image=stage.querySelector('.scene-img');
  function localFailure(){
    if(!stage.isConnected)return;
    vr?.destroy();vr=null;
    if(!image||image.hidden){
      const focusWasInside=stage.contains(document.activeElement);
      stage.outerHTML=locatorStage(s,true);
      if(focusWasInside)$('panoStage').focus({preventScroll:true});
      return;
    }
    stage.dataset.failed='true';
    stage.classList.add('still');
    stage.setAttribute('aria-label',s.name+'实景照片');
    stage.querySelector('.pano-chip').textContent='实景照片';
    stage.querySelector('.pano-hint').textContent='全景未能载入，已切换到本地照片。';
    stage.querySelector('.pano-controls').innerHTML='<button data-act="pano-retry">'+icon('rotate',15)+'重试全景</button>'+onlineButton;
  }
  if(image)image.onerror=()=>{image.hidden=true;if(!s.cube||stage.dataset.failed)localFailure();};
  if(!s.cube)return;
  vr=mountPanorama(stage,s,chooseScene,scenes,{autoRotate:panoAutoChoice,onError:localFailure});
  stage.onkeydown=e=>{
    if(!vr||e.target!==stage||e.altKey||e.ctrlKey||e.metaKey)return;
    const delta={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[e.key];
    if(delta)vr.turn(...delta);
    else if(['+','=','-'].includes(e.key))vr.zoom(e.key==='-'?10:-10);
    else if(e.key==='Home')vr.reset();
    else return;
    e.preventDefault();
  };
}
function chooseScene(id){
  id=Number(id);if(!scenes.has(id))return;
  const source=document.activeElement;
  const withinTour=source?.closest('.nav-tour');
  const stepButton=withinTour?(source===withinTour.lastElementChild?'last-child':'first-child'):null;
  const changed=state.scene!==id;
  if(changed)state.onlineScene=null;
  state.scene=id;
  if(state.tab!=='pano'){
    state.sceneSearch='';
    if(state.scenePlace&&sceneIdx[id]?.p!==state.scenePlace)state.scenePlace=null;
    if(state.tourIdx!==null&&!sceneTours[state.tourIdx]?.stops.includes(id))state.tourIdx=null;
    if(!sceneMatches().some(s=>s.id===id))state.scope=hasImage(scenes.get(id))?'精选':'全部';
    state.page=Math.max(0,Math.floor(sceneMatches().findIndex(s=>s.id===id)/9));
    setTab('pano');
  }
  else if(changed){sceneList();renderPano();}
  if(innerWidth<=680){setSheetOpen(false);$('stage').scrollIntoView({block:'nearest'});}
  const next=stepButton&&document.querySelector('.nav-tour button:'+stepButton+':enabled');
  (next||$('panoStage')||$('panoView')).focus({preventScroll:true});
}
document.addEventListener('fullscreenchange',()=>{
  const button=$('panoView').querySelector('[data-act="full"]');if(!button)return;
  const active=document.fullscreenElement===$('panoView');
  button.setAttribute('aria-pressed',String(active));
  button.setAttribute('aria-label',button.title=active?'退出全屏':'全屏');
});
window.addEventListener('offline',()=>{if(state.tab==='pano'&&$('panoView').querySelector('iframe'))renderPano();});
function changePanoMedia(){
  renderPano();
  ($('panoStage')||$('panoView').querySelector('[data-act="pano-local"]')||$('panoView')).focus({preventScroll:true});
}
// The active tab's pill is one shape that slides between the tabs (polish.css draws it from these numbers).
function navIndicator(){
  const nav=$('nav'),b=nav?.querySelector('button.active');if(!b||!b.offsetWidth)return;
  for(const [k,v] of [['--ind-x',b.offsetLeft],['--ind-y',b.offsetTop],['--ind-w',b.offsetWidth],['--ind-h',b.offsetHeight]])nav.style.setProperty(k,v+'px');
  if(!nav.classList.contains('has-ind')){nav.classList.add('has-ind');requestAnimationFrame(()=>requestAnimationFrame(()=>nav.classList.add('ind-anim')));}
}
addEventListener('resize',()=>navIndicator());
document.fonts?.ready?.then(()=>navIndicator());
function setTab(tab){
  settleDimension?.();
  stopRouteDemo();
  if(!['explore','route','pano'].includes(tab))tab='explore';
  if(tab!==state.tab)setMapFocus(false);
  setSheetOpen(false);document.body.dataset.tab=state.tab=tab;
  if(location.hash!=='#'+tab)history.replaceState(null,'','#'+tab);
  document.querySelectorAll('#nav [data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
  navIndicator();
  const side=$('sidebar');side.classList.remove('tab-enter');void side.offsetWidth;side.classList.add('tab-enter');
  $('sidebar').scrollTop=0;$('mapUI').hidden=tab==='pano';$('panoView').hidden=tab!=='pano';
  if(tab==='pano'){$('geoMap').hidden=true;$('mapViewport').hidden=true;sync3d();panoSide();renderPano();applySky();}
  else{resetPano();if(tab==='route'){state.map='atlas';state.selected=null;state.step=-1;state.picking=false;calculate();routeSide();}else exploreSide();showMap(state.map);}
}
let locateForRoute=false;
function nearbyStart(){
  if(!fix){locateForRoute=true;geoConsent();return;}
  locateForRoute=false;
  const near=Object.entries(geoNames).map(([id,name])=>{const g=geo.pois.find(x=>x.name===name);return {id,m:map.distance([fix.lat,fix.lon],[g.lat,g.lon])};}).sort((a,b)=>a.m-b.m);
  const usable=Date.now()-fix.time<60000&&fix.accuracy<=100&&near[0].m<=220;
  const items=usable?near.filter(x=>x.m<=220).map(x=>'<button class="more" data-near="'+x.id+'">'+places.get(x.id).name+' · 直线约 '+Math.round(x.m)+' 米</button>').join(''):'';
  dialog('确认步行起点','<p>'+(usable?'请选择你已实际到达的附近地标，校内路线从该地标的步道开始。':'定位较远、精度不足或位置已过期。到校后请选所在校门或楼栋作为起点。')+'</p>'+items+'<button class="more" data-act="manual-start">手动选起点</button>','LOCATION TO ROUTE');
}
function shareRoute(){
  const url=new URL(location.href);url.search='';url.hash='route';
  for(const [k,v] of [['from',state.from],['to',state.to],['day',state.day],['hour',state.hour],['mode',state.travel],['detour',state.detour],...(state.sky==='auto'?[]:[['sky',state.sky]]),...(state.sunMode==='summer'?[['sun','summer']]:[])])url.searchParams.set(k,v);
  const manual=()=>dialog('复制路线链接','<p>把这个链接发给同学，打开就是同一条路线（同样的星期、时刻和通行方式）。</p><input readonly class="copy-link" value="'+esc(url.href)+'">');
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>toast('已复制路线链接，打开就是同一条路线。')).catch(manual);else manual();
}
function sharePlace(){
  const url=new URL(location.href);url.search='';url.hash='explore';url.searchParams.set('place',state.selected);
  const manual=()=>dialog('复制地点链接','<input readonly class="copy-link" value="'+esc(url.href)+'">');
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>toast('已复制地点链接。')).catch(manual);else manual();
}
const actions={
  'access-rules':policyDialog,'coverage':coverage,
  'pano-layer':()=>{state.panoLayer=!state.panoLayer;if(!state.panoLayer)state.tourMap=null;if(state.map!=='atlas')showMap('atlas');
    document.querySelectorAll('[data-act="pano-layer"]').forEach(b=>b.setAttribute('aria-pressed',String(state.panoLayer)));
    renderPins();renderPath();toast(state.panoLayer?'已显示全景位置：圆点是室外场景，数字是楼内全景个数。':'已隐藏全景位置。');},
  'scene-locate':()=>{const r=sceneIdx[state.scene];if(!r||r.x===undefined)return;const name=sceneWhere(state.scene);state.panoLayer=true;state.map='atlas';state.cat='全部';state.zone='全校';state.query='';setTab('explore');
    if(r.p)pickPlace(r.p);fitPoints([[r.x-110,r.y-80],[r.x+110,r.y+80]]);document.querySelectorAll('[data-act="pano-layer"]').forEach(b=>b.setAttribute('aria-pressed','true'));toast('这个全景拍摄于：'+name);},
  'tour-map':()=>{if(state.tourIdx===null)return;state.tourMap=state.tourIdx;state.panoLayer=true;state.map='atlas';state.selected=null;setTab('explore');const pts=tourPoints(state.tourMap);if(pts.length)fitPoints(pts);
    document.querySelectorAll('[data-act="pano-layer"]').forEach(b=>b.setAttribute('aria-pressed','true'));toast('游线「'+sceneTours[state.tourMap].name+'」：按编号点圆点看实景，连线仅为示意。');},
  'clear-scene-filter':()=>{state.scenePlace=null;state.tourIdx=null;state.tourMap=null;state.page=0;panoSide();renderPano();},
  'shade-layer':()=>{dismiss();state.shade=!state.shade;if(state.map!=='atlas'&&state.tab!=='pano')showMap('atlas');
    if(state.tab==='explore')exploreSide();else if(state.tab==='route')routeSide();
    document.querySelectorAll('[data-act="shade-layer"]').forEach(b=>b.setAttribute('aria-pressed',String(state.shade)));
    refreshAccess();renderPins();toast(state.shade?'已显示林荫分布：绿色荫凉，橙色暴晒。':'已隐藏林荫分布。');},
  'faculty-layer':()=>{dismiss();state.facLayer=!state.facLayer;if(state.tab==='pano')setTab('explore');if(state.map!=='atlas')showMap('atlas');
    document.querySelectorAll('[data-act="faculty-layer"]').forEach(b=>b.setAttribute('aria-pressed',String(state.facLayer)));
    renderPins();renderCard();if(state.facLayer&&!state.faculty&&!state.selected)fitPoints(FAC.units.flatMap(facPoints));
    toast(state.facLayer?'已按学部、学院给教学楼着色：一栋楼有几个单位就画几种颜色的条纹。':'已取消学部着色。');},
  'faculty-clear':clearFaculty,
  'access-focus':()=>{dismiss();if(!['atlas','official'].includes(state.map))showMap('atlas');fitPoints([[990,670],[1330,1010]]);},
  'plan-access':()=>{dismiss();setTab('route');},
  'survey-map':()=>{state.shade=true;state.map='atlas';setTab('explore');fit();toast('圆点为夏季实景测点，线段颜色为林荫估算。');},
  'original-map':()=>{dismiss();showMap('official');},
  'tool-original':()=>{setSheetOpen(false);showMap(state.map==='official'?'atlas':'official');},
  'tool-geo':()=>{setSheetOpen(false);showMap(state.map==='geo'?'atlas':'geo');},
  'back-map':()=>showMap('atlas'),
  'today':()=>{state.day=Routing.today();updateRoute();routeSide();},
  'use-inside':()=>{state.travel='inside';updateRoute();routeSide();},
  'sheet':()=>setSheetOpen(!document.body.classList.contains('sheet-open')),
  'reset-filters':()=>{state.query='';filterPlaces('全部','全校');},
  'share-place':sharePlace,'share-route':shareRoute,'wx':weatherDialog,
  'wx-refresh':()=>{toast('正在读取天气预报…');Weather.load().then(d=>{toast(d?(Weather.source==='live'?'天气预报已更新。':'没有连上天气服务，显示的是上次保存的预报。'):'没有取到天气预报，路线按晴天估算。');if($('modal').open&&$('modalContent').querySelector('.wx-dialog'))weatherDialog();});},
  'plan-now':()=>{dismiss();state.sky='auto';state.day=Routing.today();state.hour=Math.round(nowHour()*2)/2%24;setTab('route');},
  'shade-now':()=>{const h=nowHour(),[lo,hi]=shadeRange();state.shadeHour=Math.max(lo,Math.min(hi,Math.round(h*2)/2));if(!state.shade)actions['shade-layer']();else{exploreSide();refreshAccess();renderPins();}},
  'hour-now':()=>{state.day=Routing.today();state.hour=Math.round(nowHour()*2)/2%24;updateRoute();routeSide();toast(Routing.isNight(atlas,state.hour)?'已设为现在出发：21:00 后校门只进不出，路线只走校内。':!Routing.daylight(atlas,state.hour)?'已设为现在出发：此刻没有日照，只比较距离。':'已设为今天、现在出发。');},'near-start':nearbyStart,
  'manual-start':()=>{dismiss();setTab('route');state.picking='from';routeSide();toast('点地图上的地点作起点。');},
  'pick-origin':()=>{pauseRouteDemo();state.picking=state.picking?false:'from';routeSide();setSheetOpen(false);toast(state.picking?'请点地图上的起点。':'已取消选点。');},
  'begin-steps':()=>stepTo(0),'route-play':toggleRouteDemo,'next-step':()=>stepTo(state.step+1),'prev-step':()=>stepTo(state.step-1),'end-steps':()=>stepTo(-1),
  'route-change-end':()=>jumpToRouteControl('endPlace'),'route-settings':()=>jumpToRouteControl('routeSettingsTitle'),'route-compare':()=>jumpToRouteControl('routeCompareTitle'),
  dismiss,sources,fit,segments:()=>segments(),export:exportCard,
  'clear-place':()=>{state.selected=null;renderCard();renderPins();updatePlaceList();},
  'expand-list':()=>{state.expanded=true;updatePlaceList();},'geo-consent':geoConsent,'start-geo':startGeo,
  'stop-geo':()=>{clearWatch();geoStatus='';fit();renderCard();toast('已停止定位并清除本次位置。');},
  swap:()=>{state.step=-1;[state.from,state.to]=[state.to,state.from];state.choice=0;state.choiceTouched=false;calculate();routeSide();renderPath();renderPins();renderCard();},
  full:()=>{const el=$('panoView');if(document.fullscreenElement===el)document.exitFullscreen().catch(()=>toast('当前窗口无法退出全屏。'));else if(el.requestFullscreen)el.requestFullscreen().catch(()=>toast('当前窗口无法进入全屏。'));else toast('当前浏览器不支持全屏。');},
  'pano-help':panoHelp,
  'pano-online':()=>{if(!navigator.onLine){toast('当前离线，联网后可打开 720 云全景。');return;}state.locOnly=false;state.onlineScene=state.scene;changePanoMedia();},
  'pano-local':()=>{state.onlineScene=null;if(!hasImage(scenes.get(state.scene)))state.locOnly=true;changePanoMedia();},
  'pano-retry':changePanoMedia,
  'vr-reset':()=>vr?.reset(),
  'vr-auto':()=>{if(!vr)return;panoAutoChoice=vr.toggleAuto();}
};
document.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-segment],[data-place]');if(!b)return;
  const d=b.dataset;
  if(d.act){actions[d.act]?.();return;}
  if(d.cover!==undefined){previewCover(Number(d.cover));return;}
  if(d.faculty){focusFaculty(d.faculty);return;}
  if(d.facPhoto){facPhoto(d.facPhoto);return;}
  if(d.indoor){setSheetOpen(false);Indoor.open(d.indoor,{room:d.room||null,door:d.door||null});return;}
  if(d.inspect){dismiss();state.cat='全部';state.zone='全校';state.query='';setTab('explore');showMap('atlas');pickPlace(d.inspect);return;}
  if(d.sky){setSky(d.sky);return;}
  if(d.sun){setSun(d.sun);return;}
  if(d.wxT){const at=+d.wxT;dismiss();state.day=Weather.weekday(at);state.hour=new Date(at+288e5).getUTCHours();state.sky='auto';if(state.tab==='route'){updateRoute();routeSide();}else setTab('route');return;}
  if(d.near){dismiss();state.from=d.near;setTab('route');return;}
  if(d.tab){setTab(d.tab);return;}
  if(d.catFilter){filterPlaces(state.cat===d.catFilter?'全部':d.catFilter,state.zone);return;}
  if(d.zone){filterPlaces(state.cat,d.zone);return;}
  if(d.zoneView){zoneView(d.zoneView);return;}
  if(d.save){
    Directory.toggle(d.save);if(state.tab==='explore')updatePlaceList();renderPins();renderCard();
    $('mapCard').querySelector('[data-save]')?.focus({preventScroll:true});
    toast(places.get(d.save).name+(Directory.saved.has(d.save)?'已加入收藏。':'已移出收藏。'));return;
  }
  if(d.origin){state.from=d.origin;if(state.to===d.origin)state.to=d.origin==='library'?'gate':'library';setTab('route');return;}
  if(d.place){pickPlace(d.place,!b.classList.contains('pin'));return;}
  if(d.scene){if(b.disabled)return;dismiss();chooseScene(d.scene);return;}
  if(d.routeTo){dismiss();state.to=d.routeTo;if(state.to===state.from)state.from=state.to==='gate'?'library':'gate';state.choice=0;setTab('route');return;}
  if(d.detour!==undefined){state.step=-1;state.detour=+d.detour;state.choice=0;state.choiceTouched=false;calculate();routeSide();renderPath();renderCard();return;}
  if(d.choice!==undefined){stopRouteDemo();state.step=-1;state.choice=+d.choice;state.choiceTouched=true;routeResults();renderPath();fitRoute();renderCard();return;}
  if(d.segment!==undefined){segments(+d.segment);return;}
  if(d.scope){state.scope=d.scope;state.scenePlace=null;state.tourIdx=null;state.page=0;panoSide();return;}
  if(d.placeScenes){dismiss();const ids=placeScenes(d.placeScenes);if(!ids.length)return;state.scenePlace=d.placeScenes;state.tourIdx=null;state.sceneSearch='';state.page=0;state.scene=ids[0];setTab('pano');return;}
  if(d.tour!==undefined){state.tourIdx=+d.tour;state.scenePlace=null;state.sceneSearch='';state.page=0;state.scene=sceneTours[state.tourIdx].stops[0];panoSide();renderPano();return;}
  if(d.page){state.page+=+d.page;sceneList();return;}
  if(d.vr){vr?.turn(+d.vr*18,0);return;}
  if(d.vrzoom){vr?.zoom(+d.vrzoom);return;}
});
function setMapFocus(open){
  if(document.body.classList.contains('map-focus')===open)return;
  const button=$('mapFocusBtn');
  document.body.classList.toggle('map-focus',open);
  button.setAttribute('aria-pressed',String(open));
  const label=open?'退出专注':'专注地图';
  button.setAttribute('aria-label',label);
  button.title=open?'退出专注地图（Esc）':'收起面板，专注查看地图';
  button.querySelector('svg').outerHTML=icon(open?'restore-panel':'focus-map');
  button.querySelector('span').textContent=label;
  button.focus({preventScroll:true});
  if(!open)navIndicator();
}
$('mapFocusBtn').onclick=()=>setMapFocus(!document.body.classList.contains('map-focus'));
// ---- phones: the panel is a bottom sheet over the map. Drag its handle (or the bare peek) to open or close it;
// tap the dimmed map to close it. Desktop layouts never reach these handlers. ----
(()=>{
  const side=$('sidebar'),phone=()=>innerWidth<=680&&!document.body.classList.contains('map-focus');
  const peek=()=>parseFloat(getComputedStyle(side).getPropertyValue('--peek'))||118;
  let drag=null,swallowUntil=0;
  // the finger soon leaves the handle, so the move and the release are followed on the window, not on the sheet
  const move=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dy=e.clientY-drag.y0;
    if(!drag.moved){if(Math.abs(dy)<6)return;drag.moved=true;drag.max=Math.max(1,side.offsetHeight-peek());side.classList.add('dragging');}
    const t=performance.now();drag.v=(e.clientY-drag.last)/Math.max(1,t-drag.lastT);drag.last=e.clientY;drag.lastT=t;
    side.style.transform='translate3d(0,'+Math.max(0,Math.min(drag.max,(drag.open?0:drag.max)+dy))+'px,0)';
  };
  const release=()=>{const d=drag;drag=null;removeEventListener('pointermove',move);removeEventListener('pointerup',end);removeEventListener('pointercancel',end);
    if(d?.moved){side.classList.remove('dragging');side.style.transform='';}   // the transition carries it from the finger to where it settles
    return d;};
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const d=release();if(!d.moved)return;
    swallowUntil=performance.now()+350;
    const dy=e.clientY-d.y0;
    setSheetOpen(d.open?!(dy>d.max*.22||d.v>.45):(dy<-d.max*.16||d.v<-.45));
  };
  side.addEventListener('pointerdown',e=>{
    if(!phone()||e.button>0)return;
    if(drag)release();   // a press whose release never reached the page (it ended outside the window) is dropped
    const open=document.body.classList.contains('sheet-open'),grip=e.target.closest('.sheet-grip');
    // an open sheet scrolls its list, so only the handle drags it; a resting sheet can be pulled from anywhere that is not a control
    if(!grip&&(open||e.target.closest('input,select,textarea,label,button,a,[data-place],[data-scene]')))return;
    const t=performance.now();drag={id:e.pointerId,y0:e.clientY,open,moved:false,last:e.clientY,lastT:t,v:0};
    addEventListener('pointermove',move);addEventListener('pointerup',end);addEventListener('pointercancel',end);
  });
  // a drag that ends over a control (or the dimmed map) must not also press it
  addEventListener('click',e=>{if(performance.now()<swallowUntil){swallowUntil=0;e.stopPropagation();e.preventDefault();}},true);
  $('stage').addEventListener('click',e=>{if(phone()&&e.target===$('stage')&&document.body.classList.contains('sheet-open'))setSheetOpen(false);});
  // keyboard focus moving into the hidden part of a resting sheet opens it
  side.addEventListener('focusin',e=>{if(!phone()||document.body.classList.contains('sheet-open'))return;
    const r=e.target.getBoundingClientRect(),s=side.getBoundingClientRect();if(r.bottom>s.top+peek()+2)setSheetOpen(true);});
})();
$('aboutBtn').onclick=$('sourcesBtn').onclick=sources;$('liveBtn').onclick=$('locateMap').onclick=geoConsent;
$('dim3dBtn').onclick=()=>chooseDim('3d');$('dim2dBtn').onclick=()=>chooseDim('2d');
$('zoomIn').onclick=()=>zoom(1.45,undefined,undefined,true);$('zoomOut').onclick=()=>zoom(1/1.45,undefined,undefined,true);$('fitBtn').onclick=fit;
$('light3d').onclick=()=>{state.light3d=!state.light3d;try{localStorage.setItem('sunwalk.light3d',state.light3d?'1':'0');}catch{}
  $('light3d').setAttribute('aria-pressed',String(state.light3d));env3d();toast(state.light3d?'已打开日照与楼影：光线按当前时刻的太阳方向，夜间会变暗。':'已关闭日照与楼影，使用均匀柔光。');};
const flat=()=>!is3d()&&['atlas','official'].includes(state.map)&&state.tab!=='pano';
$('rot3d').onclick=()=>{if(is3d())Map3D.flyTo({bearing:Map3D.view().bearing+45},320);else if(flat())turnBy(-45);};
$('tilt3d').onclick=()=>{if(is3d()){const p=Map3D.view().pitch;Map3D.flyTo({pitch:p<20?50:p<62?72:0},340);}};
document.querySelector('.compass').addEventListener('click',()=>{if(is3d())Map3D.flyTo({bearing:0},320);else if(flat()&&view.rot)turnBy(-view.rot);});
const viewport=$('mapViewport'),pointers=new Map();
// Dragging must never start a text selection or the browser's own drag-and-drop (that froze the map with a 'no-drop' cursor).
for(const type of ['dragstart','selectstart'])$('stage').addEventListener(type,e=>{if(!e.target.closest?.('input,textarea'))e.preventDefault();});
// The right button turns the flat map (as in 3D), so the browser's own menu stays closed over it.
viewport.addEventListener('contextmenu',e=>e.preventDefault());
let dragMoved=false,gesture=null,trail=[];
const local=(x,y)=>{const r=viewport.getBoundingClientRect();return [x-r.left,y-r.top];};
// Read the gesture again from the pointers that are down: one pans (or turns the map, with the right button, Shift or Ctrl),
// two pinch, twist and pan at once. Each keeps the map point it took hold of under the pointer, so nothing drifts.
function grab(){
  const pts=[...pointers.values()],was=gesture;trail=[];
  if(!pts.length){gesture=null;return;}
  if(pts.length===1){const p=pts[0];
    if(p.turn){const c=[viewport.clientWidth/2,viewport.clientHeight/2];gesture={kind:'turn',x0:p.x,rot0:view.rot,c,m:toMap(c[0],c[1])};}
    else gesture={kind:'pan',m:toMap(...local(p.x,p.y))};
    return;}
  const [a,b]=pts,mid=local((a.x+b.x)/2,(a.y+b.y)/2);
  gesture={kind:'pinch',m:toMap(mid[0],mid[1]),d0:Math.max(10,Math.hypot(b.x-a.x,b.y-a.y)),a0:Math.atan2(b.y-a.y,b.x-a.x),k0:view.scale,r0:view.rot,twist:was?.kind==='pinch'&&was.twist};
}
function drive(){
  const g=gesture,pts=[...pointers.values()];if(!g||!pts.length)return;
  if(g.kind==='pan'){pinTo(g.m,local(pts[0].x,pts[0].y));trail.push([performance.now(),pts[0].x,pts[0].y]);if(trail.length>12)trail.shift();}
  else if(g.kind==='turn'){view.rot=g.rot0+(pts[0].x-g.x0)*.35;pinTo(g.m,g.c);}   // the same 0.35° per pixel as in 3D
  else if(pts.length>1){
    const [a,b]=pts,mid=local((a.x+b.x)/2,(a.y+b.y)/2),d=Math.max(10,Math.hypot(b.x-a.x,b.y-a.y)),ang=Math.atan2(b.y-a.y,b.x-a.x),tw=turnAngle((ang-g.a0)*180/Math.PI);
    // two fingers turn the map only once the twist is clearly meant (about 25 px along their circle), so a pinch stays a pinch
    if(!g.twist&&Math.abs(tw)*Math.PI/180*d/2>25){g.twist=true;g.a0=ang;g.r0=view.rot;}
    view.scale=clampScale(g.k0*d/g.d0);if(g.twist)view.rot=g.r0+turnAngle((ang-g.a0)*180/Math.PI);
    pinTo(g.m,mid);
  }
  applyTransform();
}
// Let go while moving and the map glides on for a moment, slowing down the way the 3D model does.
function glide(){
  const now=performance.now(),a=trail.find(s=>now-s[0]<100),b=trail.at(-1);
  if(reduceMotion||!a||a===b||now-b[0]>60)return;
  const dt=Math.max(8,b[0]-a[0]),tau=260,cap=1.6;let vx=(b[1]-a[1])/dt,vy=(b[2]-a[2])/dt;const sp=Math.hypot(vx,vy);
  if(sp*tau<6)return;if(sp>cap){vx*=cap/sp;vy*=cap/sp;}   // a jerk of the mouse cannot throw the map out of sight
  const x0=view.x,y0=view.y;
  const step=t=>{const e=t-now,k=tau*(1-Math.exp(-e/tau));view.x=x0+vx*k;view.y=y0+vy*k;camAnim=e<900?requestAnimationFrame(step):0;applyTransform();};
  camAnim=requestAnimationFrame(step);
}
viewport.addEventListener('pointerdown',e=>{if(e.target.closest('.route-line'))return;stopFly();
  if(e.pointerType==='mouse'){e.preventDefault();viewport.focus({preventScroll:true});if(e.button!==0&&e.button!==2)return;}
  getSelection()?.removeAllRanges();
  if(!pointers.size)dragMoved=false;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,turn:e.pointerType==='mouse'&&(e.button===2||e.shiftKey||e.ctrlKey)});grab();
  // on a building or a label the press may still be a tap that selects it, so capture only once the pointer really moves
  if(!e.target.closest('button,[data-place]')){viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');}
  viewport.classList.toggle('turning',gesture?.kind==='turn');});
viewport.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  const far=Math.hypot(e.clientX-p.x0,e.clientY-p.y0)>=5;
  if(!viewport.hasPointerCapture(e.pointerId)){if(!far)return;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');}
  if(far)dragMoved=true;
  p.x=e.clientX;p.y=e.clientY;drive();
});
// A touch is held by the pin or building it started on until the map takes it over; the pin then loses it, and that must
// not read as the finger lifting (it stopped drags that began on a label).
const endDrag=e=>{const p=pointers.get(e.pointerId);if(!p||e.type==='lostpointercapture'&&e.target!==viewport)return;
  const flick=gesture?.kind==='pan'&&dragMoved&&e.type==='pointerup';
  pointers.delete(e.pointerId);
  if(pointers.size){grab();return;}   // one finger stays down: it goes on panning from where it is
  viewport.classList.remove('dragging','turning');gesture=null;if(flick)glide();};
for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,endDrag);
viewport.addEventListener('click',e=>{if(dragMoved){dragMoved=false;e.stopPropagation();e.preventDefault();}},true);
viewport.addEventListener('dblclick',e=>{if(e.target.closest('button,.route-line'))return;const r=viewport.getBoundingClientRect();zoom(e.shiftKey?1/1.7:1.7,e.clientX-r.left,e.clientY-r.top,true);});
// The wheel zooms in proportion to how far it turns (a touchpad gives small, smooth steps); Shift + wheel turns the map.
viewport.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=local(e.clientX,e.clientY);
  let d=e.shiftKey?e.deltaY||e.deltaX:e.deltaY;if(e.deltaMode===1)d*=33;else if(e.deltaMode===2)d*=viewport.clientHeight;
  if(e.shiftKey){if(flat())turnBy(-d*.12,true);return;}
  zoom(Math.pow(1.0017,Math.max(-260,Math.min(260,-d))),x,y,'wheel');},{passive:false});
viewport.onkeydown=e=>{if(e.target!==viewport)return;const dif={ArrowLeft:[36,0],ArrowRight:[-36,0],ArrowUp:[0,36],ArrowDown:[0,-36]}[e.key];if(dif){e.preventDefault();stopFly();view.x+=dif[0];view.y+=dif[1];applyTransform();}if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.25:1.25,undefined,undefined,true);}
  if(['q','Q','e','E'].includes(e.key)&&flat()){e.preventDefault();turnBy(/q/i.test(e.key)?15:-15);}};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!$('modal').open&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){const field=$('placeSearch')||$('sceneSearch');if(field){e.preventDefault();setMapFocus(false);field.focus();}}});
$('sidebar').addEventListener('keydown',e=>{
  const selector=state.tab==='pano'?'.scene-row':'.fac-hits button,.room-row,.place-row';
  const row=e.target.closest?.(selector);
  if(!row||!['ArrowDown','ArrowUp'].includes(e.key))return;
  e.preventDefault();
  const rows=[...$('sidebar').querySelectorAll(selector)],i=rows.indexOf(row)+(e.key==='ArrowDown'?1:-1);
  if(i<0)($('placeSearch')||$('sceneSearch'))?.focus();else rows[i]?.focus();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open&&document.body.classList.contains('map-focus')){setMapFocus(false);e.preventDefault();return;}
  if(e.key!=='Escape'||$('modal').open||state.tab!=='explore'||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;
  if(state.selected)actions['clear-place']();else if(state.faculty)clearFaculty();});
window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
window.addEventListener('pagehide',()=>{if(watch!==null){clearWatch();geoStatus='';renderCard();}});
new ResizeObserver(()=>{
  if(state.tab==='pano')return;
  if(state.map==='geo'){map?.invalidateSize({pan:false});return;}
  const viewport=$('mapViewport'),w=viewport.clientWidth,h=viewport.clientHeight;
  if(!w||!h||!planeSize||planeSize.width===w&&planeSize.height===h)return;
  settleDimension?.();
  const center=toMap(planeSize.width/2,planeSize.height/2),turn=view.rot;
  const relativeZoom=view.scale/view.base;
  stopFly();measurePlane();
  if(is3d()){Map3D.resize();updateMapScale();}
  else{
    view.scale=relativeZoom*view.base;view.rot=turn;
    pinTo(center,[w/2,h/2]);
    applyTransform();
  }
  if(state.tab==='route'&&state.step<0)fitRoute();
}).observe($('stage'));
motionPreference.addEventListener('change',event=>{
  reduceMotion=event.matches;
  if(reduceMotion){settleDimension?.();stopFly();if(is3d())Map3D.setView({grow:1});}
  if(state.tab!=='pano'){renderPath();renderPins();}
});
(()=>{const q=new URL(location.href).searchParams,from=q.get('from'),to=q.get('to');if(!places.has(from)||!places.has(to)||from===to)return;
  state.from=from;state.to=to;const d=+q.get('day'),h=+q.get('hour'),m=q.get('mode'),r=+q.get('detour');
  if(Number.isInteger(d)&&d>=1&&d<=7)state.day=d;if(q.has('hour')&&h>=0&&h<24)state.hour=Math.round(h*2)/2%24;
  if(['auto','inside','outside'].includes(m))state.travel=m;if(['clear','cloudy','overcast','rain'].includes(q.get('sky')))state.sky=q.get('sky');if(q.has('detour')&&[0,.1,.2,.4].includes(r))state.detour=r;})();
setTab(location.hash.slice(1));
requestAnimationFrame(()=>{flyReady=true;});
const incoming=new URL(location.href).searchParams.get('place');
if(state.tab==='explore'&&places.has(incoming))pickPlace(incoming);
const incomingFac=new URL(location.href).searchParams.get('faculty');   // ?faculty=sci opens 理工学部 on the map
if(state.tab==='explore'&&!places.has(incoming)&&facUnits.has(incomingFac))focusFaculty(incomingFac);
(()=>{const q=new URL(location.href).searchParams,b=q.get('indoor');if(b&&typeof Indoor!=='undefined'&&Indoor.has(b))setTimeout(()=>Indoor.open(b,{room:q.get('room'),entrance:q.get('door')}),700);})();
$('modal').addEventListener('close',()=>{if(watch===null)locateForRoute=false;});
// Weather arrives a moment after the page: refresh what depends on it without touching what the walker is typing.
Weather.onChange(()=>{updateChip();
  if(state.tab==='route'){calculate();routeSide();renderPath();renderCard();}
  else if(state.tab==='explore'){const card=document.querySelector('.today-card');if(card)card.outerHTML=todayCard();if(state.shade&&$('shadeSky'))exploreSide();refreshAccess();}
  applySky();if($('modal').open&&$('modalContent').querySelector('.wx-dialog'))weatherDialog();});
updateChip();applySky();Weather.start();setInterval(updateChip,5*60e3);
