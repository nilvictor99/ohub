#!/usr/bin/env bash
# ohub portable bootstrap. No instala nada fuera de esta carpeta.
# Uso: ./start.sh [--menu|--auto|--apply|--reset|--verbose|--help|--version] [comando...]

set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_NAME="ohub"
BIN="$APP_DIR/bin/ohub"
DATA_DIR="$APP_DIR/data"
STATE_DIR="$DATA_DIR/state"
LOG_DIR="$DATA_DIR/logs"
LOG_FILE="$LOG_DIR/bootstrap.log"
BOOT_MARKER="$DATA_DIR/.bootstrap.done"

export OHUB_HOME="$APP_DIR"
export OHUB_STATE_HOME="$STATE_DIR"

MENU=false
AUTO=false
APPLY=false
RESET=false
VERBOSE=false
APP_ARGS=()

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$'\033[2m'; C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_OFF=$'\033[0m'
else
  C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_OFF=""
fi

usage() {
  cat <<EOF
${APP_NAME} portable

Uso:
  ./start.sh                     Abre el menú (TTY) o lista el estado
  ./start.sh <comando> [...]     Ejecuta un comando de ohub
  ./start.sh --menu              Fuerza el menú interactivo
  ./start.sh --auto              Modo no interactivo (list)
  ./start.sh --apply             Reinicia el servicio de opencode
  ./start.sh --reset             Recompila y rehace el bootstrap
  ./start.sh --verbose           Muestra la salida del bootstrap
  ./start.sh --version           Versión
  ./start.sh --help              Esta ayuda

Comandos:
  list | doctor | reload | config path | config init
  mcp add|list|show|remove|enable|disable
  plugin add|list|remove|update
EOF
}

log() {
  mkdir -p "$LOG_DIR"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG_FILE"
}

spinner() {
  local stage="$1" total="$2" message="$3" stop="$4"
  local frames='|/-\' i=0
  while [ ! -f "$stop" ]; do
    i=$(((i + 1) % 4))
    printf '\r\033[K%s[%s/%s]%s %s %s' "$C_CYAN" "$stage" "$total" "$C_OFF" "$message" "${frames:$i:1}"
    sleep 0.1
  done
  printf '\r\033[K'
}

run_stage() {
  local stage="$1" total="$2" message="$3"
  shift 3
  if [ "$VERBOSE" = true ]; then
    printf '%s[%s/%s]%s %s ... ' "$C_CYAN" "$stage" "$total" "$C_OFF" "$message"
    if ! "$@" >>"$LOG_FILE" 2>&1; then
      printf '%sfalló%s\n' "$C_RED" "$C_OFF"
      printf '%sRevisa %s%s\n' "$C_DIM" "$LOG_FILE" "$C_OFF"
      exit 1
    fi
    printf '%sok%s\n' "$C_GREEN" "$C_OFF"
    return 0
  fi

  local stop
  stop="$(mktemp)"
  if [ -t 1 ]; then
    spinner "$stage" "$total" "$message" "$stop" &
    local pid=$!
  fi
  local code=0
  "$@" >>"$LOG_FILE" 2>&1 || code=$?
  if [ -t 1 ]; then
    touch "$stop"
    kill "${pid:-0}" 2>/dev/null || true
    wait "${pid:-0}" 2>/dev/null || true
  fi
  rm -f "$stop"
  if [ "$code" -ne 0 ]; then
    printf '%s[%s/%s] Falló:%s %s\n' "$C_RED" "$stage" "$total" "$C_OFF" "$message"
    printf '%sRevisa %s%s\n' "$C_DIM" "$LOG_FILE" "$C_OFF"
    exit "$code"
  fi
  printf '%s[%s/%s]%s %s\n' "$C_GREEN" "$stage" "$total" "$C_OFF" "$message"
}

