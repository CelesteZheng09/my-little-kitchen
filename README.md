# 我的小厨房

个人自用的纯前端 PWA：记录会做的菜、收藏想做的菜、根据冰箱食材推荐菜谱，并保存视频/链接教程。应用无后端、无账号，数据全部保存在浏览器 IndexedDB。

## 本地结构

```text
app/
  index.html
  css/app.css
  js/db.js
  js/match.js
  js/parser.js
  js/app.js
  manifest.json
  sw.js
```

## GitHub Pages 发布

仓库推送到 `main` 后，`.github/workflows/pages.yml` 会把 `app/` 作为 GitHub Pages 站点根目录发布。

发布后用 iOS Safari 打开 Pages HTTPS 地址，选择“添加到主屏幕”即可作为 PWA 使用。首次使用本地视频解析时，浏览器需要联网下载 Whisper 模型。

链接解析分两层：

- 未配置代理时：应用会从复制来的整段分享文案里自动抽取标题、食材和步骤；如果只粘贴短链接且没有文案，会进入手动补全。
- 配置代理后：应用会调用 `app/config.js` 里的 `PARSE_PROXY`，通过 `worker/parse-link-worker.js` 抓取网页内容并自动解析。

## 验证

```bash
node --check app/js/db.js
node --check app/js/match.js
node --check app/js/parser.js
node --check app/js/app.js
```
