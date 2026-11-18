"""Build a north-up illustrated atlas and walkable graph from the supplied plan.

Run from the project folder:  python -B tools/build_detail.py
Needs Pillow and numpy (shade model reads assets/school-plan.jpg).
"""
from cartography import places, structures, areas, box, pts
from map_completion import COMPLETION_ROADS
from survey3d import BUILDINGS, SCENERY, DOORS, TEAM_DOORS, EXTRA_PATHS, TEAM_PATHS, PALETTE, GABLE_DOOR_CATEGORIES, COMPOUND, b as survey_b
from shade_model import ShadeModel, EXCLUDED
import surroundings
from pathlib import Path
import json, math, random
from html import escape

dest=Path(__file__).resolve().parents[1]/'dist'/'assets'
roads=[]
def road(name,kind,coords,role="campus"):
    points=pts(coords)
    roads.extend((name,kind,tuple(a),tuple(b),role) for a,b in zip(points,points[1:]) if a!=b)

road('诒文大道','axis','1172,282 1340,282 1548,282')
# 诒强路 sits at y=94, 9 px north of where the plan draws it: the strip of street trees north of it gives the dorm block
# south of it the room the paths the team drew between its rows need (2026-11-18, see make_room.py)
road('东6—8公寓东侧小径','narrow','1340,282 1340,155 1331,155 1331,94')
road('诒强路','axis','1185,94 1331,94 1548,94 1811,94')
road('诒德大道','axis','1548,94 1548,282')
road('诒滨路','lane','1811,94 1811,359 1811,540 1811,701')
road('诒德大道','axis','1548,94 1548,65')
road('诒德大道','axis','1548,282 1548,359 1548,540 1548,701 1548,852 1548,1137 1570,1137 1570,1228')
road('科技楼后花园小径','narrow','1548,359 1740,359 1740,351 1802,351 1802,359 1811,359')
road('诒渡桥','bridge','1811,359 1874,359')
road('后勤楼南侧步道','lane','1874,148 1996,146')
road('诒萌路','axis','1874,150 1874,359 1874,540 1874,726 1874,879')
road('诒通桥','bridge','1811,540 1874,540')
road('诒鸣广场环路','lane','1548,527 1577,527 1605,514 1670,514 1775,514 1775,620 1670,620 1577,620 1577,527')
road('九号教学楼前庭步道','lane','1668,527 1670,527 1670,536')
road('九号教学楼前庭步道','lane','1670,514 1670,527')
road('诒鸣广场花坛环路','lane','1670,536 1691,545 1700,566 1691,587 1670,596 1649,587 1640,566 1649,545 1670,536')
road('诒鸣广场','lane','1577,566 1640,566')
road('诒鸣广场','lane','1700,566 1775,566')
road('诒鸣广场','lane','1670,596 1670,620')
road('诒通桥西侧接引步道','lane','1775,540 1811,540')
road('诒和路','axis','1169,700 1188,700 1310,700 1490,700 1548,701 1811,701')
# No campus shortcut along the exterior west wall of the northern block.
road('餐饮中心东侧步道','lane','1490,463 1490,621 1528,621 1528,650 1531,650 1531,700 1548,701')
road('七号教学楼南侧步道','lane','1397,341 1548,341')
road('诒雅路','axis','1310,700 1310,803 1310,938')
road('东区生活区北侧小径','narrow','1188,741 1310,741')
road('东区生活区南侧小径','lane','1310,938 1395,938 1548,938')
road('东区南片公寓步道','lane','1395,938 1395,1137 1230,1137 1230,1228')
road('小南门步道','lane','1175,1228 1432,1228 1548,1228')
road('教师公寓北侧步道','lane','1432,1265 1548,1265 1548,1228')
# The campus road sits on the RIGHT (east) side of 西译宾馆 and leads to the skybridge landing.
road('宾馆右侧校内步道','lane','1188,700 1188,803 1188,1228')
road('西译天渡','sky','1040,803 1105,803 1188,803','skybridge')
road('诒趣园北侧广场','lane','1548,852 1741,852')
road('东南片区河岸便道','lane','1829,1097 1859,1097 1899,1100')
road('西区公寓东侧步道','lane','1040,803 1040,806 1026,806 1026,927')
road('诒才路','axis','571,916 700,927 860,927 1026,927 1034,927')
road('西区北片公寓步道','axis','779,610 779,650 779,803 937,803 1040,803')
road('西区一至四公寓小径','lane','937,655 937,803')
road('西区五六公寓小径','lane','779,803 779,837')
road('诒颖路','axis','574,584 574,803 571,916')
road('西区运动场南侧步道','lane','350,703 574,703')
road('网球场东侧步道','lane','350,620 350,703')
road('西区生活区西侧步道','lane','206,703 206,895 206,1102')
road('西区生活区北侧步道','lane','206,895 342,895 430,895 571,895 571,916')
road('西区图书馆南侧步道','lane','348,787 549,787 574,787')
road('西区餐饮中心西侧步道','lane','348,787 348,895')
road('西区公寓东侧小径','lane','430,895 430,1102')
road('休闲广场南侧步道','lane','206,1102 430,1102 558,1102 702,1114')
road('诒英广场东侧步道','lane','702,927 702,1114 702,1181')
road('西区南片公寓步道','lane','702,1114 971,1114')
road('诒英广场步道','lane','571,916 572,985 558,1041 558,1102')
road('诒芳园东侧步道','lane','977,927 977,1014 977,1114 971,1114')
road('西区四号楼北侧步道','lane','834,1014 977,1014')
for name,kind,coordinates in COMPLETION_ROADS:road(name,kind,coordinates)
# paths visible in the 720 云 panoramas but not drawn on the plan
for name,kind,coordinates,_ in EXTRA_PATHS+TEAM_PATHS:road(name,kind,coordinates)

