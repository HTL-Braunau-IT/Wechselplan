# Wechselplan selbst betreiben

Diese Anleitung richtet sich an Schulen, die Wechselplan auf ihrem eigenen Server
betreiben möchten. Sie beschreibt:

1. die Voraussetzungen,
2. die App-Registrierung in Microsoft Entra ID,
3. die Konfiguration (`.env`),
4. die Erstinstallation,
5. automatische Updates,
6. Backups, Wiederherstellung und Betrieb.

Wechselplan wird von der HTL Braunau als fertiges Docker-Image ausgeliefert. Sie
bauen nichts selbst. Ihr Server holt neue Versionen aus der GitHub Container
Registry und spielt sie ein, inklusive Datenbank-Migrationen.

---

## 1. Voraussetzungen

| | |
|---|---|
| Server | Linux-VM oder LXC (bei LXC: `nesting=1,keyctl=1`), 2–4 Kerne, 4 GB RAM, 30 GB Speicher reichen für eine Schule |
| Software | Docker Engine ≥ 24 mit Compose-Plugin (`docker compose version`), `curl` |
| Netzwerk ausgehend | `ghcr.io`, `login.microsoftonline.com`, `graph.microsoft.com`, optional Notenmanagement |
| Netzwerk eingehend | HTTPS über Ihren Reverse Proxy (nginx, Traefik, Caddy …). Die App selbst spricht nur HTTP auf Port 3000. |
| DNS + Zertifikat | z. B. `wechselplan.ihre-schule.at` |
| Microsoft 365 | Entra-ID-Tenant, in dem Sie App-Registrierungen anlegen und Admin-Consent erteilen dürfen |
| Zugang zum Image | Zugangsdaten von der HTL Braunau (siehe 4.1), falls das Image nicht öffentlich ist |

---

## 2. Microsoft Entra ID

Legen Sie in **Ihrem** Tenant eine eigene App-Registrierung an. Eine App der HTL
Braunau wird nicht mitbenutzt: Anmeldung und Verzeichnisabgleich laufen beide gegen
Ihren Tenant.

### 2.1 App-Registrierung „Wechselplan“

Entra Admin Center → *Anwendungen* → *App-Registrierungen* → *Neue Registrierung*

- **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis* (Single Tenant)
- **Umleitungs-URI:** Plattform *Web*,
  `https://wechselplan.ihre-schule.at/api/auth/callback/azure-ad`
  (Der Pfad muss exakt so lauten. Die Domain muss mit `NEXTAUTH_URL` übereinstimmen.)

Danach:

- **Zertifikate & Geheimnisse:** neuen geheimen Clientschlüssel anlegen. Den *Wert*
  tragen Sie als `ENTRA_CLIENT_SECRET` ein. **Notieren Sie das Ablaufdatum.** Läuft der
  Schlüssel ab, kann sich niemand mehr anmelden und der Abgleich bricht ab.
- **Übersicht:** *Anwendungs-ID (Client)* → `ENTRA_CLIENT_ID`,
  *Verzeichnis-ID (Mandant)* → `ENTRA_TENANT_ID`.

### 2.2 API-Berechtigungen

| Typ | Berechtigung | Wofür |
|---|---|---|
| Delegiert | `openid`, `profile`, `email` | Anmeldung (OIDC). Mehr fordert der Login nicht an. |
| **Anwendung** | `User.Read.All` | Lehrer-/Schülerabgleich inkl. `employeeId` (Sokrates-ID) und Profilfotos |
| **Anwendung** | `GroupMember.Read.All` | Gruppenmitgliedschaft beim Login, alle 15 Min. Rollenprüfung, Klassenabgleich |

Anschließend **„Administratorzustimmung für … erteilen“** klicken. Ohne Admin-Consent
schlagen Login und Abgleich fehl.

Weitere Berechtigungen sind nicht nötig, insbesondere kein `Group.Read.All`,
`Directory.Read.All` oder irgendein Schreibrecht.

### 2.3 Gruppen

- **Lehrergruppe** (Sicherheitsgruppe): Alle Mitglieder gelten als Lehrer. Ihre
  Objekt-ID kommt in `ENTRA_TEACHER_GROUP_ID`. Verschachtelte Gruppen werden
  aufgelöst.
- **Klassengruppen:** eine Gruppe pro Klasse. Schüler dürfen sich nur anmelden, wenn
  sie in einer abgeglichenen Klassengruppe sind. Die Liste der Klassengruppen wird nach
  dem ersten Start im Admin-Bereich gepflegt. `ENTRA_SYNC_CLASS_GROUP_IDS` dient nur
  als Startwert.
