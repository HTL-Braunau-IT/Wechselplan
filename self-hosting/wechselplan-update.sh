#!/bin/bash
#
# Wechselplan: Update einspielen (für selbst betriebene Installationen).
#
# 1. Holt die zur Version passende docker-compose.yaml aus dem öffentlichen
#    Repository und übernimmt sie, wenn `docker compose config` sie mit der
#    vorhandenen .env akzeptiert.
# 2. Holt das Image des gewählten Kanals (APP_IMAGE in .env).
# 3. Sichert die Datenbank, rollt aus (migrate -> web) und prüft /api/health.
# 4. Rollt bei Fehlschlag auf das vorherige Image zurück. Die Datenbank wird
#    dabei bewusst NICHT angefasst (siehe README, „Wiederherstellen“).
#
# Aufruf: wechselplan-update [stack-verzeichnis]   (Standard: /srv/wechselplan)
#
# Optional in .env:
#   WECHSELPLAN_SYNC_COMPOSE=false   Compose-Datei nie automatisch ersetzen
#
set -euo pipefail

STACK_DIR=${1:-/srv/wechselplan}
REPO=HTL-Braunau-IT/Wechselplan
cd "$STACK_DIR"

# Nur die benötigten Werte lesen, statt .env per `source` auszuführen: Secrets
# mit `$`, Leerzeichen oder Anführungszeichen würden die Shell sonst verwirren.
envval() {
  { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
APP_IMAGE=$(envval APP_IMAGE)
: "${APP_IMAGE:?APP_IMAGE fehlt in .env}"
PORT=$(envval HTTP_PORT)
PORT=${PORT:-3000}
SYNC_COMPOSE=$(envval WECHSELPLAN_SYNC_COMPOSE)

log() { echo "[update] $*"; }

# --- 1. Compose-Datei --------------------------------------------------------
# Welcher Stand im Repository gehört zum gewählten Image-Kanal?
compose_ref() {
  case "$APP_IMAGE" in
    *@*) return 0 ;; # per Digest festgenagelt: Compose nicht anfassen
  esac
  local tag=${APP_IMAGE##*:}
  case "$tag" in
    stable)
      curl -fsS "https://api.github.com/repos/${REPO}/releases/latest" |
        sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1
      ;;
    latest) echo main ;;
    sha-*) echo "${tag#sha-}" ;;
    v[0-9]*) echo "$tag" ;;
    *) ;; # unbekannter Tag: Compose nicht anfassen
  esac
}

COMPOSE_CHANGED=false
if [ "${SYNC_COMPOSE:-true}" != "false" ]; then
  REF=$(compose_ref || true)
  if [ -n "$REF" ]; then
    URL="https://raw.githubusercontent.com/${REPO}/${REF}/docker-compose.yaml"
    if curl -fsSL "$URL" -o docker-compose.yaml.new; then
      if cmp -s docker-compose.yaml docker-compose.yaml.new; then
        rm -f docker-compose.yaml.new
      elif docker compose -f docker-compose.yaml.new --env-file .env config -q; then
        cp docker-compose.yaml docker-compose.yaml.prev
        mv docker-compose.yaml.new docker-compose.yaml
        COMPOSE_CHANGED=true
        log "docker-compose.yaml auf Stand ${REF} aktualisiert (alt: docker-compose.yaml.prev)"
      else
        log "FEHLER: Die neue docker-compose.yaml (${REF}) passt nicht zur .env." >&2
        log "Meist fehlt eine neue Pflichtvariable – siehe Release-Hinweise." >&2
        log "Die neue Datei liegt unter docker-compose.yaml.new; nichts wurde geändert." >&2
        exit 1
      fi
    else
      log "Warnung: docker-compose.yaml (${REF}) nicht abrufbar, behalte die vorhandene" >&2
    fi
  fi
fi

# --- 2. Image ----------------------------------------------------------------
OLD_ID=$(docker image inspect --format '{{.Id}}' "$APP_IMAGE" 2>/dev/null || true)
docker compose pull --quiet web
NEW_ID=$(docker image inspect --format '{{.Id}}' "$APP_IMAGE")
if [ "$OLD_ID" = "$NEW_ID" ] && [ "$COMPOSE_CHANGED" = false ]; then
  log "bereits aktuell"
  exit 0
fi

# Laufendes Image als Digest merken (der Tag zeigt nach dem Pull schon auf das neue).
PREV=''
CID=$(docker compose ps -q web | head -1)
if [ -n "$CID" ]; then
  PREV=$(docker inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' \
    "$(docker inspect --format '{{.Image}}' "$CID")")
fi

# --- 3. Backup + Ausrollen ---------------------------------------------------
# Das Backup vor der Migration: der einzige nicht umkehrbare Schritt.
mkdir -p backups
if [ -n "$(docker compose ps -q db)" ]; then
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  docker compose exec -T db sh -lc \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "backups/pre-update-${STAMP}.dump.partial"
  mv "backups/pre-update-${STAMP}.dump.partial" "backups/pre-update-${STAMP}.dump"
  find backups -name 'pre-update-*.dump' -mtime +14 -delete
  log "Backup: backups/pre-update-${STAMP}.dump"
fi

# migrate läuft zuerst; web startet nur, wenn migrate mit 0 endet.
if docker compose up -d --remove-orphans; then
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      log "erfolgreich: $(curl -sS "http://127.0.0.1:${PORT}/api/health")"
      docker image prune -f >/dev/null
      exit 0
    fi
    sleep 5
  done
fi

# --- 4. Rollback -------------------------------------------------------------
log "FEHLGESCHLAGEN" >&2
docker compose logs --tail 100 migrate web >&2 || true
if [ "$COMPOSE_CHANGED" = true ]; then
  log "Stelle vorherige docker-compose.yaml wieder her" >&2
  mv docker-compose.yaml.prev docker-compose.yaml
fi
if [ -n "$PREV" ]; then
  log "Rollback auf $PREV" >&2
  APP_IMAGE="$PREV" docker compose up -d web
fi
exit 1
