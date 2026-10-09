# rtmail-helper 交互式部署脚本
# 需要手动输入服务器密码
$ErrorActionPreference = 'Stop'

$SERVER = "root@149.88.90.100"
$REMOTE_DIR = "/opt/rtmail-helper"

Write-Host "==> 本地构建已完成" -ForegroundColor Green
Write-Host ""

Write-Host "==> 步骤 1/5: 备份远程数据库" -ForegroundColor Cyan
Write-Host "执行命令: ssh $SERVER 'cd $REMOTE_DIR && cp -f data.db data.db.backup-`$(date +%Y%m%d-%H%M%S)'"
ssh $SERVER "cd $REMOTE_DIR && cp -f data.db data.db.backup-`$(date +%Y%m%d-%H%M%S) && echo 'Backup created'"

Write-Host "`n==> 步骤 2/5: 上传核心代码文件" -ForegroundColor Cyan
Write-Host "上传 lib/mail.ts (限流修复的核心文件)..."
scp lib/mail.ts "${SERVER}:${REMOTE_DIR}/lib/"

Write-Host "上传 lib/mail.test.ts..."
scp lib/mail.test.ts "${SERVER}:${REMOTE_DIR}/lib/"

Write-Host "`n==> 步骤 3/5: 在服务器上重新构建" -ForegroundColor Cyan
ssh $SERVER "cd $REMOTE_DIR && npm run build"

Write-Host "`n==> 步骤 4/5: 重启服务" -ForegroundColor Cyan
ssh $SERVER "systemctl restart rtmail-helper"

Write-Host "`n==> 步骤 5/5: 检查服务状态" -ForegroundColor Cyan
ssh $SERVER "systemctl status rtmail-helper --no-pager | head -20"

Write-Host "`n✅ 部署完成！" -ForegroundColor Green
Write-Host "服务地址: https://outlook.rdmail.cn"
Write-Host ""
Write-Host "查看日志: ssh $SERVER 'journalctl -u rtmail-helper -f | grep `"[imap]`"'"
Write-Host "应该看到 'reusing pooled connection' 而不是频繁的 'opening new connection'"