- **Super-Admin:** die Objekt-ID der Person, die die App verwaltet, in
  `ENTRA_SUPER_ADMIN_OBJECT_ID`. Nur diese Person kann weiteren Benutzern die
  Admin-Rolle geben. **Sie muss selbst Mitglied der Lehrergruppe sein**, sonst wird sie
  schon beim Login abgewiesen.

### 2.4 Optional: E-Mail-Versand (zweite App-Registrierung)

Nur nötig, wenn Wechselplan Mails versenden soll (Support-Formular, tägliche
Benachrichtigungs-Zusammenfassung). Verwenden Sie dafür eine **eigene**
App-Registrierung, nicht die aus 2.1:

- Anwendungsberechtigung `Mail.Send` mit Admin-Consent
- **Unbedingt einschränken:** `Mail.Send` als Anwendungsberechtigung darf sonst im Namen
  *jedes* Postfachs Ihres Tenants senden. Beschränken Sie die App per
  *RBAC for Applications* in Exchange Online (oder per Application Access Policy) auf
  das eine Absender-Postfach.
- Werte: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
  `GRAPH_MAIL_FROM` (Absender-Postfach), `GRAPH_MAIL_TO` (Empfänger für Support-Anfragen)

### 2.5 Optional: Mobile App

Nur bei Nutzung der iOS-/Android-App: In der App-Registrierung aus 2.1 unter
*Eine API verfügbar machen* den Bereich `api://<Client-ID>/access_as_user` anlegen
und `AUTH_BEARER_ENABLED=true` setzen.

---

## 3. Konfiguration (`.env`)

Alle Werte stehen in **einer** Datei `/srv/wechselplan/.env`, Rechte `0600`. Diese
Datei verlässt den Server nie.

Zufallswerte erzeugen:

```bash
openssl rand -base64 48
```

```dotenv
# --- Stack ------------------------------------------------------------------
COMPOSE_PROJECT_NAME=wechselplan
DATA_ROOT=/srv/wechselplan
HTTP_PORT=3000
# Kanal, dem Sie folgen (siehe Abschnitt 5). Mit der HTL Braunau abstimmen.
APP_IMAGE=ghcr.io/htl-braunau-it/wechselplan:stable

# --- Datenbank (läuft im selben Stack) --------------------------------------
POSTGRES_USER=wechselplan
POSTGRES_DB=wechselplan
POSTGRES_PASSWORD=<zufallswert>

# --- App ----------------------------------------------------------------------
NEXTAUTH_URL=https://wechselplan.ihre-schule.at
# ACHTUNG: Darf nach dem ersten Start NIE geändert werden. Daraus wird auch der
# Schlüssel für verschlüsselt gespeicherte Passwörter abgeleitet. Gut sichern!
NEXTAUTH_SECRET=<zufallswert>

# --- Entra (Abschnitt 2) ------------------------------------------------------
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TEACHER_GROUP_ID=
ENTRA_SUPER_ADMIN_OBJECT_ID=
ENTRA_SYNC_ENABLED=true
# Nur Startwert, kommagetrennt; danach im Admin-Bereich pflegen.
ENTRA_SYNC_CLASS_GROUP_IDS=
# Schützt den nächtlichen Abgleich (POST /api/sync/run).
SYNC_TRIGGER_SECRET=<zufallswert>
# Abgleich verweigern, wenn er mehr als 20 % der aktiven Einträge deaktivieren würde.
SYNC_MAX_DEACTIVATION_RATIO=0.2

# --- Notenmanagement ----------------------------------------------------------
# Pflichtfeld. Ohne eigenes Notenmanagement-System eine beliebige gültige URL
# eintragen; die Notenübertragung wird dann einfach nicht verwendet.
NOTENMANAGEMENT_BASE_URL=https://notenmanagement.ihre-schule.at/work/rest/

# --- Optional -----------------------------------------------------------------
# E-Mail (Abschnitt 2.4)
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_MAIL_FROM=
GRAPH_MAIL_TO=
# Mobile App (Abschnitt 2.5)
AUTH_BEARER_ENABLED=false
ENTRA_API_AUDIENCE=
# Online-Shell-Anbindung; leer = aus
ONLINE_SHELL_API_SECRET=
# Für die Anzeige der Versionshinweise (von der HTL Braunau, falls benötigt)
GITHUB_TOKEN=

# Nur beim allerersten Start auf true, danach wieder false.
RUN_DB_SEED=false
```

