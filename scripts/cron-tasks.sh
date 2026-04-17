#!/bin/bash
# =============================================================
# FightBase Cron Tasks
# Usage: bash /opt/fightbase/scripts/cron-tasks.sh <task>
#
# Tasks:
#   drip-social    — publish next article to TG/VK
#   sync-news      — AI news discovery
#   sync-odds      — sync events + fights + odds
#   sync-roster    — sync fighter roster
# =============================================================
set -euo pipefail

APP_DIR="/opt/fightbase"
BASE_URL="http://localhost:3000"
LOG_DIR="/var/log/fightbase"
LOCK_DIR="/var/lock/fightbase"

mkdir -p "${LOCK_DIR}" "${LOG_DIR}"

MAX_RUNTIME_SECONDS="${MAX_RUNTIME_SECONDS:-1500}"

log_raw() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "${LOG_DIR}/cron.log"
}

reap_stuck_lock_holder() {
  local lockfile="$1"
  local holder state
  holder="$(fuser "${lockfile}" 2>/dev/null | tr -s ' ' | awk '{for(i=1;i<=NF;i++)if($i~/^[0-9]+$/){print $i; exit}}')"
  [ -z "${holder}" ] && return 1
  state="$(ps -o state= -p "${holder}" 2>/dev/null | tr -d ' ' || true)"
  if [[ "${state}" =~ ^[TZ] ]]; then
    log_raw "reaping stuck lock holder PID ${holder} (state ${state}) on ${lockfile}"
    kill -9 "${holder}" 2>/dev/null || true
    return 0
  fi
  return 1
}

TASK_ARG="${1:-}"
if [ -n "${TASK_ARG}" ]; then
  LOCKFILE="${LOCK_DIR}/${TASK_ARG}.lock"
  exec 9>"${LOCKFILE}"
  if ! flock -n 9; then
    if reap_stuck_lock_holder "${LOCKFILE}"; then
      sleep 1
      exec 9>"${LOCKFILE}"
      if ! flock -n 9; then
        log_raw "${TASK_ARG} still locked after reap, skipping"
        exit 0
      fi
      log_raw "${TASK_ARG} lock recovered after reaping stuck holder"
    else
      log_raw "${TASK_ARG} already running, skipping"
      exit 0
    fi
  fi

  SCRIPT_PID=$$
  setsid -f bash -c "
    sleep ${MAX_RUNTIME_SECONDS}
    if kill -0 ${SCRIPT_PID} 2>/dev/null; then
      echo \"[\$(date '+%Y-%m-%d %H:%M:%S')] ${TASK_ARG} exceeded ${MAX_RUNTIME_SECONDS}s, killing PID ${SCRIPT_PID}\" >> ${LOG_DIR}/cron.log
      kill -9 ${SCRIPT_PID} 2>/dev/null || true
    fi
  " >/dev/null 2>&1 &
  WATCHDOG_PID=$!
  trap 'kill ${WATCHDOG_PID} 2>/dev/null || true' EXIT
fi

# Load secrets from .env (strip surrounding quotes)
if [ -f "${APP_DIR}/.env" ]; then
  while IFS='=' read -r key value; do
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
  done < <(grep -E '^(INGEST_CRON_SECRET|INTERNAL_API_SECRET|TELEGRAM_BOT_TOKEN|TELEGRAM_ALERTS_CHAT_ID)=' "${APP_DIR}/.env")
fi

SECRET="${INTERNAL_API_SECRET:-${INGEST_CRON_SECRET:-}}"
TASK="${1:-}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "${LOG_DIR}"

log() {
  echo "[${TIMESTAMP}] $1" >> "${LOG_DIR}/cron.log"
}

send_tg_alert() {
  local text="$1"
  local token="${TELEGRAM_BOT_TOKEN:-}"
  local chat="${TELEGRAM_ALERTS_CHAT_ID:-}"
  if [ -n "$token" ] && [ -n "$chat" ]; then
    curl -sf -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\": \"${chat}\", \"text\": \"${text}\", \"disable_notification\": true}" \
      > /dev/null 2>&1 || true
  fi
}

call_api() {
  local endpoint="$1"
  local data="${2:-{}}"
  curl -sf -w "\n%{http_code}" -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SECRET}" \
    -d "${data}"
}

process_jobs() {
  local rounds="${1:-6}"
  local pause="${2:-20}"
  sleep 30
  for i in $(seq 1 "$rounds"); do
    curl -sf -X POST "${BASE_URL}/api/cron/jobs" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SECRET}" \
      -d '{"limit": 5}' > /dev/null 2>&1 || true
    sleep "$pause"
  done
}

case "${TASK}" in
  drip-social)
    log "Starting drip-social"
    response=$(call_api "/api/cron/drip-social") || {
      log "drip-social FAILED"
      send_tg_alert "❌ Drip social: ошибка при запуске"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "drip-social HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      published=$(echo "$body" | grep -o '"published":true' || true)
      if [ -n "$published" ]; then
        tg_title=$(echo "$body" | sed -n 's/.*"telegram":{[^}]*"title":"\([^"]*\)".*/\1/p')
        send_tg_alert "📢 Статья отправлена в ТГ/ВК: ${tg_title:-без названия}"
      else
        send_tg_alert "ℹ️ Drip social: нет статей для отправки"
      fi
    else
      send_tg_alert "❌ Drip social: HTTP ${http_code}"
    fi
    ;;

  sync-news)
    log "Starting sync-news"
    response=$(call_api "/api/cron/ingest" '{"job":"ai-discovery","lookbackHours":8,"limit":10,"status":"published"}') || {
      log "sync-news FAILED"
      send_tg_alert "❌ Сбор новостей: ошибка при запуске"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-news HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      process_jobs 8 20
      send_tg_alert "✅ Сбор новостей завершён"
    else
      send_tg_alert "❌ Сбор новостей: HTTP ${http_code}"
    fi
    ;;

  sync-odds)
    log "Starting sync-odds"
    response=$(call_api "/api/cron/ingest" '{"job":"sync-odds"}') || {
      log "sync-odds FAILED"
      send_tg_alert "��� Синхронизация турниров: ошибка при запуске"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-odds HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      process_jobs 6 20
      send_tg_alert "✅ Турниры + бои + прогнозы обновлены"
    else
      send_tg_alert "❌ Синхронизация турниров: HTTP ${http_code}"
    fi
    ;;

  sync-roster)
    log "Starting sync-roster"
    response=$(call_api "/api/cron/ingest" '{"job":"sync-roster"}') || {
      log "sync-roster FAILED"
      send_tg_alert "❌ Синхронизация бойцов: ошибка при запуске"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-roster HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      process_jobs 10 30
      send_tg_alert "✅ Бойцы обновлены"
    else
      send_tg_alert "❌ Синхронизация бойцов: HTTP ${http_code}"
    fi
    ;;

  *)
    echo "Usage: $0 {drip-social|sync-news|sync-odds|sync-roster}"
    exit 1
    ;;
esac
