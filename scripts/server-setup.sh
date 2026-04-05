#!/bin/bash
# =============================================================
# FightBase Server Setup — Ubuntu 24.04 (Timeweb Cloud VPS)
# Run as root: bash server-setup.sh
# =============================================================
set -euo pipefail

DOMAIN="fightbase.ru"
APP_USER="fightbase"
APP_DIR="/opt/fightbase"
REPO_URL="https://github.com/merkud10/fightbase.git"
NODE_VERSION="20"

echo "=== 1. System update ==="
apt update && apt upgrade -y

echo "=== 2. Install essentials ==="
apt install -y curl git nginx certbot python3-certbot-nginx ufw

echo "=== 3. Install Node.js ${NODE_VERSION} ==="
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs
echo "Node $(node -v) / npm $(npm -v)"

echo "=== 4. Install PostgreSQL ==="
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo "=== 5. Create database and user ==="
DB_PASS=$(openssl rand -hex 16)
sudo -u postgres psql <<SQL
CREATE USER fightbase WITH PASSWORD '${DB_PASS}';
CREATE DATABASE fightbase OWNER fightbase;
GRANT ALL PRIVILEGES ON DATABASE fightbase TO fightbase;
SQL
echo "DB password: ${DB_PASS}"
echo "${DB_PASS}" > /root/.fightbase_db_pass
chmod 600 /root/.fightbase_db_pass

echo "=== 6. Create app user ==="
id -u ${APP_USER} &>/dev/null || useradd -r -m -s /bin/bash ${APP_USER}

echo "=== 7. Clone repository ==="
if [ -d "${APP_DIR}" ]; then
  echo "Directory exists, pulling latest..."
  cd ${APP_DIR}
  sudo -u ${APP_USER} git pull
else
  git clone ${REPO_URL} ${APP_DIR}
  chown -R ${APP_USER}:${APP_USER} ${APP_DIR}
fi

echo "=== 8. Create .env ==="
cd ${APP_DIR}

if [ ! -f .env ]; then
  SESSION_SECRET=$(openssl rand -hex 32)
  INTERNAL_SECRET=$(openssl rand -hex 24)
  CRON_SECRET=$(openssl rand -hex 24)

  cat > .env <<ENV
# === Core ===
DATABASE_URL="postgresql://fightbase:${DB_PASS}@127.0.0.1:5432/fightbase?schema=public"
DEPLOYMENT_ENV="production"
NODE_ENV="production"
NEXT_PUBLIC_SITE_URL="https://${DOMAIN}"

# === Admin ===
AUTH_SESSION_SECRET="${SESSION_SECRET}"
ADMIN_EMAIL="admin@${DOMAIN}"
ADMIN_PASSWORD=""
# Set ADMIN_PASSWORD above, then restart the app

# === Internal API / Cron ===
INTERNAL_API_SECRET="${INTERNAL_SECRET}"
INGEST_CRON_SECRET="${CRON_SECRET}"
INGEST_BASE_URL="http://127.0.0.1:3000"

# === AI (fill in your keys) ===
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"

# === Social (fill in) ===
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHANNEL_ID=""
TELEGRAM_ALERTS_CHAT_ID=""
VK_GROUP_TOKEN=""
VK_GROUP_ID=""
VK_API_VERSION="5.199"
NEXT_PUBLIC_TELEGRAM_URL=""
NEXT_PUBLIC_VK_URL=""

# === Ingestion ===
INGEST_CRON_JOB="ai-discovery"
AI_DISCOVERY_LOOKBACK_HOURS="8"
AI_DISCOVERY_ITEM_LIMIT="8"
AI_DISCOVERY_STATUS="published"
AI_DISCOVERY_LANGUAGE_SCOPE="ru,en"
BACKGROUND_JOB_BATCH_SIZE="5"
BACKGROUND_JOB_POLL_INTERVAL_MS="30000"

# === Ads / Verification (optional) ===
NEXT_PUBLIC_ADS_ENABLED="0"
ENV

  chown ${APP_USER}:${APP_USER} .env
  chmod 600 .env
  echo ".env created — edit it to set ADMIN_PASSWORD and API keys"
else
  echo ".env already exists, skipping"
fi

echo "=== 9. Install dependencies & build ==="
cd ${APP_DIR}
sudo -u ${APP_USER} npm ci
sudo -u ${APP_USER} npx prisma generate --schema prisma/schema.postgres.prisma
sudo -u ${APP_USER} npx prisma db push --schema prisma/schema.postgres.prisma --accept-data-loss
sudo -u ${APP_USER} npm run build

echo "=== 10. Create systemd service ==="
cat > /etc/systemd/system/fightbase.service <<SERVICE
[Unit]
Description=FightBase Next.js App
After=network.target postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/scripts/start-standalone.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=${APP_DIR}/.env

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable fightbase
systemctl start fightbase

echo "=== 11. Configure Nginx ==="
cat > /etc/nginx/sites-available/fightbase <<'NGINX'
server {
    listen 80;
    server_name fightbase.ru www.fightbase.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # Next.js static assets cache
        proxy_cache_valid 200 1d;
    }

    # Static assets — long cache
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    client_max_body_size 10M;
}
NGINX

ln -sf /etc/nginx/sites-available/fightbase /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== 12. Configure firewall ==="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Edit /opt/fightbase/.env — set ADMIN_PASSWORD and API keys"
echo "  2. Restart app: systemctl restart fightbase"
echo "  3. Check status: systemctl status fightbase"
echo "  4. Check logs: journalctl -u fightbase -f"
echo "  5. After DNS propagation, run:"
echo "     certbot --nginx -d fightbase.ru -d www.fightbase.ru"
echo ""
echo "DB password saved to: /root/.fightbase_db_pass"
echo "CRON secret: $(grep INGEST_CRON_SECRET ${APP_DIR}/.env | cut -d'\"' -f2)"
echo ""
echo "Test: curl http://localhost:3000/api/health"
echo "============================================"