Fehlt ein Pflichtwert, startet die App nicht. `docker compose logs web` nennt die
fehlende Variable.

---

## 4. Erstinstallation

### 4.1 Zugang zur Registry

Ist das Image nicht öffentlich, erhalten Sie von der HTL Braunau einen
**Lese-Token** (nur `read:packages`). Einmalig als root anmelden:

```bash
echo '<token>' | docker login ghcr.io -u <benutzername> --password-stdin
```

Die Zugangsdaten landen in `/root/.docker/config.json` und werden von den
Update-Jobs mitbenutzt.

### 4.2 Verzeichnisse und Compose-Datei

```bash
mkdir -p /srv/wechselplan/{postgres,data,backups}
chown 1001:1001 /srv/wechselplan/data
cd /srv/wechselplan
```

Legen Sie `docker-compose.yaml` ab. Sie erhalten die Datei von der HTL Braunau, sie
entspricht `docker-compose.yaml` im Repository. Die Compose-Datei wird **nicht**
automatisch aktualisiert (siehe 5.4).

Dann die `.env` aus Abschnitt 3 anlegen:

```bash
chmod 600 /srv/wechselplan/.env
```

Der Stack besteht aus vier Containern:

| Container | Aufgabe |
|---|---|
| `db` | PostgreSQL 15, deutsche Sortierung (ICU `de-AT`) |
| `migrate` | Läuft einmal pro Start, spielt Datenbank-Migrationen ein und beendet sich |
| `web` | Die Anwendung. Startet erst, wenn `migrate` fehlerfrei beendet wurde. |
| `sync-scheduler` | Ruft täglich um 02:00 (Europe/Vienna) den Verzeichnisabgleich auf |

### 4.3 Erster Start

In der `.env` `RUN_DB_SEED=true` setzen. Das legt Stammdaten an: Ferien,
Unterrichtszeiten, Räume, Fächer. Dann starten:

```bash
docker compose pull
docker compose up -d
docker compose logs -f migrate web
curl -fsS http://localhost:3000/api/health
```

Danach **`RUN_DB_SEED=false`** zurücksetzen und `docker compose up -d` erneut
ausführen.

> **Hinweis:** Die Stammdaten (Ferien, Räume, Fächer) stammen aus der HTL Braunau.
> Passen Sie sie nach dem ersten Login im Admin-Bereich an Ihre Schule an. Ein
> späterer Seed überschreibt gleichnamige Einträge, deshalb den Seed nicht erneut
> aktivieren.

### 4.4 Reverse Proxy

Leiten Sie HTTPS auf `http://<server>:3000` weiter und setzen Sie die üblichen
`X-Forwarded-*`-Header. Beispiel nginx:

```nginx
location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 20m;   # Foto-Uploads
}
```

Läuft der Proxy auf demselben Host, binden Sie den Port in der Compose-Datei an
`127.0.0.1:3000:3000`, damit die App nicht unverschlüsselt im LAN erreichbar ist.

### 4.5 Erste Anmeldung und erster Abgleich

1. Mit dem Super-Admin-Konto unter `NEXTAUTH_URL` anmelden.
2. Admin-Bereich: Klassengruppen prüfen bzw. eintragen, Stammdaten anpassen.
3. Abgleich einmal von Hand starten, statt auf 02:00 zu warten:

   ```bash
   cd /srv/wechselplan
   curl -fsS -X POST http://localhost:3000/api/sync/run \
     -H "x-sync-secret: $(grep ^SYNC_TRIGGER_SECRET= .env | cut -d= -f2-)"
   ```

4. Weitere Admins im Admin-Bereich ernennen.

---

## 5. Automatische Updates

Ihr Server holt sich Updates selbst (Pull-Prinzip). Die HTL Braunau braucht keinen
Zugang zu Ihrem Netz, und auf Ihrem Server läuft kein fremder CI-Runner.

### 5.1 Update-Kanäle

| Tag | Inhalt | Empfehlung |
|---|---|---|
| `stable` | nur veröffentlichte Releases | **für Schulbetrieb empfohlen** |
| `latest` | jeder erfolgreiche Build auf `main` | nur nach Absprache, häufige Updates |
| `sha-<commit>` | genau ein bestimmter Stand | zum Festnageln oder Zurückrollen |

