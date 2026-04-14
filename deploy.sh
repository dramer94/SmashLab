#!/bin/bash
# SmashLab Deployment Script
# Usage: ./deploy.sh [full|update|restart]

set -e

VPS_USER="root"
VPS_HOST="5.223.72.252"
SSH_KEY="~/.ssh/vps_deploy"
REMOTE_DIR="/var/www/smashlab"
SSH_CMD="ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"

echo "=== SmashLab Deployment ==="

case "${1:-update}" in
  full)
    echo "--- Full deployment ---"
    $SSH_CMD "
      cd $REMOTE_DIR || { git clone git@github.com:dramer94/SmashLab.git $REMOTE_DIR && cd $REMOTE_DIR; }
      git pull origin main
      npm ci
      npx prisma generate
      npx prisma db execute --file prisma/create-tables.sql --schema prisma/schema.prisma || true
      npx tsx prisma/seed.ts
      npm run build
      cp ecosystem.config.js /var/www/smashlab/
      pm2 delete smashlab 2>/dev/null || true
      pm2 start ecosystem.config.js
      pm2 save
      echo 'Full deployment complete!'
    "
    ;;
  update)
    echo "--- Quick update ---"
    $SSH_CMD "
      cd $REMOTE_DIR
      git pull origin main
      npm ci
      npx prisma generate
      npm run build
      pm2 restart smashlab
      echo 'Quick update complete!'
    "
    ;;
  restart)
    echo "--- Restart only ---"
    $SSH_CMD "pm2 restart smashlab"
    ;;
  *)
    echo "Usage: ./deploy.sh [full|update|restart]"
    exit 1
    ;;
esac

echo "=== Deployment done ==="
