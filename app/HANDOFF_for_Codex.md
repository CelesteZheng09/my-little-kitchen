# 我的小厨房（My Little Kitchen）— Codex 接手交付文档

> 本文档供 Codex 阅读后接手「剩余开发 + 部署到手机」。前 3 部分（PRD、代码实现方案、注意点）已由前序工作完成并落地为一套可运行的 PWA；Codex 的目标是在此基础上完善并部署到 iOS / Android 手机。

---

## 0. 项目一句话定位

一个**个人自用**的移动端菜谱/小厨房应用：记录「我会做的菜」、收藏「想做的菜」、根据「冰箱里现有食材」推荐能做什么、收藏视频教程并尽量自动解析出食材与步骤。

**架构基线（已确定，勿改动方向）**：
- 纯前端 PWA（HTML + CSS + 原生 JS，无框架、无构建步骤）
- 离线优先，无后端、无账号、无登录
- 数据全部存本地浏览器 IndexedDB
- 设计语言：白色极简（定稿代号 v6）

---

## 1. 完整 PRD

### 1.1 用户与场景
- 单用户、自用。无多人协作、无云同步需求（首期）。
- 典型场景：①下班想做饭，看看冰箱有啥能配；②刷到一个做菜视频，存下来并自动提取食材步骤；③记录自己已经会做的菜，沉淀成「我的菜谱」；④收藏种草但还没做的菜。

### 1.2 信息架构 / 导航
底部 4 个 Tab：**厨房**（🍳）/ **想做的**（📌）/ **冰箱**（🧊）/ **教程**（📚）。
共 7 个页面（含详情、编辑两个二级页）。

### 1.3 页面逐条需求

**① 厨房首页**
- 顶部标题「我的小厨房。」+ 副标题「已经会做 N 道」（N 实时统计）。
- 分类图标栏：主食 / 肉 / 青菜 / 海鲜 / 汤 / 凉菜沙拉 / 饮料。图标为去底贴纸（无白色边框/色块）；选中态：整体高亮（提亮 + 轻微放大），**不要**黑色高亮圆圈、不要色块背景。图标有原地上下轻浮动效。
- **关键交互（用户明确新增）**：首次进入、未选中任何分类时，**默认展示全部菜品，且随机排序**；点击某分类后切换为该分类筛选；再次点击同一分类可取消回到默认随机态。
- 列表项：菜品封面 + 菜名 + （分类 · 首个标签）。点击进详情。
- 右下角浮动 ＋ 按钮 → 进入「记一道菜」。
- 空态提示引导记录第一道菜。

**② 菜品详情**
- 圆形大图 + 菜名 + 元信息（分类 · 标签 · 会做啦 ✓）。
- 「用了这些食材」chips。
- 「我的做法」分步骤（带序号圆点）。
- 「关联的教程」卡片（若有），点击跳教程。
- 备注（黄色便签样式，若有）。
- 顶部可进入编辑、可返回。

**③ 记菜品 / 编辑**
- 字段：封面图（拍照/上传）、菜名、分类（单选 chips）、食材（可加可删的 tag）、做法步骤（可增减的多步输入）、备注（可选多行）。
- 底部「存进我的小厨房 ✓」；编辑态额外显示「删除」。

**④ 想做的（心愿清单）**
- 卡片：封面 + 菜名 + 来源备注（如「收藏自小红书」）。
- ★ 一键「已做过 → 移入厨房」（生成一条菜品，待补全做法）。
- 末尾「＋ 再添加一道想做的菜」。

**⑤ 冰箱 · 选食材**
- 画布上漂浮的食材贴纸（轻浮动效），点选/取消，选中显示绿色 ✓（约为食材图 1/8 大小的小圆标）。
- ＋ 添加食材（可从已有库选，也可输入新食材入库）。
- 底部「找找能做什么」，显示已选数量。

**⑥ 食材匹配结果**（与冰箱同页，下方展开）
- **匹配算法**：匹配度 = 命中食材数 ÷ 该菜品总食材数，降序排列。
- 只展示至少命中 1 样的菜。
- 最佳一道做「大卡」（封面 + 百分比 + 进度条 + 「食材齐全，现在就能做 ✅」或「还差 X 样」）。
- 其余按匹配度列表展示，<60% 视为低匹配（灰显）。
- 点击任意结果进详情。

