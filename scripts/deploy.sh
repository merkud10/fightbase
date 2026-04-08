#!/bin/bash
# =============================================================
# FightBase Deploy Script
# Run on server: bash /opt/fightbase/scripts/deploy.sh
# =============================================================
set -euo pipefail

APP_DIR="/opt/fightbase"
APP_USER="fightbase"

echo "=== Stopping services ==="
systemctl stop fightbase
systemctl stop fightbase-jobs 2>/dev/null || true

echo "=== Pulling latest code ==="
cd ${APP_DIR}
sudo -u ${APP_USER} git pull

echo "=== Prisma Client (Postgres schema) ==="
# Обязательно после git pull: иначе типы ArticleCreateInput устаревают и next build падает
# (например, после добавления полей в schema.postgres.prisma).
sudo -u ${APP_USER} npm run prisma:generate:pg

echo "=== Database migrations (Postgres) ==="
# Иначе next build падает на prerender (P2022: column does not exist).
sudo -u ${APP_USER} npm run db:migrate:deploy:pg

echo "=== Building ==="
sudo -u ${APP_USER} npm run build

echo "=== Copying static assets ==="
cp -r ${APP_DIR}/.next/static ${APP_DIR}/.next/standalone/.next/static
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}/.next

echo "=== Linking scripts and node_modules ==="
rm -rf ${APP_DIR}/.next/standalone/scripts
rm -rf ${APP_DIR}/.next/standalone/node_modules
ln -s ${APP_DIR}/scripts ${APP_DIR}/.next/standalone/scripts
ln -s ${APP_DIR}/node_modules ${APP_DIR}/.next/standalone/node_modules

echo "=== Starting services ==="
systemctl start fightbase
systemctl start fightbase-jobs

echo "=== Waiting for app to start ==="
sleep 3

echo "=== Health check ==="
curl -s http://localhost:3000/api/health | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Status:', 'OK' if d['ok'] else 'FAIL')
print('Articles:', d['checks']['content']['articles'])
print('Fighters:', d['checks']['content']['fighters'])
print('Events:', d['checks']['content']['events'])
" 2>/dev/null || echo "Health check failed — app may still be starting"

echo ""
echo "Deploy complete!"