# A separate ground-level graph for 太乙宫正街 (outside the campus). Its geometric crossing with the
# skybridge is deliberately NOT a junction; only the four named gates connect the two levels.
road('太乙宫正街校外步道','outside','1098,282 1098,700 1098,927 1098,1050 1150,1230','outside')
sky_ends={(1040,803),(1188,803)}
# ---- the paths the team drew get a full lane: the buildings beside them move aside (tools/make_room.py) ----
from make_room import make_room
TEAM_NAMES={n for n,*_ in TEAM_PATHS}
roads[:]=[(n,'lane' if n in TEAM_NAMES and k=='narrow' else k,a,b,role) for n,k,a,b,role in roads]
ROOM=make_room(structures,places,roads,TEAM_NAMES)
# Split at intersections, then connect each destination to a visible sidewalk.
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def dot(a,b):return a[0]*b[0]+a[1]*b[1]
def proj(p,a,b):
    v=(b[0]-a[0],b[1]-a[1]);t=max(0,min(1,dot((p[0]-a[0],p[1]-a[1]),v)/dot(v,v)))
    return tuple(round(a[i]+t*v[i],2) for i in (0,1))
def hit(p,q,a,b):
    d=cross(p,q,b)-cross(p,q,a)
    if not d:return None
    t=-cross(p,q,a)/d;s=cross(a,b,p)/(cross(a,b,p)-cross(a,b,q))
    if -.00001<=s<=1.00001 and -.00001<=t<=1.00001:return tuple(round(a[i]+t*(b[i]-a[i]),2) for i in (0,1))
def fmt(p):return ','.join(f'{n:g}' for n in p)
blocks=[s[2] for s in structures if not s[0].endswith('-tower')]   # towers stand on their own building
def cuts(a,b):
    for poly in blocks:
        for c,d in zip(poly,poly[1:]+poly[:1]):
            if cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0:return True
    return False
parts=[{a,b} for _,_,a,b,_ in roads]
for i,(_,_,a,b,role) in enumerate(roads):
    for j in range(i):
        c,d=roads[j][2:4];other_role=roads[j][4]
        if (role=='outside') != (other_role=='outside'):continue
        if (role=='skybridge') != (other_role=='skybridge'):
            for endpoint in sky_ends:
                if math.dist(endpoint,proj(endpoint,a,b))<.02 and math.dist(endpoint,proj(endpoint,c,d))<.02:
                    parts[i].add(endpoint);parts[j].add(endpoint)
            continue
        p=hit(a,b,c,d)
        if p:parts[i].add(p);parts[j].add(p)
        for v in (a,b):
            if math.dist(v,proj(v,c,d))<.02:parts[j].add(v)
        for v in (c,d):
            if math.dist(v,proj(v,a,b))<.02:parts[i].add(v)
