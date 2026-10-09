# 部署到生产服务器

## 服务器信息
- 地址: `149.88.90.100`
- 用户: `root`
- 应用目录: `/opt/rtmail-helper`
- 服务管理: `systemctl {start|stop|restart|status} rtmail-helper`
- 公网入口: https://outlook.rdmail.cn (Cloudflare Tunnel)

## 自动部署（推荐）

### Linux/macOS
```bash
./deploy.sh
```

### Windows PowerShell
```powershell
.\deploy.ps1
```

**前提条件**:
1. SSH 密钥已配置到服务器（或准备输入 root 密码）
2. 已安装 `rsync`（Windows 需要 Git Bash 或 WSL）

## 手动部署

如果自动脚本不可用，按以下步骤手动部署：

### 1. 本地构建
```bash
npm run build
```

### 2. 备份生产数据库
```bash
ssh root@149.88.90.100 "cd /opt/rtmail-helper && cp -f data.db data.db.backup-$(date +%Y%m%d-%H%M%S)"
```

### 3. 同步文件到服务器
使用 rsync（推荐）:
```bash
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'data.db*' \
  --exclude '.git' \
  --exclude '*.bak' \
  --exclude '.claude' \
  ./ root@149.88.90.100:/opt/rtmail-helper/
```

或使用 WinSCP/FileZilla 手动上传这些文件：
- `app/` 目录
- `lib/` 目录（排除 `.bak` 文件）
- `public/` 目录
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tsconfig.json`
- `tailwind.config.ts`
- `postcss.config.mjs`

**不要上传**: `node_modules/`, `.next/`, `data.db`, `.git/`, `.claude/`

### 4. 在服务器上重新构建
```bash
ssh root@149.88.90.100 "cd /opt/rtmail-helper && npm install --production && npm run build"
```

### 5. 重启服务
```bash
ssh root@149.88.90.100 "systemctl restart rtmail-helper"
```

### 6. 检查状态
```bash
ssh root@149.88.90.100 "systemctl status rtmail-helper"
```

## 验证部署

1. 访问 https://outlook.rdmail.cn 确认服务可访问
2. 测试导入一个账号，触发 IMAP 操作
3. 观察日志中的连接复用情况：
```bash
ssh root@149.88.90.100 "journalctl -u rtmail-helper -f | grep '\[imap\]'"
```

应该看到 `[imap] reusing pooled connection` 而不是频繁的 `[imap] opening new connection`

## 回滚

如果部署出现问题，从备份恢复：

```bash
# 1. 找到最近的备份
ssh root@149.88.90.100 "ls -lht /opt/rtmail-helper/data.db.backup-* | head -5"

# 2. 恢复备份
ssh root@149.88.90.100 "cd /opt/rtmail-helper && cp data.db.backup-YYYYMMDD-HHMMSS data.db"

# 3. 重启服务
ssh root@149.88.90.100 "systemctl restart rtmail-helper"
```

代码回滚需要重新从 Git 拉取旧版本并重新部署。

## 故障排查

查看实时日志：
```bash
ssh root@149.88.90.100 "journalctl -u rtmail-helper -f"
```

查看最近 100 行日志：
```bash
ssh root@149.88.90.100 "journalctl -u rtmail-helper -n 100 --no-pager"
```

检查端口监听：
```bash
ssh root@149.88.90.100 "ss -tlnp | grep 10030"
```

检查 Cloudflare Tunnel 状态：
```bash
ssh root@149.88.90.100 "systemctl status cloudflared-outlook-next"
```
