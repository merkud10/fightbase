#!/bin/bash
# =============================================================
# Ночной бэкап базы FightBase: pg_dump | gzip в /opt/fightbase/backups/
# с ротацией 14 дней. Офф-сайт копию в Telegram отправляет workflow
# backup-offsite.yml из GitHub Actions: api.telegram.org с самого сервера
# отвечает нестабильно, поэтому доставка и контроль свежести — снаружи.
# Крон (пользователь fightbase):
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

mkdir -p "${BACKUP_DIR}"

if ! pg_dump "${DB}" | gzip -9 > "${FILE}"; then
  echo "$(date -Is) pg_dump failed"
  rm -f "${FILE}"
  exit 1
fi

SIZE_BYTES=$(stat -c%s "${FILE}")
SIZE_MB=$(awk "BEGIN {printf \"%.1f\", ${SIZE_BYTES}/1024/1024}")

if [ "${SIZE_BYTES}" -lt 100000 ]; then
  echo "$(date -Is) dump too small: ${SIZE_MB} MB"
  rm -f "${FILE}"
  exit 1
fi

# Ротация локальных копий.
find "${BACKUP_DIR}" -name 'fightbase-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete

echo "$(date -Is) backup ok: ${FILE} (${SIZE_MB} MB)"