needs_build() {
  [ ! -x "$BIN" ] && return 0
  [ "$APP_DIR/package.json" -nt "$BIN" ] && return 0
  [ "$APP_DIR/bun.lock" -nt "$BIN" ] && return 0
  [ -n "$(find "$APP_DIR/src" -type f -newer "$BIN" -print -quit 2>/dev/null)" ] && return 0
  return 1
}

ensure_binary() {
  if needs_build; then
    if ! command -v bun >/dev/null 2>&1; then
      printf '%sError:%s bin/ohub no existe o está desactualizado y Bun no está instalado.\n' "$C_RED" "$C_OFF" >&2
      printf '%sInstala Bun (https://bun.sh) o copia un binario ya compilado en bin/ohub.%s\n' "$C_DIM" "$C_OFF" >&2
      exit 1
    fi
    mkdir -p "$APP_DIR/bin"
    bun build --compile --outfile "$BIN" "$APP_DIR/src/cli.ts"
  fi
  chmod +x "$BIN"
}

bootstrap() {
  printf '%s%s%s\n' "$C_CYAN" "$APP_NAME portable bootstrap" "$C_OFF"
  log "Bootstrap start (reset=$RESET)"

  if [ "$RESET" = true ]; then
    rm -f "$BOOT_MARKER"
    rm -f "$BIN"
    log "Reset requested"
  fi

  if [ -f "$BOOT_MARKER" ] && ! needs_build; then
    printf '%sListo.%s\n' "$C_GREEN" "$C_OFF"
    return 0
  fi

  run_stage 1 5 "Verificando entorno" verify_env
  run_stage 2 5 "Creando estructura portable" create_layout
  run_stage 3 5 "Preparando binario" ensure_binary
  run_stage 4 5 "Validando ejecutable" validate_binary
  run_stage 5 5 "Guardando estado" mark_ready
}

verify_env() {
  command -v bash >/dev/null 2>&1
}

create_layout() {
  mkdir -p "$APP_DIR/bin" "$STATE_DIR/backups" "$DATA_DIR/tmp" "$LOG_DIR"
}

validate_binary() {
  "$BIN" --version >/dev/null 2>&1 || "$BIN" --help >/dev/null 2>&1
}

mark_ready() {
  date '+%Y-%m-%dT%H:%M:%S' >"$BOOT_MARKER"
}

for arg in "$@"; do
  case "$arg" in
    --menu) MENU=true ;;
    --auto) AUTO=true ;;
    --apply) APPLY=true ;;
    --reset) RESET=true ;;
    --verbose) VERBOSE=true ;;
    --help|-h) usage; exit 0 ;;
    --version|-v) "$BIN" --version 2>/dev/null || printf '%s\n' "0.1.0"; exit 0 ;;
    *) APP_ARGS+=("$arg") ;;
  esac
done

MODES=0
[ "$MENU" = true ] && MODES=$((MODES + 1))
[ "$AUTO" = true ] && MODES=$((MODES + 1))
[ "$APPLY" = true ] && MODES=$((MODES + 1))
if [ "$MODES" -gt 1 ]; then
  printf '%sError:%s combina solo uno de --menu, --auto o --apply.\n' "$C_RED" "$C_OFF" >&2
  usage >&2
  exit 1
fi
if [ "${#APP_ARGS[@]}" -gt 0 ] && [ "$MENU" = true ]; then
  printf '%sError:%s --menu no acepta comandos adicionales.\n' "$C_RED" "$C_OFF" >&2
  exit 1
fi

bootstrap

if [ "$AUTO" = true ]; then
  exec "$BIN" list --json
fi
if [ "$APPLY" = true ]; then
  exec "$BIN" reload
fi
if [ "${#APP_ARGS[@]}" -gt 0 ]; then
  exec "$BIN" "${APP_ARGS[@]}"
fi
if [ "$MENU" = true ] || { [ -t 0 ] && [ -t 1 ]; }; then
  exec "$BIN" --menu
fi
exec "$BIN" list
