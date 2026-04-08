<div align="center">
  <h1>📧 RT Mail Fetcher</h1>
  <h3>基于 Refresh Token 的全景多生态邮件极速抓取引擎</h3>
  <p>The most visually stunning and structurally powerful open-source tool for accessing emails via Refresh Tokens instantly. Fully supports Microsoft and Google ecosystems.</p>
  
  <br />
  
  [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwair56%2Frtmail-helper)
</div>

<br />

## 🌟 核心特性 (Features)

传统邮件抓取常常受限于严苛的鉴权流程、恶劣的反爬审核以及杂乱无章的 XSS 渲染风险，**RT Mail Fetcher** 致力于打造安全、迅捷、无感知的跨维度只读拉取矩阵：

- **双巨头生态支持 (Dual-Ecosystem)**：原生级无缝对接 Microsoft (Outlook/Hotmail/Office365) 和 Google (Gmail/Workspace) 两大体系，根据您指定的 Token 自动重定向。
- **动态无状态抓取 (Stateless & Secure)**：我们坚决不在本地化或远程服务器留存您任何的 Session, Token 或是 Mail Body。一切抓取请求过载自内存，用完即弃，保障极高安全。
- **高阶防护清理 (Advanced Sanitization)**：原生通过 REST Api 对邮件报文 (`metadataHeaders`) 以及主体进行纯净化清洗处理，只为您呈现清爽、绝对没有 XSS 风险的文字摘要和安全的发件人来源。
- **影视级原生交互设计 (Cinematic UI)**：采用原生的 Vanilla CSS，精心调校暗视拟物玻璃特效（Dark Mode Glassmorphism），伴随动态发散光效带来沉浸式的邮件阅读体验。

---

## 🛠️ 快速部署 (Deploy)

本项目基于 Next.js 极速构建。您可以直接通过上方按钮无配置部署至 Vercel，或进行本地化编译部署：

```bash
# 1. 克隆代码仓库
git clone https://github.com/wair56/rtmail-helper.git
cd rtmail-helper

# 2. 安装项目依赖
npm install

# 3. 启动本地沙盒
npm run dev
```

直接在浏览器中打开 `http://localhost:3000` 即可感受到前所未有的丝滑刷新。

---

## ☕ Support / 支持

If you find this tool useful, consider buying me a coffee!
如果觉得本项目好用，请我喝杯咖啡吧！让创造力与代码的温度持续燃烧！🔥

<p align="center">
  <img src="https://raw.githubusercontent.com/wair56/dataferry/master/BMC.png" width="260" alt="Buy Me A Coffee QR Code" style="margin-right: 20px" />
  <img src="https://raw.githubusercontent.com/wair56/dataferry/master/wechat.png" width="260" alt="WeChat Pay QR Code" />
</p>

<p align="center">
  <a target="_blank" href="https://www.buymeacoffee.com/399is">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=399is&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me A Coffee" />
  </a>
</p>

---

### 📬 Contact & Feedback / 联系与建议

Got an idea or found a bug? Feel free to reach out:
如果有任何技术交流或反馈，欢迎联系作者：**[contact@399.is](mailto:contact@399.is)**。

---

*Powered by Next.js, React, and absolute passion for aesthetics and flawless engineering.*