**⑦ 教程收藏**
- 顶部链接粘贴框（抖音/小红书等）+「解析」。
- 视频文件上传区（本地全自动解析）。
- 列表卡片：标题 + 来源 + 状态徽标（已解析 auto / 半自动 half / 手动 manual）。
- 点卡片看解析详情（食材 chips + 步骤），可打开原链接、可删除。

### 1.4 教程解析三态（已与用户确认的落地方案）
- **方案 C（完整自动，首期就要做）**：上传**本地视频/音频文件** → 浏览器内 Whisper（transformers.js / WASM）做语音转文字 → 规则抽取食材/步骤。全程浏览器内运行，离线可用（仅首次需联网下载模型）。
- **方案 B（兜底）**：粘贴**分享链接** → 预留解析接口 `PARSE_PROXY`；当未配置代理时自动降级为「手动补全」。
- 纯前端无法直接抓取抖音/小红书视频（CORS + 防爬），故链接全自动需用户自建轻量代理；接口已预留。

### 1.5 分类枚举（固定）
`主食 / 肉 / 青菜 / 海鲜 / 汤 / 凉菜沙拉 / 饮料`

---

## 2. 最终代码实现方案（已落地，可运行）

### 2.1 目录结构
```
app/
├─ index.html        单页外壳：7 个 <section class="view"> + 底部导航占位
├─ manifest.json     PWA 配置（standalone / 竖屏 / 图标）
├─ sw.js             Service Worker（外壳与本地素材离线缓存）
├─ README.md         运行说明
├─ css/app.css       全局样式（白色极简 v6，CSS 变量见下）
├─ js/
│  ├─ db.js          IndexedDB 数据层 + 示例种子数据（全局 window.DB）
│  ├─ match.js       冰箱匹配算法（全局 window.Match）
│  ├─ parser.js      教程解析：本地 Whisper + 链接兜底（全局 window.Parser）
│  └─ app.js         路由 + 7 页渲染 + 全局事件委托（IIFE，自启动）
└─ icons/            16 张本地素材（分类6 + 菜品4 + 食材6）+ app-icon.png
```
打包产物：`my-little-kitchen.zip`（约 2.5MB，含全部本地素材）。

### 2.2 技术选型
- 无框架、无打包：直接 `<script src>` 顺序加载 db → match → parser → app。
- 路由：`location.hash` 哈希路由（`#/home`、`#/dish/<id>`、`#/edit/<id|new>`、`#/wish`、`#/fridge`、`#/tutorial`），`hashchange` 驱动 `route()` 切换 `.view.active`。
- 存储：IndexedDB，库名 `my-kitchen`，版本 1。
- 字体：Inter（正文）、LXGW WenKai 霞鹜文楷（中文软体）、Ma Shan Zheng（手写标签），均走 CDN。
- 语音模型：`@xenova/transformers@2.17.2` + `Xenova/whisper-tiny`，CDN 懒加载，仅在用户上传视频时才下载。

### 2.3 数据模型（IndexedDB object stores，keyPath 均为 `id`）

**dishes（菜品）**
```js
{ id, name, category, cover,         // cover: 'icons/xxx.jpg' 或 base64 dataURL
  tags:[], madeIt:true,
  ingredients:[String], steps:[String], note,
  tutorialId, createdAt }
```
**ingredients（食材库）**
```js
{ id, name, icon }                   // icon 可为空（空则渲染占位 emoji）
```
**tutorials（教程）**
```js
{ id, title, source, state,          // state: 'auto'|'half'|'manual'
  cover, link, ingredients:[], steps:[], createdAt }
```
**wishlist（想做的）**
```js
{ id, name, category, cover, source, createdAt }
```
**meta（元信息）**：`{ key, value }`，用 `key:'seeded'` 标记是否已灌种子。