nodes={};edges=[];endpoints={}
def nid(p,role='campus'):
    prefix='o' if role=='outside' else 'b' if role=='skybridge' and p not in sky_ends else 'n'
    k=prefix+fmt(p).replace(',','_');nodes[k]=list(p);return k
scale=.60  # nominal; checked against AMap distances (0.45-0.60 m/px across the plan, see surroundings.py)
def add(a,b,name,kind,role="campus"):
    if a==b:return
    x,y=nodes[a];X,Y=nodes[b]
    edges.append(dict(a=a,b=b,name=name,meters=max(1,round(math.hypot(X-x,Y-y)*scale)),shade=None,role=role,kind=kind))
# Gate names as printed on the AMap base map, so both vocabularies can be searched.
AMAP_GATES={'gate':(('北大门','东区北大门'),'高德地图上标为「北大门」。'),
    'gate-south':(('东区西门',),'高德地图上标为「西门」（它在东区西侧、临太乙宫正街）。'),
    'gate-small':(('西南门','东区西南门'),'高德地图上标为「西南门」。'),
    'west-gate':(('西区东门',),'高德地图上标为「东门」（西区东侧、临太乙宫正街）。')}
building_ids={s[0] for s in structures}
PART_OF={s['id']:s['of'] for s in SCENERY if s.get('of')}   # blocks that belong to a destination
NO_DOOR={'e-flag-platform'}
def nearest(p,a):
    poss=[]
    for i,(name,k,s,t,role) in enumerate(roads):
        if role != ('skybridge' if p['id']=='skybridge' else 'campus'):continue
        b=proj(a,s,t)
        if (p['zone']=='西区' and b[0]>1065) or (p['zone']=='东区' and b[0]<1130):continue
        if (p['id'] in ('gym','track','e-ball','e-tennis','zhongnan','foreign','e-office7','e-ball-south') and b[0]<1820):continue
        if not cuts(a,b):poss.append((math.dist(a,b),i,b))
    return min(poss) if poss else None
def door_point(poly,side,t):
    # the wall point on that side of the footprint, a point 4 px outside it and one 3 px inside
    xs=[q[0] for q in poly];ys=[q[1] for q in poly];x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    ring_=list(zip(poly,poly[1:]+poly[:1]))
    if side in 'NS':
        x=x0+t*(x1-x0)+.37;hits=[a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]) for a,b in ring_ if (a[0]>x)!=(b[0]>x)]
        y=min(hits) if side=='N' else max(hits);n=(0,-1) if side=='N' else (0,1)
    else:
        y=y0+t*(y1-y0)+.37;hits=[a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]) for a,b in ring_ if (a[1]>y)!=(b[1]>y)]
        x=min(hits) if side=='W' else max(hits);n=(-1,0) if side=='W' else (1,0)
    r=lambda v:round(v,1)
    return (r(x),r(y)),(r(x+n[0]*4),r(y+n[1]*4)),(r(x-n[0]*3),r(y-n[1]*3))
WORD={'N':'北','S':'南','E':'东','W':'西'}
KIND={'main':'正门','back':'后门','side':'侧门'}
def door_specs(p):
    if p['id'] in DOORS:return DOORS[p['id']]
    xs=[q[0] for q in p['footprint']];ys=[q[1] for q in p['footprint']];x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
    ax,ay=p['access'];cx,cy=(x0+x1)/2,(y0+y1)/2
    if p['category'] in GABLE_DOOR_CATEGORIES:
        side=('W' if ax<cx else 'E') if x1-x0>=y1-y0 else ('N' if ay<cy else 'S')
        return [dict(kind='main',side=side,t=.5,label=WORD[side]+'端门',src='类推')]
    side=('W' if ax<cx else 'E') if abs(ax-cx)/(x1-x0)>abs(ay-cy)/(y1-y0) else ('N' if ay<cy else 'S')
    t=(ax-x0)/(x1-x0) if side in 'NS' else (ay-y0)/(y1-y0)
    return [dict(kind='main',side=side,t=max(.2,min(.8,t)),label=WORD[side]+'门',src='推定')]