Den Kanal legen Sie über `APP_IMAGE` in der `.env` fest.

### 5.2 Update-Skript

`/usr/local/bin/wechselplan-update`, ausführbar (`chmod 755`):

```bash
#!/bin/bash
# Holt das aktuelle Image, sichert vorher die Datenbank, rollt aus und rollt bei
# fehlgeschlagenem Health-Check auf das vorherige Image zurück.
set -euo pipefail

STACK_DIR=${1:-/srv/wechselplan}
cd "$STACK_DIR"
set -a; . ./.env; set +a
PORT=${HTTP_PORT:-3000}

# Gibt es überhaupt etwas Neues?
OLD_ID=$(docker image inspect --format '{{.Id}}' "$APP_IMAGE" 2>/dev/null || true)
docker compose pull --quiet web
NEW_ID=$(docker image inspect --format '{{.Id}}' "$APP_IMAGE")
if [ "$OLD_ID" = "$NEW_ID" ]; then
  echo "[update] bereits aktuell"
  exit 0
fi

# Laufendes Image als Digest merken (der Tag zeigt nach dem Pull schon auf das neue).
PREV=''
CID=$(docker compose ps -q web | head -1)
if [ -n "$CID" ]; then
  PREV=$(docker inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' \
    "$(docker inspect --format '{{.Image}}' "$CID")")
fi

# Backup vor der Migration: der einzige nicht umkehrbare Schritt.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
if [ -n "$(docker compose ps -q db)" ]; then
  docker compose exec -T db sh -lc \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "backups/pre-update-${STAMP}.dump.partial"
  mv "backups/pre-update-${STAMP}.dump.partial" "backups/pre-update-${STAMP}.dump"
  find backups -name 'pre-update-*.dump' -mtime +14 -delete
fi

# migrate läuft zuerst; web startet nur, wenn migrate mit 0 endet.
if docker compose up -d --remove-orphans; then
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      echo "[update] erfolgreich: $(curl -sS "http://127.0.0.1:${PORT}/api/health")"
      docker image prune -f >/dev/null
      exit 0
    fi
    sleep 5
  done
fi

echo "[update] FEHLGESCHLAGEN" >&2
docker compose logs --tail 100 migrate web >&2 || true
if [ -n "$PREV" ]; then
  echo "[update] Rollback auf $PREV" >&2
  APP_IMAGE="$PREV" docker compose up -d web
  # Datenbank bleibt bewusst unverändert. Siehe Abschnitt 6.2.
fi
exit 1
```

### 5.3 Zeitsteuerung (systemd)

`/etc/systemd/system/wechselplan-update.service`:

```ini
[Unit]
Description=Wechselplan: Update einspielen
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/wechselplan-update /srv/wechselplan
```

`/etc/systemd/system/wechselplan-update.timer`:

```ini
[Unit]
Description=Wechselplan: nächtliches Update

[Timer]
# Nach dem Backup (01:30) und nach dem Verzeichnisabgleich (02:00).
OnCalendar=*-*-* 03:30:00 Europe/Vienna
Persistent=true

[Install]
WantedBy=timers.target
```

Aktivieren:

```bash
systemctl daemon-reload
```

```bash
systemctl enable --now wechselplan-update.timer
```

Verlauf ansehen:

```bash
journalctl -u wechselplan-update.service
```

Sofort aktualisieren, ohne auf die Nacht zu warten:

```bash
systemctl start wechselplan-update.service
```

> **Kein Watchtower o. Ä. verwenden.** Solche Werkzeuge starten nur Container neu,
> deren Image sich geändert hat. Den `migrate`-Container führen sie nicht erneut aus,
> sodass neuer Code gegen ein altes Datenbankschema laufen würde. Immer
> `docker compose up -d` verwenden, wie im Skript oben.

Möchten Sie Updates lieber von Hand freigeben, lassen Sie den Timer weg und starten
den Service bei Bedarf selbst.

### 5.4 Änderungen an der Compose-Datei

Das Skript tauscht nur das Image aus, nicht `docker-compose.yaml`. Kündigt die HTL
Braunau eine geänderte Compose-Datei oder neue Umgebungsvariablen an, ersetzen Sie
die Datei, ergänzen die `.env` und führen `wechselplan-update` aus. Halten Sie sich
dazu an die Release-Hinweise.

### 5.5 Bestimmte Version festhalten

