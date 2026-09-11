# DateDrop 本地设计预览

这不是原站登录后内部页面的完整副本。原站服务端将未登录的 `/dashboard` 请求重定向到 `/?return=%2Fdashboard`；Stanford 子域也有相同行为。未取得内部页面代码，无法确认其真实布局。

## 使用

```sh
python3 /Users/yoryon/LiLink/LiLink/datedrop/server.py
```

打开 http://127.0.0.1:4174/ 。Ctrl+C 停止服务。

- Overview：基于公开视觉风格创建的模拟布局，可切换参与/暂停。
- Your match：根据公开营销示例组件重建 Alex 匹配卡片。外层排版、联系弹窗为模拟。
- Profile：模拟资料表单，保存在当前浏览器会话，不向服务器发送。

## 2026-09-10 来源证据

- https://trydatedrop.com/ 的 HTML 与实际引用资源保存在 `source/`。
- `source/_next/static/chunks/7034-4406d20f5e26fa0e.js`，模块 67763：公开示例 `Your match: Alex`、99.3% compatibility、三个匹配理由、rounded-3xl、p-8、组织主题 100/300 色阶。
- `source/_next/static/chunks/1694-2221118c00e9d75c.js`：Stanford 配置及 primary 100 #faeae9、300 #edb4b5。
- `source/_next/static/css/6edec1cf3c60ea41.css`：Funnel Sans、Alice 字体声明；对应字体已本地保存。
- `/background/stanford-sky.webp` 与 `/logoIcons/main.webp`：原站公开图片。

源码样本仅供研究，不在预览中执行原站应用脚本。预览为独立 HTML/CSS/JS，页面限制 connect-src 'none'，没有登录、真实用户信息或生产接口。标记为模拟的页面不能作为原站内部设计的证据。

未 commit、push 或部署；服务只监听 127.0.0.1。

## 公开问卷示例

`/questionnaire.html` 提供 2 道源码可确认的题目：生育意愿七级量表、16 选项核心价值观（1–5 项）。来源 chunk 7034 模块 481。营销标题 top 4 与定义 top 5 不一致，本页采用定义的限制。界面为本地重建，非完整正式问卷。题型枚举只证明代码声明，不能据此补造完整题库。