for p in places:
    if p['id']=='west-lib':p['official']=[376,749];p['access']=[379,787]
    if p['id']=='e-teach6':p['access']=[1466,342]
    if p['id']=='staff-4':p['access']=[1230,1168]
    if p['id']=='guest':
        p['access']=[1188,766]
        p['description']='校内通道位于西译宾馆右侧（东侧），沿此路可到达西译天渡东端。宾馆左侧临太乙宫正街，不是校内通道。'
    if p['id']=='e-train2':p['access']=[1188,922]
    if p['id']=='skybridge':
        p['access']=[1105,803]
        p['description']='连接东西校区内部的天渡。只能从两侧校内上下，校外街道不能上桥，桥下平面交叉不连通。'
    if p['id']=='west-gate':
        p['description']='从校外地面进入西区的唯一入口。周三、周五、周六、周日可走校外经此门；周一、周二、周四禁止出校，往返东西区只走西译天渡。'
    if p['id']=='gate-small':
        p['description']='东区南部靠近教师公寓的门。学生不能从小南门进出，路线不会穿过此门；出校请走东区北门或南门。'
    if p['id']=='e-office7':p['access']=[1996,146]
    if p['id']=='east-6':p['access']=[1271,94]
    if p['id'] in ('gate','gate-south','west-gate'):p['description']+='晚上 21:00 后学生只进不出。'
    if p['id'] in AMAP_GATES:
        p['aliases']=list(p['aliases'])+list(AMAP_GATES[p['id']][0]);p['description']+=AMAP_GATES[p['id']][1]
    a=tuple(p['access'])
    # ---- doors: a building is entered through its doors (720 云 survey, see survey3d.py) ----
    attached=[]
    if (p['id'] in building_ids or p.get('sharedFootprint')) and p['id'] not in NO_DOOR:
        specs=list(door_specs(p));opposite={'E':'W','W':'E','N':'S','S':'N'}
        for n_spec,spec in enumerate(specs):
            wall,out,inn=door_point(p['footprint'],spec['side'],spec['t'])
            hit_=nearest(p,out)
            if not hit_ or hit_[0]>95:
                # a gable end that is built against the next block: the door is in the other end
                if spec['src']=='类推' and len(specs)==1:specs.append(dict(spec,side=opposite[spec['side']],label=WORD[opposite[spec['side']]]+'端门'))
                else:print('CHECK door',p['id'],spec['label'],hit_ and round(hit_[0]))
                continue
            gap,i,b=hit_;parts[i].add(b)
            dn=nid(out);add(nid(b),dn,p['name']+spec['label'].split('（')[0]+'前步道','access')
            attached.append(dict(spec,x=wall[0],y=wall[1],node=dn,inner=inn,road=roads[i][0],gap=gap))
    if attached:
        attached.sort(key=lambda d:d['kind']!='main')
        hub='h_'+p['id'];nodes[hub]=list(attached[0]['inner'])
        for dr in attached:
            add(dr['node'],hub,p['name']+dr['label'],'door');edges[-1].update(door=p['id'],doorKind=dr['kind'],meters=2)
        endpoints[p['id']]=hub;main=attached[0]
        p.update(x=p['official'][0],y=p['official'][1],access=[round(v) for v in nodes[main['node']]],approach=main['road'],
            doors=[dict(kind=dr['kind'],label=dr['label'],side=dr['side'],src=dr['src'],x=dr['x'],y=dr['y'],node=dr['node']) for dr in attached])
        # e.g. 「正门：南门（大台阶）；后门：南侧后门。门的位置依据团队在地图上的标注。」 (a route ends at whichever door is nearer)
        listing='；'.join(KIND[k]+'：'+'、'.join(dr['label'] for dr in attached if dr['kind']==k) for k in KIND if any(dr['kind']==k for dr in attached))
        p['accessNote']=(listing+'。'+('门的位置依据 720 云实景。' if main['src'] in ('地面','航拍') else '门的位置依据团队提供的楼层平面图。' if main['src']=='平面图' else '门的位置依据团队在地图上的标注。' if main['src']=='团队' else '宿舍门按实景所见都在山墙端，具体哪一端以现场为准。' if main['src']=='类推' else '这栋楼的门在全景里看不到，按朝向最近步道的一侧推定，以现场为准。'))
        gap,i=main['gap'],[r[0] for r in roads].index(main['road'])
    else:
        hit_=nearest(p,a)
        if not hit_:raise ValueError(p['id'])
        gap,i,b=hit_;parts[i].add(b)
        # The route terminates on the identifiable path, not in the building.
        role=roads[i][4];endpoints[p['id']]=nid(a,role);add(nid(b,role),nid(a,role),p['name']+'旁接近点','access',role);p.update(x=p['official'][0],y=p['official'][1],access=list(a),approach=roads[i][0])
    if p.get('addedInCompletion'):
        p['description']=(p['note']+' ' if p.get('note') else '')+f"位于{p['zone']}，可沿{p['approach']}到达附近。具体入口请按现场标识确认。"
        p.pop('note',None)
    if gap>100:print('CHECK approach',p['id'],a,b,round(gap))