`DB` 暴露：`all/get/put/del/clear`、`getMeta/setMeta`、`seedIfEmpty()`、`resetAll()`、`uid()`、常量 `CATEGORIES`、`SEED`。首启动 `seedIfEmpty()` 灌入 5 道示例菜、12 个食材、1 条教程、3 个想做的。

### 2.4 关键模块逻辑

**match.js**
- `Match.match(selectedNames[], dishes[])` → `{ best, list }`。
- 每道菜：`hit`=命中数，`total`=总食材数，`pct=round(hit/total*100)`，`missing`=缺的食材数组。
- 过滤 `hit>0`；排序优先级：pct ↓ → hit ↓ → missing 少 ↑。
- `Match.missingLabel(m)`：pct≥100 → 「食材齐全，现在就能做 ✅」否则「还差 X 样」。

**parser.js**
- `Parser.parseVideoFile(file, onStage)`：懒加载 Whisper → `decodeAudio`（WebAudio 解码并重采样到 16k 单声道）→ 转写 → `extractIngredients`+`extractSteps`。模型不可用/解码失败 → 优雅降级返回 `state:'manual'`。
- `Parser.parseLink(link)`：若配置 `PARSE_PROXY` 则请求代理拿结构化结果；否则降级返回 `state:'manual'`（标题取域名，仅存链接）。
- `extractIngredients`：基于内置常见食材词表做包含匹配。
- `extractSteps`：按句末标点切句，过短句过滤，必要时按「然后/接着/再/最后」二次切，取前 12 步。
- 顶部常量 `PARSE_PROXY=''`（留空 = 链接走手动兜底）。

**app.js**
- `state`：`activeCat`（null=默认随机全部）、`homeOrder`（随机顺序缓存）、`fridgeSel`（Set）、编辑中暂存（editingId/editIngs/editSteps/editCover）。
- 渲染函数：`renderHome/renderDish/renderEdit/renderWish/renderFridge/renderTutorial`，集中在 `RENDER` 表由 `route()` 分发。
- 首页默认随机：无 `activeCat` 时用 `shuffle` 生成 `homeOrder` 并缓存；新增/删除菜品后置空以重洗。
- 全局 `click` 事件委托：`data-nav`/`data-back`/`data-act`/`data-cat` 等属性驱动；底部弹窗 `openSheet/closeSheet`。
- `change` 事件：封面图片选择 → `FileReader` 转 base64 存入 `cover`；教程视频选择 → `handleVideoFile`。
- 启动：`seedIfEmpty()` → 默认跳 `#/home` → `route()` → 注册 `sw.js`。

### 2.5 样式系统（css/app.css 关键变量）
```css
--ink:#1a1a1c; --gray:#8a8a8e; --gray2:#b6b6ba; --line:#ececee;
--bg:#fbfbfc; --card:#fff; --chip:#f3f3f5; --green:#34c759;
--soft:0 8px 24px rgba(30,30,40,.06); --soft2:0 4px 14px rgba(30,30,40,.05);
--san:Inter…; --kai:"LXGW WenKai"…; --hand:"Ma Shan Zheng"…;
```
- 应用壳 `#app` 移动优先、桌面居中限宽 480px。
- 贴纸去白底靠 `mix-blend-mode:multiply`（素材本身是纯白底）。
- 浮动动效 `@keyframes floaty` + `nth-of-type` 错峰延时。
- 分类选中：`.ci.on .blob{opacity:1;filter:none;transform:scale(1.12)}`（无圆圈、无色块）。
- 绿色 ✓ 用 `.fe.sel::after{content:"✓"}` 小圆标。

### 2.6 验证情况
- 4 个 JS 文件 `node --check` 全部通过。
- match 算法、parser 抽取逻辑已在 Node 中跑通（番茄+鸡蛋+蒜 → 番茄炒蛋 67% 居首；中文文本正确抽出食材与分步）。
- ⚠️ 受沙箱限制，**UI 交互未做真机/浏览器点击回归**，需 Codex 在真实浏览器/手机上验证。

---

## 3. 额外需要关注的注意点（给 Codex）

