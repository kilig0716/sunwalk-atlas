# 向阳而行 · 西译校园导览

西安翻译学院校园步行导览（3D / 平面地图、全景漫游、择荫步行路线）。晴行有方队 · 讯飞杯 AI 创意设计挑战赛参赛作品。

- 在线访问：https://kilig0716.github.io/sunwalk-atlas/
- 网站文件都在 `dist/`，推送到 `main` 后由 `.github/workflows/pages.yml` 自动发布。
- 网页版没有后台，天气用 `dist/assets/weather-snapshot.js` 里的快照；同一个工作流每小时发布一次，发布前用 `weather_feed.py` 从中国天气网取最新预报更新快照（只进网页，不提交回仓库）。
- 本机运行：双击 `启动校园导览.cmd`（或 `python serve.py`），可以直接读到实时天气。
- 详细说明见 [项目说明.md](项目说明.md) 和 [先读我.txt](先读我.txt)。