for section,points in zip(roads,parts):
    name,k,a,b,role=section;seq=sorted(points,key=lambda v:math.dist(v,a))
    for s,t in zip(seq,seq[1:]):add(nid(s,role),nid(t,role),name,k,role)
door_count={k:sum(1 for p in places for dr in p.get('doors',[]) if dr['src']==k) for k in ('地面','航拍','平面图','团队','类推','推定')}
gates=[('gate',(1098,282),'东区北门出入口'),('gate-south',(1098,700),'东区南门出入口'),
       ('gate-small',(1150,1230),'东区小南门出入口'),('west-gate',(1098,927),'西区正门校外入口')]
# 小南门：学生不能通行（团队 2026-11-11 说明）。门仍画在图上、可作为校内目的地，但出入口这一段不参与任何路线。
CLOSED_GATES={'gate-small':'学生不能从小南门进出'}
for ident,point,name in gates:
    add(nid(point,'outside'),endpoints[ident],name,'access','gate')
    edges[-1]['out']=nid(point,'outside')   # 校外一侧的节点：夜间只允许从这一端走进校内
    if ident in CLOSED_GATES:edges[-1].update(closed=True,closedReason=CLOSED_GATES[ident],gate=ident)

# ---- summer shade per segment (720 云实景 + 校图树冠 + 楼栋阴影) ----
model=ShadeModel(dest/'school-plan.jpg',structures,{p['id']:p for p in places})
for e in edges:
    e['shade'],e['shadeSrc']=model.segment(nodes[e['a']],nodes[e['b']],e['name'],e['role'])

