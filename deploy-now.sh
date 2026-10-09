#!/bin/bash
# rtmail-helper 快速部署脚本（只上传修改的核心文件）

SERVER="root@149.88.90.100"
REMOTE_DIR="/opt/rtmail-helper"

echo "本地构建已完成 ✓"
echo ""

echo "==> 步骤 1/5: 备份远程数据库"
ssh $SERVER "cd $REMOTE_DIR && cp -f data.db data.db.backup-\$(date +%Y%m%d-%H%M%S) && echo 'Backup created'"

echo ""
echo "==> 步骤 2/5: 上传核心代码文件"
echo "上传 lib/mail.ts (限流修复的核心文件)..."
scp lib/mail.ts $SERVER:$REMOTE_DIR/lib/

echo "上传 lib/mail.test.ts..."
scp lib/mail.test.ts $SERVER:$REMOTE_DIR/lib/

echo ""
echo "==> 步骤 3/5: 在服务器上重新构建"
ssh $SERVER "cd $REMOTE_DIR && npm run build"

echo ""
echo "==> 步骤 4/5: 重启服务"
ssh $SERVER "systemctl restart rtmail-helper"

echo ""
echo "==> 步骤 5/5: 检查服务状态"
ssh $SERVER "systemctl status rtmail-helper --no-pager | head -20"

echo ""
echo "✅ 部署完成！"
echo "服务地址: https://outlook.rdmail.cn"
echo ""
echo "查看日志命令:"
echo "  ssh $SERVER 'journalctl -u rtmail-helper -f | grep \"[imap]\"'"
echo ""
echo "应该看到 'reusing pooled connection' 而不是频繁的 'opening new connection'"
