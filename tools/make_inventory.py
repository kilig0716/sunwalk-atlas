"""Regenerate 校园地图逐项核对清单.md from dist/assets/atlas-data.js.   python -B tools/make_inventory.py"""
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
raw = (root / 'dist/assets/atlas-data.js').read_text(encoding='utf8')
A = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
inv = json.loads((root / 'docs/map-inventory-source.json').read_text(encoding='utf8'))
added = {p['id'] for p in inv['missing_places']}
NEW_THIS_ROUND = {'e-plaza-hua', 'e-plaza-ming', 'w-gate-guard'}
RENAMED = {'e-dining-jian': '原误作“诒伦餐厅”', 'w-pingpong': '原误作“停车场（西13北侧）”', 'conf': '补“钟塔”名称', 'west-dining': '补“诒品坊”名称'}
M = A['shadeModel']
L = []
L.append('# 校园地图逐项核对清单\n')
L.append(f"2026-11-09 复核版 · {len(A['places'])} 处目的地 · {len(A['nodes'])} 个节点 · {len(A['edges'])} 段路。"
         '建筑与道路依据团队提供的学校平面图逐块（25 像素网格、2—6 倍放大）核对；原图字迹较小处以 720 云实景场景名校对；'
         '宾馆、天渡、星期与校门规则按使用者现场说明。\n')
L.append('## 通行规则\n')
L.append('- 周一、周二、周四：不能出校门去西区，东西区往返只走校内西译天渡。')
L.append('- 周三、周五、周六、周日：可以走校外（太乙宫正街），但地面进入西区只能经过西区正门。')
L.append('- 西译天渡只连接两侧校内，校外街道不能上桥；天渡与街道的平面交叉不是连接点。')
L.append('- 西译宾馆旁的校内道路在宾馆右侧（东侧），通到天渡东端；宾馆左侧临街。')
L.append('- 距离、楼旁接近点与遮阴属于估算；临时门禁以现场为准。\n')
L.append('## 本轮校正\n')
L.append('- 东岸河边路名称改为 **诒萌路**（原图字形为“艹+日月”，720 云场景《诒萌路》印证；上一版误作“诒荫路”）。')
L.append('- 诒俭餐厅（上一版误作“诒伦餐厅”）、乒乓球场（上一版误作停车场）名称更正。')
L.append('- 新增：诒华广场、诒鸣广场、西区正门门卫室；会议中心补“钟塔”，西区餐饮中心补“诒品坊”。')
L.append('- 新增道路：二号楼东侧通道、一号楼东侧通道（西7/西8 与 4 号楼、留学生公寓之间）、西区公寓西侧支路北段、西区宿舍间小径、西区南侧边界路、东13—14/东14—15/东17—18 公寓间通道、网球场北侧步道、东南片区外围步道。')
L.append('- 诒萌路南段、诒安桥按原图灰色河岸路重描（上一版画进了河道）；太乙宫正街按原图南段东弯描绘；体育馆外围步道贴合原图。\n')
for zone in ['东区', '西区', '跨区']:
    L.append(f'## {zone}\n')
    L.append('| 名称 | 类别 | 状态 | 接近步道 |')
    L.append('| --- | --- | --- | --- |')
    for p in A['places']:
        if p['zone'] != zone: continue
        state = '本轮新增' if p['id'] in NEW_THIS_ROUND else RENAMED.get(p['id']) or ('补录' if p['id'] in added else '原有/校正')
        L.append(f"| {p['name']} | {p['category']} | {state} | {p['approach']} |")
    L.append('')
L.append('## 道路与连接\n')
L.append('名称为原图道路专名或描述性路径名；描述性名称不当作学校正式路名。\n')
seen = []
for r in A['sourceRoads']:
    if r['name'] not in seen: seen.append(r['name'])
L.append('、'.join(seen) + '\n')
L.append('## 720 云实景林荫测点\n')
L.append(f"方法：{M['method']}。{M['season']}。低角度为 18°—50° 仰角（对应 08:00、16:00 的太阳），正午为 55°—90°。"
         f"留一检验平均绝对误差 {round(M['looMAE']*100)} 个百分点。详见 docs/2026-11-09-shade-720yun.md。\n")
L.append('| 场景 | 位置（所在道路） | 天空可见·低角度 | 树冠·低角度 | 树冠·正午 | 步行林荫（低/正午） |')
L.append('| --- | --- | --- | --- | --- | --- |')
for s in A['panoramas']:
    L.append(f"| {s['name']} | {s['road']} | {round(s['sky'][1]*100)}% | {round(s['veg'][1]*100)}% | {round(s['veg'][0]*100)}% | {round(s['tree'][0]*100)}% / {round(s['tree'][1]*100)}% |")
(root / '校园地图逐项核对清单.md').write_text('\n'.join(L) + '\n', encoding='utf8')
print('written', len(A['places']), 'places')
