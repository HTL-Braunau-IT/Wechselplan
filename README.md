# Wechselplan

Wechselplan ist eine Schulverwaltungs-App für berufsbildende höhere Schulen
(HTL). Sie verwaltet:

- **Wechselpläne:** Turnuspläne mit rotierenden Schülergruppen, inklusive
  PDF-Export.
- **Klassen- und Lehrerlisten:** abgeglichen mit Microsoft Entra ID.
- **Notenerfassung:** Noten und Notensammler, mit optionaler Übertragung an das
  Notenmanagement.

Entwickelt und betrieben von der HTL Braunau. Diese Seite beschreibt, wie eine
Schule Wechselplan **auf dem eigenen Server** betreibt. Hinweise für die
Entwicklung stehen in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

**Inhalt:**
[1. Voraussetzungen](#1-voraussetzungen) ·
[2. Microsoft Entra ID](#2-microsoft-entra-id) ·
[3. Installation](#3-installation) ·
[4. Erste Anmeldung](#4-erste-anmeldung-und-erster-abgleich) ·
[5. Automatische Updates](#5-automatische-updates) ·
[6. Backups](#6-backups-und-wiederherstellung) ·
[7. Betrieb](#7-betrieb-und-häufige-probleme)

Wechselplan wird als fertiges Docker-Image ausgeliefert. Sie bauen nichts selbst:
Ihr Server holt neue Versionen aus der GitHub Container Registry und spielt sie
ein, inklusive Datenbank-Migrationen.

---

## 1. Voraussetzungen

| | |
|---|---|
| Server | Linux-VM oder LXC (bei LXC: `nesting=1,keyctl=1`), 2–4 Kerne, 4 GB RAM, 30 GB Speicher reichen für eine Schule |
| Software | Docker Engine ≥ 24 mit Compose-Plugin (`docker compose version`), `curl` |
| Netzwerk ausgehend | `ghcr.io`, `raw.githubusercontent.com`, `api.github.com`, `login.microsoftonline.com`, `graph.microsoft.com`, optional Notenmanagement |
| Netzwerk eingehend | HTTPS über Ihren Reverse Proxy (nginx, Traefik, Caddy …). Die App selbst spricht nur HTTP auf Port 3000. |
| DNS + Zertifikat | z. B. `wechselplan.ihre-schule.at` |
| Microsoft 365 | Entra-ID-Tenant, in dem Sie App-Registrierungen anlegen und Admin-Consent erteilen dürfen |

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

## 3. Installation

Alle Befehle als root. Die benötigten Dateien liegen in diesem Repository und
werden direkt von GitHub geladen.

### 3.1 Dateien holen

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/Wechselplan/main
mkdir -p /srv/wechselplan/{postgres,data,backups}
chown 1001:1001 /srv/wechselplan/data
cd /srv/wechselplan
curl -fsSL "$REPO/docker-compose.yaml"        -o docker-compose.yaml
curl -fsSL "$REPO/self-hosting/env.example"   -o .env
chmod 600 .env
```

| Datei im Repository | Zweck |
|---|---|
| [`docker-compose.yaml`](docker-compose.yaml) | Der Stack (siehe unten) |
| [`self-hosting/env.example`](self-hosting/env.example) | Vorlage für `.env`, kommentiert |
| [`self-hosting/wechselplan-update.sh`](self-hosting/wechselplan-update.sh) | Update-Skript (Abschnitt 5) |
| [`docker/pg-backup.sh`](docker/pg-backup.sh) | Backup-Skript (Abschnitt 6) |
| [`self-hosting/systemd/`](self-hosting/systemd) | Zeitsteuerung für Update und Backup |

Der Stack besteht aus vier Containern:

| Container | Aufgabe |
|---|---|
| `db` | PostgreSQL 15, deutsche Sortierung (ICU `de-AT`) |
| `migrate` | Läuft einmal pro Start, spielt Datenbank-Migrationen ein und beendet sich |
| `web` | Die Anwendung. Startet erst, wenn `migrate` fehlerfrei beendet wurde. |
| `sync-scheduler` | Ruft täglich um 02:00 (Europe/Vienna) den Verzeichnisabgleich auf |

### 3.2 Konfiguration (`.env`)

Füllen Sie `/srv/wechselplan/.env` aus. Die Vorlage erklärt jeden Wert. Zufallswerte
erzeugen Sie so:

```bash
openssl rand -base64 48
```

**Pflicht:**

| Variable | Inhalt |
|---|---|
| `NEXTAUTH_URL` | Öffentliche Adresse, z. B. `https://wechselplan.ihre-schule.at` |
| `NEXTAUTH_SECRET` | Zufallswert. **Nach dem ersten Start nie mehr ändern** – daraus wird auch der Schlüssel für verschlüsselt gespeicherte Passwörter abgeleitet. Gut sichern! |
| `POSTGRES_PASSWORD` | Zufallswert |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Aus Abschnitt 2.1 |
| `ENTRA_TEACHER_GROUP_ID`, `ENTRA_SUPER_ADMIN_OBJECT_ID` | Aus Abschnitt 2.3 |
| `SYNC_TRIGGER_SECRET` | Zufallswert; schützt den nächtlichen Abgleich |

**Optional:**

| Variable | Inhalt |
|---|---|
| `NOTENMANAGEMENT_BASE_URL` | Nur wenn Ihre Schule das Notenmanagement-System nutzt. Leer lassen blendet die Notenübertragung aus. |
| `GRAPH_*` | E-Mail-Versand (2.4) |
| `AUTH_BEARER_ENABLED` | Mobile App (2.5) |

Fehlt ein Pflichtwert, startet die App nicht. `docker compose logs web` nennt die
fehlende Variable. Setzen Sie Werte nicht in Anführungszeichen.

### 3.3 Erster Start

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

### 3.4 Reverse Proxy

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

Die Compose-Datei veröffentlicht Port 3000 auf allen Netzwerkschnittstellen. Läuft
der Proxy auf demselben Host, sperren Sie Port 3000 per Firewall nach außen, damit
die App nicht unverschlüsselt im LAN erreichbar ist.

---

## 4. Erste Anmeldung und erster Abgleich

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
Zugang zu Ihrem Netz.

### 5.1 Update-Kanäle

| Tag | Inhalt | Empfehlung |
|---|---|---|
| `stable` | nur veröffentlichte Releases | **für Schulbetrieb empfohlen** |
| `latest` | jeder erfolgreiche Build auf `main` | nur nach Absprache, häufige Updates |
| `v0.3.0` o. ä. | genau ein Release | zum Festnageln |
| `sha-<commit>` | genau ein bestimmter Stand | zum Festnageln oder Zurückrollen |

Den Kanal legen Sie über `APP_IMAGE` in der `.env` fest, z. B.
`APP_IMAGE=ghcr.io/htl-braunau-it/wechselplan:stable`.

### 5.2 Was das Update-Skript tut

[`self-hosting/wechselplan-update.sh`](self-hosting/wechselplan-update.sh):

1. Holt die **zum Kanal passende** `docker-compose.yaml` aus diesem Repository.
   Bei `stable` ist das der Stand des neuesten Releases, bei `latest` der Stand
   von `main`. Die neue Datei wird nur übernommen, wenn sie mit Ihrer `.env`
   funktioniert. Braucht sie eine neue Pflichtvariable, bricht das Skript ab,
   ohne etwas zu ändern, und legt die neue Datei als `docker-compose.yaml.new` ab.
2. Holt das neue Image. Gibt es nichts Neues, endet es hier.
3. Sichert die Datenbank (`backups/pre-update-*.dump`, 14 Tage aufbewahrt).
4. Startet den Stack neu. `migrate` spielt die Migrationen ein, erst dann startet
   `web`.
5. Prüft `/api/health` bis zu 150 Sekunden lang. Schlägt das fehl, rollt es auf
   das vorherige Image und die vorherige Compose-Datei zurück.

Haben Sie `docker-compose.yaml` selbst angepasst, setzen Sie
`WECHSELPLAN_SYNC_COMPOSE=false` in der `.env`. Dann ersetzt das Skript die Datei
nie; Änderungen übernehmen Sie anhand der Release-Hinweise selbst.

### 5.3 Einrichten

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/Wechselplan/main
curl -fsSL "$REPO/self-hosting/wechselplan-update.sh" -o /usr/local/bin/wechselplan-update
chmod 755 /usr/local/bin/wechselplan-update
for u in wechselplan-update.service wechselplan-update.timer; do
  curl -fsSL "$REPO/self-hosting/systemd/$u" -o "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now wechselplan-update.timer
```

Das Update läuft dann jede Nacht um 03:30: nach dem Backup (01:30) und nach dem
Verzeichnisabgleich (02:00). Liegt Ihr Stack nicht unter `/srv/wechselplan`,
passen Sie den Pfad in `wechselplan-update.service` an.

Verlauf ansehen:

```bash
journalctl -u wechselplan-update.service
```

Sofort aktualisieren:

```bash
systemctl start wechselplan-update.service
```

Möchten Sie Updates lieber von Hand freigeben, lassen Sie den Timer weg und starten
den Service bei Bedarf selbst.

> **Kein Watchtower o. Ä. verwenden.** Solche Werkzeuge starten nur Container neu,
> deren Image sich geändert hat. Den `migrate`-Container führen sie nicht erneut aus,
> sodass neuer Code gegen ein altes Datenbankschema laufen würde.

### 5.4 Bestimmte Version festhalten

In der `.env`:

```dotenv
APP_IMAGE=ghcr.io/htl-braunau-it/wechselplan:v0.3.0
```

Dann `systemctl start wechselplan-update.service`. Zurück zum normalen Kanal kommen
Sie, indem Sie wieder `:stable` eintragen.

---

## 6. Backups und Wiederherstellung

### 6.1 Nächtliches Backup

Zusätzlich zum Backup vor jedem Update sichert ein nächtlicher Dump um 01:30. Die
Dumps werden 30 Tage aufbewahrt.

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/Wechselplan/main
curl -fsSL "$REPO/docker/pg-backup.sh" -o /usr/local/bin/wechselplan-backup
chmod 755 /usr/local/bin/wechselplan-backup
for u in wechselplan-backup.service wechselplan-backup.timer; do
  curl -fsSL "$REPO/self-hosting/systemd/$u" -o "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now wechselplan-backup.timer
```

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
2. Die vorherige Version festhalten (5.4).
3. Die HTL Braunau informieren.

Der automatische Rollback im Update-Skript fasst die Datenbank bewusst nicht an.
Sonst gingen alle Eingaben seit dem Backup verloren.

---

## 7. Betrieb und häufige Probleme

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

| Symptom | Ursache |
|---|---|
| App startet nicht, Log nennt fehlende Variable | Pflichtwert in `.env` fehlt (3.2) |
| Login: Fehler `AADSTS50011` | Umleitungs-URI in Entra stimmt nicht mit `NEXTAUTH_URL` überein |
| Login abgewiesen | Person ist weder in der Lehrergruppe noch in einer abgeglichenen Klassengruppe |
| Login geht, aber alle Rollen „user“ | Admin-Consent fehlt oder `ENTRA_TEACHER_GROUP_ID` falsch |
| Plötzlich kein Login/Abgleich mehr | Client-Secret abgelaufen (2.1) |
| Abgleich bricht mit „deactivation ratio“ ab | Schutzschalter hat gegriffen: Gruppen in Entra prüfen, nicht den Grenzwert erhöhen |
| `docker compose pull` schlägt fehl | Kein ausgehender Zugriff auf `ghcr.io` (Firewall/Proxy) |
| Update bricht ab: „neue docker-compose.yaml passt nicht zur .env“ | Neue Pflichtvariable, siehe Release-Hinweise; dann Update erneut starten |
| `web` startet nach Update nicht | `docker compose logs migrate`, dann HTL Braunau kontaktieren |

### Kontakt

Fragen, Fehler und Wünsche bitte als
[Issue auf GitHub](https://github.com/HTL-Braunau-IT/Wechselplan/issues). Bei
fehlgeschlagenen Updates bitte die Ausgabe von `docker compose logs migrate web`
und den verwendeten Image-Tag mitschicken.
