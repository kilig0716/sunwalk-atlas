"""Check coverage against the independently read source-plan inventory."""
from pathlib import Path
import json, math
import unittest
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent

class InventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.expected=json.loads((ROOT/'docs/map-inventory-source.json').read_text(encoding='utf8'))
        raw=(ROOT/'dist/assets/atlas-data.js').read_text(encoding='utf8');cls.model=json.loads(raw[raw.index('{'):raw.rindex('}')+1])

    def test_all_original_and_missing_destinations_exist(self):
        actual={p['id']:p for p in self.model['places']}
        missing=[p['name'] for p in self.expected['previous_places']+self.expected['missing_places'] if p['id'] not in actual]
        self.assertEqual(missing,[])
        # plus the destinations the team asked to split after the inventory was read (6号教学楼 → 南楼、东楼、西楼)
        split=[p for p in actual.values() if p.get('splitFrom')]
        self.assertEqual(sorted(p['id'] for p in split),['e-teach6-e','e-teach6-w'])
        self.assertEqual(len(actual),len(self.expected['previous_places'])+len(self.expected['missing_places'])+len(split))

    def test_all_named_roads_and_missing_connections_exist(self):
        names={e['name'] for e in self.model['edges']}
        missing=[n for n in self.expected['named_roads']+self.expected['required_links'] if n not in names]
        self.assertEqual(missing,[])
        # The east-bank road is 诒萌路 (plan text 艹+日月, confirmed by the 720 云 scene title).
        self.assertIn('诒萌路',names)
        self.assertNotIn('诒荫路',names)
        self.assertNotIn('西区教工及实训区小径',names)

    def test_every_teaching_building_has_its_faculty_written(self):
        # 《4学部+6学院》(team, 2026-11-16): four faculties and six colleges, with the buildings each one uses
        raw=(ROOT/'dist/assets/faculty-data.js').read_text(encoding='utf8');fac=json.loads(raw[raw.index('{'):raw.rindex('}')+1])
        places={p['id']:p for p in self.model['places']};units=fac['units']
        self.assertEqual([u['kind'] for u in units].count('学部'),4);self.assertEqual([u['kind'] for u in units].count('学院'),6)
        where={}
        for u in units:
            for b in u['buildings']:
                self.assertIn(b['place'],places);where.setdefault(b['place'],[]).append(u['name'])
        expect={'e-teach6':['理工学部'],'e-teach6-e':['理工学部'],'e-teach6-w':['理工学部'],'e-teach7':['理工学部'],'e-teach8':['人文与艺术学部'],
                'e-teach9':['经济与管理学部'],'e-teach10':['健康与体育学部'],'w-teach2':['英文学院'],'w-teach3':['国际语言文化学院'],
                'w-teach4':['英文学院','国际语言文化学院'],'w-teach5':['人文与艺术学部','继续教育学院','国际交流学院'],
                'e-office4':['马克思主义学院'],'e-office5':['创新创业学院']}
        self.assertEqual({k:sorted(v) for k,v in where.items()},{k:sorted(v) for k,v in expect.items()})
        # every “…教学楼” on the map is either in the list or marked as not named by it
        teaching=[p['id'] for p in places.values() if '教学楼' in p['name']]
        self.assertEqual(sorted(t for t in teaching if t not in where),sorted(fac['unlisted']))
        floors={(u['name'],b['place']):b['floor'] for u in units for b in u['buildings'] if b['floor']}
        self.assertEqual(floors,{('马克思主义学院','e-office4'):'三层',('创新创业学院','e-office5'):'一层'})
        self.assertEqual(len({u['color'] for u in units}),10)
        for pid,ph in fac['photos'].items():
            self.assertIn(pid,where);self.assertTrue((ROOT/'dist'/ph['src']).exists(),pid)

    def test_staff_compound_is_split_as_seen_in_the_panoramas(self):
        # The plan draws one blank block between the north and south gates. The aerial panoramas show the street-side
        # slab (5号教师公寓) plus a tower, a courtyard school and courtyard houses behind it.
        structure=next((b for b in self.model['structures'] if b['id']=='staff-5'),None)
        self.assertIsNotNone(structure)
        xs=[p[0] for p in structure['polygon']];ys=[p[1] for p in structure['polygon']]
        self.assertLess(max(xs)-min(xs),80);self.assertGreater(max(ys)-min(ys),120)
        inside=[b for b in self.model['structures'] if b['id'].startswith('fam-')]
        self.assertGreaterEqual(len(inside),10)
        for b in inside:
            for x,y in b['polygon']:self.assertTrue(1138<=x<=1376 and 302<=y<=688,b['id'])

    def test_teaching_building_6_is_three_separate_buildings(self):
        # The plan draws 东区6号教学楼 as one U. The aerial panorama shows three blocks around a court that opens to
        # the north; the team confirmed they are not joined and asked for three destinations.
        ids=['e-teach6','e-teach6-e','e-teach6-w'];places={p['id']:p for p in self.model['places']}
        self.assertEqual([places[i]['name'] for i in ids],['东区6号教学楼A楼','东区6号教学楼东楼','东区6号教学楼西楼'])
        blocks=[next(b for b in self.model['structures'] if b['id']==i) for i in ids]
        boxes=[(min(x for x,_ in b['polygon']),min(y for _,y in b['polygon']),max(x for x,_ in b['polygon']),max(y for _,y in b['polygon'])) for b in blocks]
        for i,a in enumerate(boxes):
            self.assertTrue(1403<=a[0] and a[2]<=1521 and 350<=a[1] and a[3]<=453)   # still on the plot the plan gives it
            for b in boxes[i+1:]:
                self.assertGreaterEqual(max(b[0]-a[2],a[0]-b[2],b[1]-a[3],a[1]-b[3]),6)   # 6 px ≈ 3.6 m apart: not joined
        self.assertEqual([d['src'] for d in places['e-teach6']['doors']],['平面图']*3)   # A 楼 (by the dining centre): the team's floor plan
        for i in ids[1:]:
            self.assertEqual(len(places[i]['doors']),1);self.assertEqual(places[i]['doors'][0]['src'],'推定')
        for i in ids:self.assertEqual(places[i]['approach'],'6号教学楼内院步道')

    def test_paths_the_team_drew_are_in_the_network(self):
        # 2026-11-17: the team marked missing paths on screenshots of the map; each one is a walkway now
        names={e['name'] for e in self.model['edges']};team=self.model['survey']['teamPaths']
        self.assertGreaterEqual(len(team),40);self.assertEqual([n for n in team if n not in names],[])
        nodes=self.model['nodes'];ends=lambda name:{tuple(nodes[k]) for e in self.model['edges'] if e['name']==name for k in (e['a'],e['b'])}
        # A 楼 is joined to the dining centre's north door and, along the same lane, to 诒德大道
        self.assertIn((1548,463),ends('6号教学楼A楼南侧通道')&ends('诒德大道'))
        door=next(e for e in self.model['edges'] if e['name']=='东区餐饮中心北门（朝 6 号楼 A 楼）')
        outside={door['a'],door['b']}-{self.model['access']['dining']}   # the door, then the short walk to the lane in front of it
        reach=outside|{e['a'] if e['b'] in outside else e['b'] for e in self.model['edges'] if e.get('kind')=='access' and {e['a'],e['b']}&outside}
        self.assertTrue({tuple(nodes[k]) for k in reach}&ends('6号教学楼A楼南侧通道'))

    def test_new_paths_show_their_full_width(self):
        # 2026-11-18: the buildings beside the paths the team drew were moved aside (tools/make_room.py), so each path
        # shows its whole drawn width - an 11 px lane and its edge - instead of a sliver between two buildings
        team=set(self.model['survey']['teamPaths']);nodes=self.model['nodes']
        polys=[(b['id'],b['polygon']) for b in self.model['structures'] if not b['id'].endswith('-tower')]
        short=[]
        for e in self.model['edges']:
            if e['name'] not in team or e.get('kind') in ('door','access'):continue
            a,b=nodes[e['a']],nodes[e['b']];vx,vy=b[0]-a[0],b[1]-a[1];L2=vx*vx+vy*vy
            if L2<1:continue
            need={'lane':6.5,'narrow':5.0}[e['kind']]   # half the drawn width plus most of its 1.5 px edge
            for sid,P in polys:
                for p,q in zip(P,P[1:]+P[:1]):
                    for k in range(21):
                        x,y=p[0]+(q[0]-p[0])*k/20,p[1]+(q[1]-p[1])*k/20;s=((x-a[0])*vx+(y-a[1])*vy)/L2
                        if 0<s<1 and math.hypot(x-a[0]-s*vx,y-a[1]-s*vy)<need:short.append((e['name'],sid));break
        self.assertEqual(sorted(set(short)),[])
        self.assertEqual({e['kind'] for e in self.model['edges'] if e['name'] in team and e.get('kind') not in ('door','access')},{'lane'})
        self.assertGreaterEqual(len(self.model['survey']['room']['moved']),10)

    def test_every_building_has_a_door_on_its_own_wall(self):
        built={b['id'] for b in self.model['structures']}
        def edge_gap(p,poly):
            best=1e9
            for a,b in zip(poly,poly[1:]+poly[:1]):
                vx,vy=b[0]-a[0],b[1]-a[1];L=vx*vx+vy*vy or 1;k=max(0,min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/L))
                best=min(best,((p[0]-a[0]-k*vx)**2+(p[1]-a[1]-k*vy)**2)**.5)
            return best
        missing=[]
        for p in self.model['places']:
            if not (p['id'] in built or p.get('sharedFootprint')) or p['id']=='e-flag-platform':continue
            doors=p.get('doors') or []
            if not doors:missing.append(p['id']);continue
            self.assertEqual(doors[0]['kind'],'main',p['id'])
            for d in doors:
                self.assertIn(d['src'],('地面','航拍','平面图','团队','类推','推定'))
                self.assertIn(d['kind'],('main','back','side'))
                self.assertLess(edge_gap((d['x'],d['y']),p['footprint']),.8,p['id']+d['label'])
        self.assertEqual(missing,[])
        seen=sum(1 for p in self.model['places'] for d in p.get('doors',[]) if d['src'] in ('地面','团队'))
        self.assertGreaterEqual(seen,105)

    def test_doors_follow_the_team_marks(self):
        # 2026-11-18: the team marked main doors red and back doors blue on screenshots of the 3D map; a marked building
        # keeps exactly the marked doors (tools/survey3d.py TEAM_DOORS)
        places={p['id']:p for p in self.model['places']};marks=self.model['survey']['doorMarks']
        self.assertEqual((len(marks['places']),marks['main'],marks['back']),(63,66,37))
        for i in marks['places']:
            doors=places[i]['doors'];self.assertTrue(doors and all(d['src']=='团队' for d in doors),i)
            self.assertEqual(doors[0]['kind'],'main',i);self.assertTrue(all(d['kind'] in ('main','back') for d in doors),i)
        dorms=[p for p in self.model['places'] if p['category']=='宿舍']
        self.assertEqual(len(dorms),34);self.assertTrue(all(p['id'] in marks['places'] for p in dorms))
        for p in dorms:   # every dorm slab runs east-west: main doors on a long side, back doors in a gable end
            self.assertTrue(all(d['side'] in 'NS' for d in p['doors'] if d['kind']=='main'),p['id'])
            self.assertTrue(all(d['side'] in 'EW' for d in p['doors'] if d['kind']=='back'),p['id'])
        self.assertEqual(sum(1 for p in self.model['places'] for d in p.get('doors',[]) if d['src']=='类推'),0)
        side=lambda i:[(d['kind'],d['side']) for d in places[i]['doors']]
        self.assertEqual(side('east-18'),[('main','N')])   # drawn on the south side, corrected by the team the same day
        self.assertEqual(side('east-17'),[('main','N'),('main','S')])
        self.assertEqual(side('library'),[('main','S'),('back','S')])
        self.assertEqual(places['library']['doors'][0]['y'],250.5)   # the main door is in the recess of the south front
        self.assertEqual(side('e-teach8'),[('main','E'),('main','W'),('back','E'),('back','E'),('back','W')])
        self.assertEqual(places['e-teach8']['doors'][0]['x'],1384)   # the court face towards 诒华广场
        self.assertEqual(side('e-teach10'),[('main','E')]+[('back','W')]*3+[('back','E')]*2)
        self.assertEqual(side('tech'),[('main','W'),('back','N'),('back','E'),('back','S')])
        self.assertEqual(side('west-lib'),[('main','W'),('back','N')])
        self.assertEqual(places['west']['doors'][1]['x'],710)   # the back door is the small porch on the west side
        for i in ('w-teach2','w-teach3'):self.assertEqual(side(i),[('main','N'),('back','W')])
        self.assertEqual(len(places['w-train5']['doors']),1)
        # each marked door reaches a path within 70 px (about 40 m)
        nodes=self.model['nodes']
        for i in marks['places']:
            for d in places[i]['doors']:
                walk=[e for e in self.model['edges'] if e['kind']=='access' and d['node'] in (e['a'],e['b'])]
                self.assertTrue(walk,i+d['label'])
                self.assertLess(min(math.dist(nodes[e['a']],nodes[e['b']]) for e in walk),70,i+d['label'])

    def test_door_links_stay_inside_their_own_building(self):
        nodes=self.model['nodes'];places={p['id']:p for p in self.model['places']}
        def inside(p,poly):
            odd=False
            for a,b in zip(poly,poly[1:]+poly[:1]):
                if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:odd=not odd
            return odd
        links=[e for e in self.model['edges'] if e.get('kind')=='door']
        self.assertGreaterEqual(len(links),89)
        for e in links:
            place=places[e['door']];hub=self.model['access'][e['door']]
            self.assertIn(hub,(e['a'],e['b']));door=e['a'] if e['b']==hub else e['b']
            self.assertTrue(inside(nodes[hub],place['footprint']),e['name'])
            for b in self.model['structures']:
                if not b['id'].endswith('-tower'):self.assertFalse(inside(nodes[door],b['polygon']),e['name']+' 门外一侧落在 '+b['id'])

    def test_paths_found_in_the_panoramas_are_in_the_network(self):
        names={e['name'] for e in self.model['edges']}
        for item in self.model['survey']['extraPaths']:
            self.assertIn(item['name'],names);self.assertTrue(item['evidence'])
        self.assertGreaterEqual(len(self.model['survey']['extraPaths']),9)

    def test_all_buildings_and_roads_are_rendered(self):
        svg=ET.parse(ROOT/'dist/assets/campus.svg')
        painted={e.attrib['data-building'] for e in svg.iter() if 'data-building' in e.attrib}
        self.assertEqual({b['id'] for b in self.model['structures']}-painted,set())
        named={e.attrib['data-road-name'] for e in svg.iter() if 'data-road-name' in e.attrib}
        self.assertTrue(set(self.expected['named_roads']).issubset(named))

    def test_qu_garden_north_plaza_reaches_riverbank(self):
        nodes=self.model['nodes']
        spans=[{tuple(nodes[e['a']]),tuple(nodes[e['b']])} for e in self.model['edges']]
        self.assertIn({(1741,852),(1811,850)},spans)

    def test_west_service_road_joins_dorm_path(self):
        nodes=self.model['nodes']
        spans=[{tuple(nodes[e['a']]),tuple(nodes[e['b']])} for e in self.model['edges']]
        self.assertIn({(779,598),(779,610)},spans)

    def test_walkways_do_not_cut_through_buildings(self):
        graph=self.model
        def cross(a,b):return a[0]*b[1]-a[1]*b[0]
        def sub(a,b):return (a[0]-b[0],a[1]-b[1])
        def interior(p,poly):
            odd=False
            for a,b in zip(poly,poly[1:]+poly[:1]):
                v=sub(b,a);q=sub(p,a)
                if abs(cross(v,q))<.01 and min(a[0],b[0])-.01<=p[0]<=max(a[0],b[0])+.01 and min(a[1],b[1])-.01<=p[1]<=max(a[1],b[1])+.01:return False
                if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:odd=not odd
            return odd
        for road in graph['edges']:
            if road['role']!='campus' or road.get('kind')=='door':continue   # door links are checked separately
            a,b=(graph['nodes'][road[n]] for n in ['a','b'])
            direction=sub(b,a)
            for building in graph['structures']:
                if building['id'].endswith('-tower'):continue   # towers stand on the building they belong to
                poly=building['polygon'];times=[0.,1.]
                for c,d in zip(poly,poly[1:]+poly[:1]):
                    edge=sub(d,c);delta=sub(c,a);den=cross(direction,edge)
                    if abs(den)<1e-8:continue
                    t=cross(delta,edge)/den;u=cross(delta,direction)/den
                    if 0<t<1 and 0<=u<=1:times.append(t)
                times=sorted(set(times))
                for x,y in zip(times,times[1:]):
                    t=(x+y)/2;p=(a[0]+direction[0]*t,a[1]+direction[1]*t)
                    self.assertFalse(interior(p,poly),f"{road['name']}穿过{building['id']}")


if __name__=='__main__':unittest.main(verbosity=2)
