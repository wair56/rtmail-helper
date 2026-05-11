# RT Mail 垃圾箱与邮件详情设计

## 目标

- 支持收件箱与垃圾箱切换
- 支持点击列表打开邮件详情
- 支持 HTML 正文展示，纯文本作为回退
- 尽量少改动现有登录与后台结构

## 方案

采用最小改动方案，继续复用现有邮件接口：

- `GET /api/mail?folder=inbox|trash` 返回最近 5 封列表
- `GET /api/mail?id=<messageId>&folder=inbox|trash` 返回单封详情

兼容保留现有 `GET /api/mail/body` 路由，但底层复用同一套详情逻辑。

## Provider 处理

### Gmail

- 列表：
  - 收件箱使用 `labelIds=INBOX`
  - 垃圾箱使用 `labelIds=TRASH&includeSpamTrash=true`
- 详情：
  - 使用 `messages.get?format=raw`
  - 通过 `mailparser` 提取 HTML / 纯文本正文

### Microsoft / Outlook

- 通过 IMAP + XOAUTH2 保持现有接入方式
- 收件箱优先匹配 `INBOX`
- 垃圾箱优先匹配 `\Trash` special-use，再回退 `Deleted Items` / `Trash` / `Deleted Messages`
- 详情通过 `fetchOne(uid, { source: true }, { uid: true })` 获取原始邮件，再用 `mailparser` 提取正文

## 前端

- `dashboard` 增加“收件箱 / 垃圾箱”切换
- 点击邮件后在当前页面弹层展示详情
- 有 HTML 时用 iframe + `srcDoc` 展示
- 无 HTML 时回退纯文本

## 安全

- 服务端对 HTML 做基础清洗：
  - 去除 `script`
  - 去除事件属性
  - 过滤 `javascript:` URL
- iframe 注入严格 CSP，禁用脚本、外链请求与表单提交
