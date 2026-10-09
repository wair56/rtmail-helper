# 手动部署步骤（复制粘贴即可）

本地构建已完成 ✓

## 在你的终端依次运行以下命令（会提示输入密码）：

### 1. 打包文件
```bash
tar czf deploy-package.tar.gz lib/mail.ts lib/mail.test.ts THROTTLE_FIX.md
```

### 2. 上传到服务器
```bash
scp deploy-package.tar.gz root@149.88.90.100:/opt/rtmail-helper/
```
输入密码

### 3. SSH 到服务器执行部署
```bash
ssh root@149.88.90.100
```
输入密码后，在服务器上执行：

```bash
cd /opt/rtmail-helper

# 备份数据库
cp -f data.db data.db.backup-$(date +%Y%m%d-%H%M%S)

# 解压新代码
tar xzf deploy-package.tar.gz

# 重新构建
npm run build

# 重启服务
systemctl restart rtmail-helper

# 检查状态
systemctl status rtmail-helper

# 清理
rm deploy-package.tar.gz

# 查看实时日志（可选，Ctrl+C 退出）
journalctl -u rtmail-helper -f | grep "[imap]"
```

看到日志中有 `[imap] reusing pooled connection` 就说明优化生效了！

## 或者：使用 WinSCP/FileZilla 图形界面

1. 连接到 149.88.90.100:22，用户 root
2. 进入 `/opt/rtmail-helper/lib/` 目录
3. 上传本地的 `lib/mail.ts` 和 `lib/mail.test.ts`（覆盖）
4. SSH 到服务器，运行：
```bash
cd /opt/rtmail-helper
cp -f data.db data.db.backup-$(date +%Y%m%d-%H%M%S)
npm run build
systemctl restart rtmail-helper
systemctl status rtmail-helper
```

完成！
