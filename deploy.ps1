# rtmail-helper 部署脚本（Windows/PowerShell）
$ErrorActionPreference = 'Stop'

$SERVER = "root@149.88.90.100"
$REMOTE_DIR = "/opt/rtmail-helper"
$LOCAL_DIR = (Get-Location).Path

Write-Host "==> Building locally..." -ForegroundColor Cyan
npm run build

Write-Host "`n==> Backing up remote data.db..." -ForegroundColor Cyan
ssh $SERVER "cd $REMOTE_DIR && cp -f data.db data.db.backup-`$(date +%Y%m%d-%H%M%S) || true"

Write-Host "`n==> Syncing files to server (excluding node_modules, .next, data.db)..." -ForegroundColor Cyan
# rsync 在 Windows 上需要 WSL 或 Git Bash
# 如果没有 rsync，用下面的 scp 方案（注释掉 rsync 这行）
rsync -avz --delete `
  --exclude 'node_modules' `
  --exclude '.next' `
  --exclude 'data.db*' `
  --exclude '.git' `
  --exclude '*.bak' `
  --exclude '.claude' `
  "$LOCAL_DIR/" "${SERVER}:${REMOTE_DIR}/"

Write-Host "`n==> Installing dependencies on server..." -ForegroundColor Cyan
ssh $SERVER "cd $REMOTE_DIR && npm install --production"

Write-Host "`n==> Building on server..." -ForegroundColor Cyan
ssh $SERVER "cd $REMOTE_DIR && npm run build"

Write-Host "`n==> Restarting rtmail-helper.service..." -ForegroundColor Cyan
ssh $SERVER "systemctl restart rtmail-helper"

Write-Host "`n==> Checking service status..." -ForegroundColor Cyan
ssh $SERVER "systemctl status rtmail-helper --no-pager | head -20"

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "Service: https://outlook.rdmail.cn"
Write-Host ""
Write-Host "To check logs: ssh $SERVER 'journalctl -u rtmail-helper -f'"
