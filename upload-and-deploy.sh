#!/bin/bash
# 单次 SSH 会话完成部署
SERVER="root@149.88.90.100"
REMOTE_DIR="/opt/rtmail-helper"

echo "准备部署文件..."
# 打包需要上传的文件
tar czf deploy-package.tar.gz \
  lib/mail.ts \
  lib/mail.test.ts \
  THROTTLE_FIX.md

echo "上传并部署（需要输入一次密码）..."
cat deploy-package.tar.gz | ssh $SERVER "
set -e
cd $REMOTE_DIR
echo '==> 备份数据库'
cp -f data.db data.db.backup-\$(date +%Y%m%d-%H%M%S)

echo '==> 解压新代码'
tar xzf - 

echo '==> 重新构建'
npm run build 2>&1 | tail -10

echo '==> 重启服务'
systemctl restart rtmail-helper

echo '==> 检查服务状态'
systemctl status rtmail-helper --no-pager | head -15

echo ''
echo '✅ 部署完成！'
echo '服务: https://outlook.rdmail.cn'
"

rm -f deploy-package.tar.gz
echo ""
echo "部署完成！查看实时日志:"
echo "  ssh $SERVER 'journalctl -u rtmail-helper -f | grep \"[imap]\"'"