```bash
# in .env
APP_IMAGE=ghcr.io/htl-braunau-it/wechselplan:sha-<40-stelliger-commit>
```

Dann `wechselplan-update` ausführen. Zurück zum normalen Kanal kommen Sie, indem Sie
wieder `:stable` eintragen.

---

## 6. Backups und Wiederherstellung

### 6.1 Nächtliches Backup

Zusätzlich zum Backup vor jedem Update sichert ein nächtlicher Dump.
`/usr/local/bin/wechselplan-backup` (`chmod 755`):

```bash
#!/bin/bash
set -euo pipefail
STACK_DIR=${1:?usage: wechselplan-backup <stack-verzeichnis>}
RETENTION_DAYS=${RETENTION_DAYS:-30}
cd "$STACK_DIR"
[ -n "$(docker compose ps -q db 2>/dev/null)" ] || { echo "[backup] keine db"; exit 0; }
OUT="backups/nightly-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${OUT}.partial"
mv "${OUT}.partial" "$OUT"
find backups -name 'nightly-*.dump' -mtime +"${RETENTION_DAYS}" -delete
find backups -name '*.partial' -mtime +1 -delete
```

Für die Zeitsteuerung legen Sie `wechselplan-backup.service` und
`wechselplan-backup.timer` analog zu 5.3 an, mit `OnCalendar=*-*-* 01:30:00 Europe/Vienna`.
Das Backup läuft damit vor dem Abgleich um 02:00, sodass ein fehlerhafter Abgleich
rückgängig gemacht werden kann.

**Außerhalb des Servers sichern:** `/srv/wechselplan/backups`, die `.env` und
insbesondere `NEXTAUTH_SECRET`. Ohne dieses Secret sind verschlüsselt gespeicherte
Zugangsdaten in der Datenbank nach einer Wiederherstellung unbrauchbar.

### 6.2 Wiederherstellen

```bash
cd /srv/wechselplan
docker compose stop web
docker compose exec -T db psql -U wechselplan -d postgres \
  -c 'DROP DATABASE wechselplan;' -c 'CREATE DATABASE wechselplan;'
docker compose exec -T db pg_restore -U wechselplan -d wechselplan --no-owner \
  < backups/<datei>.dump
docker compose up -d
```

Ist eine **Migration** der Grund für die Wiederherstellung, gehen Sie so vor:

1. Das `pre-update-*`-Backup dieses Updates einspielen.
2. Die vorherige Version festhalten (5.5).
3. Die HTL Braunau informieren.

Der automatische Rollback im Update-Skript fasst die Datenbank bewusst nicht an.
Sonst gingen alle Eingaben seit dem Backup verloren.

---

## 7. Betrieb

```bash
cd /srv/wechselplan
docker compose ps                          # Zustand aller Container
docker compose logs -f web                 # App-Log
docker compose logs migrate                # warum ein Update fehlschlug
docker compose logs sync-scheduler         # nächtlicher Abgleich
curl -s localhost:3000/api/health          # App + Datenbank erreichbar?
```

Nach Änderungen an der `.env`:

```bash
docker compose up -d
```

### Häufige Probleme

| Symptom | Ursache |
|---|---|
| App startet nicht, Log nennt fehlende Variable | Pflichtwert in `.env` fehlt (Abschnitt 3) |
| Login: Fehler `AADSTS50011` | Umleitungs-URI in Entra stimmt nicht mit `NEXTAUTH_URL` überein |
| Login abgewiesen | Person ist weder in der Lehrergruppe noch in einer abgeglichenen Klassengruppe |
| Login geht, aber alle Rollen „user“ | Admin-Consent fehlt oder `ENTRA_TEACHER_GROUP_ID` falsch |
| Plötzlich kein Login/Abgleich mehr | Client-Secret abgelaufen (2.1) |
| Abgleich bricht mit „deactivation ratio“ ab | Schutzschalter hat gegriffen: Gruppen in Entra prüfen, nicht den Grenzwert erhöhen |
| `docker compose pull`: `denied` / `unauthorized` | Registry-Login fehlt oder Token abgelaufen (4.1) |
| `web` startet nach Update nicht | `docker compose logs migrate`, dann HTL Braunau kontaktieren |

---

## 8. Kontakt

Bei Fragen zu Updates oder fehlgeschlagenen Migrationen wenden Sie sich an
die IT der HTL Braunau. Schicken Sie die Ausgabe von `docker compose logs migrate web`
und den verwendeten Image-Tag mit.
