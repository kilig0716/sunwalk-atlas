"""Write docs/2026-11-09-shade-720yun.md from the built atlas.   python -B tools/make_shade_report.py"""
from pathlib import Path
import json, statistics as st
root = Path(__file__).resolve().parents[1]
raw = (root / 'dist/assets/atlas-data.js').read_text(encoding='utf8')
A = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
M = A['shadeModel']
E = [e for e in A['edges'] if e['role'] == 'campus' and e['kind'] != 'access']
H8, H12, H16 = (M['hours'].index(h) for h in (8, 12, 16))
grades = {}
for e in E: grades[e['shadeSrc']['grade']] = grades.get(e['shadeSrc']['grade'], 0) + 1
by = {}
for e in E: by.setdefault(e['name'], []).append(e)
rows = []
for name, v in by.items():
    m = sum(x['meters'] for x in v)
    if m < 60: continue
    w = lambda i: sum(x['shade'][i] * x['meters'] for x in v) / m
    t = lambda i: sum(x['shadeSrc']['tree'][i] * x['meters'] for x in v) / m
    rows.append((name, m, w(H8), w(H12), w(H16), t(H8), t(H12), [w(i) for i in range(len(M['hours']))]))
rows.sort(key=lambda r: -(r[2] + r[3] + r[4]))
L = ['# 林荫依据：720 云夏季实景测量（2026-11-09）\n',
     '## 为什么不用校图画的树\n',
     f"校方平面示意图把树画成装饰符号。我们把示意图上每个测点周围的树冠像素比例与实景测得的林荫做线性拟合，斜率只有 {M['fitLow'][1]}（低角度）和 {M['fitHigh'][1]}（正午），几乎不相关。"
     '这说明示意图的树木位置不能代表真实林荫，所以林荫改以实景测量为准，示意图只用于道路和楼栋布局。\n',
     '## 数据来源\n',
     '- 720 云作品《西安翻译学院全景校园》（作者「全景漫游」，https://www.720yun.com/vr/a2bjzOkfrk4），140 个场景，拍摄于夏季满叶期。',
     f"- 选用其中 {M['scenes']} 个室外地面场景；剔除航拍、室内和机位过高的场景（{'、'.join(f'{k}:{v}' for k, v in A['panoramaExcluded'].items())}）。",
     '- 在浏览器中正常打开原作播放器，读取其自带的立方体预览图（每面 256 像素），在页面内完成像素分类，只保留统计结果；未下载或再分发原始影像。',
     '- 720 云上另有《全景西译》《西安翻译学院》（酷鸟工作室）等作品，网页全景页提供原作链接，未使用其影像数据。\n',
     '## 测量方法\n',
     '1. 对上半球按仰角 2.5°、方位 3° 采样，按 cos(仰角) 加权，逐点分为天空（蓝天、白云）、树冠（绿色与暗部枝叶）、建筑及其他。',
     '2. 低角度带 18°—50°、正午带 55°—90°。太阳高度 45° 以下用低角度带，58° 以上用正午带，之间线性过渡；低于 18° 的清晨和傍晚沿用低角度带的数值（这是假设，实际遮挡可能更多）。',
     '3. 行人贴树行走修正：正午林荫 = 正午树冠 + 0.5 × 低角度树冠 ×（1 − 正午树冠）。',
     '4. 测点按场景名与 720 云原作场景顺序定位到校图道路上；“公寓区”“美食街区”等名称较泛的点按画面内容推定，已在数据中标出所在道路。',
     '5. 每段路取其中点，按反距离权重（同名道路的测点权重加大）插值测点残差；离最近测点越远，插值越向全校均值回落。',
     f"6. 楼荫：楼栋轮廓来自校图，楼高按类别估计（{'、'.join(f'{k}{v}米' for k, v in M['heights'].items())}，图书馆、科技楼等单独设定），太阳位置取 {M['date']}（开学季）北京时间 "
     + '、'.join(f"{s['hour']}:00 高度 {s['elevation']}° 方位 {s['azimuth']}°" for s in M['sun']) + '，沿太阳方向投射判定每个采样点是否落在楼影中。',
     '7. 合成：遮阴率 = 1 −（1 − 林荫）×（1 − 楼荫）。天渡桥面不计树荫。',
     f"8. 全天：在 {'、'.join(str(h) + ':00' for h in M['hours'])} 共 {len(M['hours'])} 个时刻计算，时刻之间线性插值；日出（约 {int(M['sunrise'])}:{round(M['sunrise'] % 1 * 60):02d}）前和日落（约 {int(M['sunset'])}:{round(M['sunset'] % 1 * 60):02d}）后没有日照，路线只比较距离。\n",
     '## 精度与边界\n',
     f"- 留一交叉检验（每次去掉一个测点，用其余测点预测它）：低角度林荫平均绝对误差约 {round(M['looMAE']*100)} 个百分点。",
     f"- 全部 {len(E)} 段校内道路中，距离实景测点 70 像素（约 43 米）以内的 {grades.get('实景测点', 0)} 段，插值 {grades.get('实景插值', 0)} 段，只能按全校均值估算的 {grades.get('校图树冠估算', 0)} 段。",
     '- 预览图分辨率有限，浅灰色建筑在强光下可能被误判为天空；方位没有统一校准，因此林荫按方位平均处理，楼荫才区分上午、下午方向。',
     '- 全景拍摄于夏季，秋冬落叶后林荫会明显减少；结果是“夏季晴天情景”，不是实时遮阴。\n',
     '## 各道路遮阴（按长度加权，长度 ≥ 60 米）\n',
     '| 道路 | 图示长度 | 08:00 | 12:00 | 16:00 | 其中林荫（低/正午） |', '| --- | --- | --- | --- | --- | --- |']
for name, m, a, b, c, t0, t1, allh in rows:
    L.append(f'| {name} | {m} 米 | {round(a*100)}% | {round(b*100)}% | {round(c*100)}% | {round(t0*100)}% / {round(t1*100)}% |')
L.append('\n## 测点明细\n')
L.append('| 720 云场景 | 编号 | 所在道路 | 天空（正午/低） | 树冠（正午/低） | 建筑（正午/低） |')
L.append('| --- | --- | --- | --- | --- | --- |')
for s in A['panoramas']:
    f = lambda k: f"{round(s[k][0]*100)}% / {round(s[k][1]*100)}%"
    L.append(f"| {s['name']} | {s['id']} | {s['road']} | {f('sky')} | {f('veg')} | {f('structure')} |")
(root / 'docs/2026-11-09-shade-720yun.md').write_text('\n'.join(L) + '\n', encoding='utf8')
print('ok', len(rows), 'roads')
