#!/bin/bash
set -e

SERVER="root@149.88.90.100"
REMOTE_DIR="/opt/rtmail-helper"
LOCAL_DIR="$(pwd)"

echo "==> Building locally..."
npm run build

echo "==> Backing up remote data.db..."
ssh "$SERVER" "cd $REMOTE_DIR && cp -f data.db data.db.backup-\$(date +%Y%m%d-%H%M%S) || true"

echo "==> Syncing files to server (excluding node_modules, .next, data.db)..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'data.db*' \
  --exclude '.git' \
  --exclude '*.bak' \
  --exclude '.claude' \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

echo "==> Installing dependencies on server..."
ssh "$SERVER" "cd $REMOTE_DIR && npm install --production"

echo "==> Building on server..."
ssh "$SERVER" "cd $REMOTE_DIR && npm run build"

echo "==> Restarting rtmail-helper.service..."
ssh "$SERVER" "systemctl restart rtmail-helper"

echo "==> Checking service status..."
ssh "$SERVER" "systemctl status rtmail-helper --no-pager | head -20"

echo ""
echo "✅ Deployment complete!"
echo "Service: https://outlook.rdmail.cn"
echo ""
echo "To check logs: ssh $SERVER 'journalctl -u rtmail-helper -f'"
