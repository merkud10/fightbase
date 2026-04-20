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
  # FD 9 must be closed in the watchdog (9>&-); otherwise it inherits the
  # flock on LOCKFILE and blocks every subsequent cron run until the sleep
  # ends. Using a plain subshell instead of `setsid -f` so $! captures the
  # real watchdog PID and the EXIT trap can kill it reliably.
  (
    sleep "${MAX_RUNTIME_SECONDS}"
    if kill -0 "${SCRIPT_PID}" 2>/dev/null; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${TASK_ARG} exceeded ${MAX_RUNTIME_SECONDS}s, killing PID ${SCRIPT_PID}" >> "${LOG_DIR}/cron.log"
      kill -9 "${SCRIPT_PID}" 2>/dev/null || true
    fi
  ) 9>&- >/dev/null 2>&1 &
  WATCHDOG_PID=$!
  CURL_ERR_FILE="$(mktemp -t cron-tasks.curl.XXXXXX)"
  trap 'kill ${WATCHDOG_PID} 2>/dev/null || true; rm -f "${CURL_ERR_FILE}"' EXIT
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
  # Bash ${var:-default} does not honor nested braces, so "${2:-{}}" is parsed
  # as "${2:-{}" followed by a literal "}", appending a stray } to every
  # non-empty payload and breaking JSON. Default via a plain if-branch instead.
  local data="${2-}"
  if [ -z "${data}" ]; then
    data='{}'
  fi
  : > "${CURL_ERR_FILE}"
  curl --silent --show-error --fail --max-time 30 -w "\n%{http_code}" \
    -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SECRET}" \
    -d "${data}" 2>"${CURL_ERR_FILE}"
}

describe_curl_failure() {
  local rc="$1"
  local err
  err="$(tr '\n' ' ' < "${CURL_ERR_FILE}" 2>/dev/null | sed 's/  */ /g; s/^ *//; s/ *$//')"
  echo "curl exit=${rc}${err:+ err=${err}}"
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

extract_json_field() {
  local json="$1"
  local field="$2"
  sed -n "s/.*\"${field}\":\"\\([^\"]*\\)\".*/\\1/p" <<< "${json}" | head -n1
}

ensure_expected_job() {
  local task_name="$1"
  local expected_job="$2"
  local http_code="$3"
  local body="$4"

  if [ "${http_code}" != "200" ]; then
    return 0
  fi

  local actual_job
  actual_job="$(extract_json_field "${body}" "job")"

  if [ "${actual_job}" != "${expected_job}" ]; then
    log "${task_name} returned unexpected job: expected ${expected_job}, got ${actual_job:-<empty>} | body=${body}"
    send_tg_alert "❌ ${task_name}: API вернул задачу ${actual_job:-пусто} вместо ${expected_job}"
    exit 1
  fi
}

case "${TASK}" in
  drip-social)
    log "Starting drip-social"
    response=$(call_api "/api/cron/drip-social") || {
      rc=$?
      diag="$(describe_curl_failure "${rc}")"
      log "drip-social FAILED (${diag})"
      send_tg_alert "❌ Drip social: ${diag}"
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
      rc=$?
      diag="$(describe_curl_failure "${rc}")"
      log "sync-news FAILED (${diag})"
      send_tg_alert "❌ Сбор новостей: ${diag}"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-news HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      ensure_expected_job "sync-news" "weekly-news" "$http_code" "$body"
      process_jobs 8 20
      send_tg_alert "✅ Сбор новостей завершён"
    else
      send_tg_alert "❌ Сбор новостей: HTTP ${http_code}"
    fi
    ;;

  sync-odds)
    log "Starting sync-odds"
    response=$(call_api "/api/cron/ingest" '{"job":"sync-odds"}') || {
      rc=$?
      diag="$(describe_curl_failure "${rc}")"
      log "sync-odds FAILED (${diag})"
      send_tg_alert "❌ Синхронизация турниров: ${diag}"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-odds HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      ensure_expected_job "sync-odds" "sync-odds" "$http_code" "$body"
      process_jobs 6 20
      send_tg_alert "✅ Турниры + бои + прогнозы обновлены"
    else
      send_tg_alert "❌ Синхронизация турниров: HTTP ${http_code}"
    fi
    ;;

  sync-roster)
    log "Starting sync-roster"
    response=$(call_api "/api/cron/ingest" '{"job":"sync-roster"}') || {
      rc=$?
      diag="$(describe_curl_failure "${rc}")"
      log "sync-roster FAILED (${diag})"
      send_tg_alert "❌ Синхронизация бойцов: ${diag}"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "sync-roster HTTP ${http_code}: ${body}"
    if [ "$http_code" = "200" ]; then
      ensure_expected_job "sync-roster" "sync-roster" "$http_code" "$body"
      process_jobs 10 30
      send_tg_alert "✅ Бойцы обновлены"
    else
      send_tg_alert "❌ Синхронизация бойцов: HTTP ${http_code}"
    fi
    ;;

  silence-check)
    log "Starting silence-check"
    response=$(curl -sf -w "\n%{http_code}" "${BASE_URL}/api/ops/diagnostics" \
      -H "Authorization: Bearer ${SECRET}") || {
      log "silence-check FAILED to reach diagnostics endpoint"
      send_tg_alert "⚠️ Silence check: не удалось опросить /api/ops/diagnostics"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    if [ "$http_code" != "200" ]; then
      log "silence-check HTTP ${http_code}"
      send_tg_alert "⚠️ Silence check: HTTP ${http_code}"
      exit 0
    fi
    warnings=$(echo "$body" | sed -n 's/.*"warnings":\[\([^]]*\)\].*/\1/p')
    if [ -n "$warnings" ] && [ "$warnings" != "" ]; then
      log "silence-check warnings: ${warnings}"
      send_tg_alert "⚠️ FightBase diagnostics: ${warnings}"
    else
      log "silence-check ok"
    fi
    ;;

  *)
    echo "Usage: $0 {drip-social|sync-news|sync-odds|sync-roster|silence-check}"
    exit 1
    ;;
esac