atlas=dict(width=2048,height=1320,places=places,nodes=nodes,edges=edges,access=endpoints,
    structures=[dict(id=i,category=c,polygon=shape,**({'of':PART_OF[i]} if i in PART_OF else {})) for i,c,shape in structures],areas=areas,
    sourceRoads=[dict(name=name,kind=k,a=a,b=b,role=role) for name,k,a,b,role in roads],
    rules=dict(outsideDays=[3,5,6,7],westGroundGate='west-gate',closedGates=sorted(CLOSED_GATES),nightEntryOnly={'from':21,'assumedUntil':6,'note':'晚上 21:00 后所有校门学生只进不出'},authority='使用者2026-11-09、2026-11-11、2026-11-12现场说明；示意图仅作布局参考'),
    extent=dict(x=surroundings.EXTENT[0],y=surroundings.EXTENT[1],w=surroundings.EXTENT[2]-surroundings.EXTENT[0],h=surroundings.EXTENT[3]-surroundings.EXTENT[1]),
    surroundings=dict(source='高德地图 Web 端底图（© AutoNavi），2026-11-10 人工描绘',pois=len(surroundings.POIS),areas=[n for n,_ in surroundings.BUILT],note='校外部分为示意，距离经压缩，不参与步行计算'),
    shadeModel=model.summary(),panoramas=model.panoramas(),panoramaExcluded=EXCLUDED,
    survey=dict(work='720 云《西安翻译学院全景校园》a2bjzOkfrk4',date='2026-11-13',aerial=5,ground=41,doors=door_count,
        doorMarks=dict(date='2026-11-18',places=sorted(TEAM_DOORS),main=sum(1 for v in TEAM_DOORS.values() for x in v if x['kind']=='main'),back=sum(1 for v in TEAM_DOORS.values() for x in v if x['kind']=='back'),
            note='团队在 3D 地图截图上用红笔标正门、蓝笔标后门（11 张图），当天又把东18公寓的正门改到北面；标了门的楼只保留标出的门'),extraPaths=[dict(name=n,evidence=ev) for n,k,c,ev in EXTRA_PATHS],teamPaths=sorted({n for n,k,c,ev in TEAM_PATHS}),teamNote='团队 2026-11-17 在地图截图上手绘补充的路，按宿舍楼位置对齐后读出，未现场测量',room=dict(moved=ROOM['moved'],slid=ROOM['slid'],narrow=ROOM['degraded'],road='诒强路北移 9 像素（y 103→94）',note='新路按普通道路宽度（11 像素）画，两侧的楼平移、必要时压缩进深，给新路让出完整宽度；楼的位置本来就是示意'),split=[dict(place='e-teach6',into=['e-teach6','e-teach6-e','e-teach6-w'],evidence='航拍《东区校园》：三栋米色楼围着朝北开口的小院，彼此不相连；校方示意图画成一个连体的 U 形。A 楼（靠餐饮中心的一栋）的名称和楼层来自团队提供的平面图；东楼、西楼是按方位起的名字')],note='楼层、屋顶、门和补充小路取自全景观察；位置仍在示意图坐标里，不是测绘'),
    source='https://dzb.xafy.edu.cn/xxdh/xxdt.htm',official=dict(width=2048,height=1568,image='assets/school-plan.jpg'))
(dest/'atlas-data.js').write_text('window.CAMPUS_ATLAS = '+json.dumps(atlas,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')

# ---------------- illustrated base map (see render_map.py) ----------------
from render_map import render
marks=[dict(x=dr['x'],y=dr['y'],side=dr['side'],kind=dr['kind']) for p in places for dr in p.get('doors',[])]
trees=render(roads,structures,areas,edges,nodes,endpoints,gates,dest/'campus.svg',doors=marks)
render(roads,structures,areas,edges,nodes,endpoints,gates,dest/'campus-ground.svg',doors=marks,ground=True)
# ---- what the 3D model needs beyond the atlas ----
def info(ident,cat,zone):
    v=BUILDINGS.get(ident) or next((s for s in SCENERY if s['id']==ident),None)
    if not v:
        h=model.summary()['heightOverrides'].get(ident,model.summary()['heights'].get(cat,12))
        v=survey_b(max(1,round(h/3.3)),'whitetile' if cat=='宿舍' else 'beige',h=h,src='推定')
    return {k:v[k] for k in ('floors','wall','roof','roofTone','height','src','glass','trim','note')}
zone_of={p['id']:p['zone'] for p in places}
scene=dict(palette=PALETTE,buildings={i:info(i,c,zone_of.get(i,'')) for i,c,_ in structures},scenery=[s['id'] for s in SCENERY],
    compound=COMPOUND,trees=[[round(x,1),round(y,1),round(r,1),round(k,2)] for x,y,r,k in trees],
    bridge=dict(a=[1040,803],b=[1188,803],deck=6.5,width=9),
    gates=[dict(id='gate',x=1137,y=282,axis='y',span=30,style='north'),dict(id='gate-south',x=1137,y=700,axis='y',span=24,style='plain'),
           dict(id='west-gate',x=1062,y=927,axis='y',span=34,style='west'),dict(id='gate-small',x=1180,y=1230,axis='y',span=18,style='closed')])
(dest/'scene3d.js').write_text('window.CAMPUS_3D = '+json.dumps(scene,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
print('doors',door_count,'· trees',len(trees),'· buildings',len(scene['buildings']))
m=model.summary()
print(len(places),'places,',len(nodes),'junctions,',len(edges),'edges · shade fit lo',m['fitLow'],'hi',m['fitHigh'],'LOO MAE',m['looMAE'])
print('sun',m['sun'])
