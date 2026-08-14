#!/bin/bash
# =============================================================
# Ночной бэкап базы FightBase.
# 1) pg_dump | gzip -> /opt/fightbase/backups/ (ротация 14 дней)
# 2) отправка сжатого дампа в Telegram-чат алертов (офф-сайт копия)
# Запускается из crontab пользователя fightbase:
#   30 0 * * * cd /opt/fightbase && bash scripts/backup-database.sh >> /tmp/backup-db.log 2>&1
# Восстановление: gunzip -c file.sql.gz | psql "$DATABASE_URL"
# =============================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/fightbase}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "${APP_DIR}"
set -a
# shellcheck disable=SC1091
. ./.env 2>/dev/null
set +a

DB="${DATABASE_URL%%\?*}"
STAMP="$(date +%Y%m%d-%H%M)"
FILE="${BACKUP_DIR}/fightbase-${STAMP}.sql.gz"

notify() {
  local text="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERTS_CHAT_ID:-}" ]; then
    curl -s --max-time 30 \
      -d "chat_id=${TELEGRAM_ALERTS_CHAT_ID}" \
      --data-urlencode "text=${text}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" > /dev/null || true
  fi
}

mkdir -p "${BACKUP_DIR}"

if ! pg_dump "${DB}" | gzip -9 > "${FILE}"; then
  notify "❌ Бэкап базы FightBase не удался (pg_dump). Смотри /tmp/backup-db.log на сервере."
  echo "$(date -Is) pg_dump failed"
  exit 1
fi

SIZE_BYTES=$(stat -c%s "${FILE}")
SIZE_MB=$(awk "BEGIN {printf \"%.1f\", ${SIZE_BYTES}/1024/1024}")

if [ "${SIZE_BYTES}" -lt 100000 ]; then
  notify "❌ Бэкап базы FightBase подозрительно мал (${SIZE_MB} MB) — проверь вручную."
  echo "$(date -Is) dump too small: ${SIZE_MB} MB"
  exit 1
fi

# Ротация локальных копий.
find "${BACKUP_DIR}" -name 'fightbase-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete

# Офф-сайт копия в Telegram (лимит Bot API 50 MB; при приближении к нему
# перейти на S3 — см. память deploy-pipeline).
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERTS_CHAT_ID:-}" ]; then
  RESPONSE=$(curl -s --max-time 120 \
    -F "chat_id=${TELEGRAM_ALERTS_CHAT_ID}" \
    -F "document=@${FILE}" \
    -F "caption=🗄 Бэкап базы FightBase ${STAMP} (${SIZE_MB} MB)" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument")
  if ! echo "${RESPONSE}" | grep -q '"ok":true'; then
    notify "⚠️ Бэкап базы сделан локально (${SIZE_MB} MB), но отправка файла в Telegram не удалась."
    echo "$(date -Is) telegram upload failed: ${RESPONSE}"
    exit 0
  fi
fi

echo "$(date -Is) backup ok: ${FILE} (${SIZE_MB} MB)"