### 3.1 必须用 HTTP 打开，不能 file://
Service Worker、ES module 动态 import（Whisper）、部分 fetch 在 `file://` 下被浏览器禁用。本地调试请用静态服务器把根目录指向 `app/`（如 VS Code Live Server）。

### 3.2 部署到手机的推荐路径（首期目标）
作为纯静态 PWA，最简单稳妥：
1. 把 `app/` 部署到任意静态托管（GitHub Pages / Vercel / Netlify / Cloudflare Pages 均可，**纯静态、无需服务端**）。
2. 手机浏览器打开 HTTPS 链接 →「添加到主屏幕」即得到类原生 App、可离线。
3. iOS 注意：PWA 需经 Safari「添加到主屏幕」；IndexedDB 在 iOS 上长期不用可能被系统清理（自用问题不大，但别当唯一存储）。
> 注意：HTTPS 是 Service Worker 生效的硬性前提（localhost 例外）。务必用 HTTPS 托管。

### 3.3 Whisper（方案 C）的现实约束
- `whisper-tiny` 模型首次下载约几十 MB，需联网一次，之后浏览器缓存可离线。
- iOS Safari 的 WASM / WebAudio 解码大文件可能吃力；建议 Codex 在真机测试，必要时：限制时长、给明确进度与失败兜底（已有降级到 manual 的分支）。
- 视频文件的音轨需能被 `decodeAudioData` 解码；部分容器/编码（如某些 mp4 音轨）在不同浏览器支持度不同，失败已兜底为手动。
- 若想提升中文识别质量，可考虑换更大模型（whisper-base/small），但下载体积与耗时上升，需权衡。

### 3.4 链接全自动解析需要自建代理
- 纯前端因 CORS + 防爬**无法**直接抓取抖音/小红书视频；`parser.js` 顶部 `PARSE_PROXY` 留空即自动降级手动。
- 若用户要打通链接自动解析：需部署一个轻量代理 / Serverless，输入分享链接、输出 `{title,cover,ingredients,steps}` JSON；把地址填入 `PARSE_PROXY` 即可启用。
- ⚠️ 本项目硬约束：**不要在本地沙箱内起任何监听端口的服务**；代理由用户自行在自己的环境部署。

### 3.5 数据安全 / 隐私
- 全部数据仅存本地浏览器，无上传、无埋点。保持这一点，不要引入后端账号体系（除非用户明确要求云同步）。
- 不要把任何内部接口 / LLM Gateway 调用写进前端代码。

### 3.6 已知待完善（建议 Codex 优先处理）
1. **真机/浏览器端到端回归**：逐页点一遍，重点是 IndexedDB 读写、首页随机默认态、冰箱匹配、教程上传解析。
2. **PWA 图标**：当前 `icons/app-icon.png` 是占位生成图，建议替换为正式图标，并补齐多尺寸（180/192/512 等）与 iOS `apple-touch-icon`。
3. **冰箱画布布局**：当前用规则网格散布（`layoutFloat`），如需更「自由漂浮」的视觉可增强随机定位与碰撞避免。
4. **食材 ↔ 菜品的食材命名一致性**：匹配靠名称精确相等，建议加入同义词归一（如「西红柿/番茄」），`parser.extractIngredients` 词表与匹配可共用一份归一逻辑。
5. **离线缓存版本管理**：`sw.js` 缓存名为 `my-kitchen-v1`，更新静态资源时记得升版本号以触发更新。
6. **导入/导出**：自用场景建议加一个本地 JSON 导出/导入（换机/备份），目前只有「重置示例」。

### 3.7 严禁改动的产品决策（已与用户确认）
- 首页未选分类时 = 全部 + 随机排序。
- 教程首期就要做完整方案 C（本地视频全自动），方案 B 仅兜底。
- 一次性交付全部 7 页。
- 视觉沿用 v6 白色极简：分类图标无色块/无圆圈、整体高亮 + 浮动；贴纸去白底。

---

## 4. 交付物清单
- 源码：`app/`（结构见 §2.1），打包 `my-little-kitchen.zip`。
- 本文件：Codex 接手交付文档。
- 运行：见 §3.1 / §3.2。
