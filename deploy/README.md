# Running the RIGHTSKU API on a VPS

One small Linux server (4 GB RAM, Ubuntu 24.04) runs everything with Docker:

```
Android app --HTTPS--> api.rightsku.com
                        |
                 Caddy (ports 80/443 only; free automatic HTTPS)
                        |
                 backend (Spring Boot, Java 25; no public port)
                        |
                 PostgreSQL 16 (internal network only; no public port, no internet)
                        |
         nightly encrypted backup --> off-server storage (rclone)
```

All employee data, including documents, payslips and photos, is inside
PostgreSQL. The database backup is the only thing that must be kept safe.

| File | What it is |
|---|---|
| `docker-compose.yml` | The three services and their networks |
| `Caddyfile` | HTTPS, security headers, blocks `/actuator/*` from the internet |
| `.env.example` | Every setting, with placeholders. Copy to `.env` **on the server only** |
| `backup.sh` | Nightly encrypted backup and off-server copy |
| `restore.sh` | Check a backup in a scratch database, or restore it |
| `../backend/Dockerfile` | Builds the backend image (runs as a non-root user) |

---

## 1. Prepare the server (once)

1. **Admin login and firewall.**
   - Log in with an SSH key, then turn off password login: set `PasswordAuthentication no` in `/etc/ssh/sshd_config`, then run `sudo systemctl restart ssh`.
   - Turn on the firewall: `sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw enable`
   - Turn on automatic security updates: `sudo apt install unattended-upgrades`
2. **Install Docker** Engine and the Compose plugin, from Docker's official Ubuntu instructions.
3. **DNS:** at the domain registrar, add an `A` record `api` -> the server's IP address. Wait until `nslookup api.rightsku.com` shows that IP.
4. **Get the code:** `git clone https://github.com/VAMSIRAJ-0131/rightsku-employee-app.git`. Use a read-only deploy key if the repository is private.

## 2. Configure

```bash
cd rightsku-employee-app/deploy
cp .env.example .env && chmod 600 .env
openssl rand -hex 32   # run twice: one value for POSTGRES_PASSWORD, one for JWT_SECRET
nano .env              # fill in the values; set ACME_EMAIL
```

- **Never `export`** `JWT_SECRET`, `DB_PASSWORD` or `POSTGRES_PASSWORD` in the
  server's shell or profile. Docker Compose lets shell variables override `.env`,
  so an old value there would silently win.
- **Never copy `.env` anywhere else**: not into Git, chat or email. It and the backups
  are the keys to all employee data.

## 3. First start

1. **Create the HR Admin account** (`hr@rightsku.com`, one time only). In `.env`, set
   `HR_ADMIN_BOOTSTRAP_ENABLED=true` and `HR_ADMIN_BOOTSTRAP_PASSWORD=<strong temporary password>`.
2. **Build and start:**

   ```bash
   docker compose up -d --build
   docker compose ps                       # all three: Up; backend (healthy)
   docker compose logs backend | grep -E "Successfully applied|HR Admin bootstrap"
   ```

   The log must say that 13 migrations were applied, and that the HR Admin was created.
3. **Switch the bootstrap off.** Sign in once in the app as HR. Then set
   `HR_ADMIN_BOOTSTRAP_ENABLED=false`, delete the password line, and run
   `docker compose up -d`.
4. **Check from your PC:**
   - `https://api.rightsku.com/api/hr/employees` shows **401**. That means HTTPS works and sign-in is required.
   - `https://api.rightsku.com/actuator/health` shows **404**. That means it is blocked from the internet.
5. **Check that the login limit sees real phone addresses.** Sign in from a phone on mobile data, then run
   `docker compose logs caddy | grep -o '"remote_ip":"[^"]*"' | sort -u`.
   It must show public addresses, not just `172.x.x.x`. If it shows only `172.x`,
   every user shares one address, so 30 wrong passwords anywhere would lock everyone out for 15 minutes.
   Fix Docker's address handling before going live.

## 4. Backups (set up before staff use the app)

1. **On your own PC (not the server),** create a GPG key used only for backups,
   for example with Kleopatra (Gpg4win). Keep the **private** key and its
   passphrase offline: in a password manager, plus a USB drive. Export only the **public** key.
2. **On the server:**
   - Run `sudo apt install gnupg rclone`.
   - Import the public key with `gpg --import backup-public.asc`.
   - Put its fingerprint in `BACKUP_GPG_RECIPIENT` in `.env`.
3. **Off-server storage:** create a free Cloudflare R2 or Backblaze B2 bucket. Run
   `rclone config` and name the remote, for example `r2`. Then set
   `BACKUP_RCLONE_REMOTE=r2:rightsku-backups` in `.env`.
4. **Test it once by hand:** run `./backup.sh`. It must end with `OK`, and the file must appear in the bucket.
5. **Run it nightly** at 02:00 (server time). Run `crontab -e` and add:

   ```
   0 2 * * * /home/<user>/rightsku-employee-app/deploy/backup.sh >> /home/<user>/rightsku-backup.log 2>&1
   ```

   Check the log weekly: `tail -5 ~/rightsku-backup.log`.

The server can create backups but **cannot read them**. Only your private key can.

## 5. Restoring

**Test once a month** with the latest backup, and always after changing the backup setup:

1. Download a backup file from the bucket to your PC.
2. Decrypt it there: `gpg --decrypt rightsku-<time>.dump.gpg > restore.dump`
3. Copy `restore.dump` to the server's `deploy/` folder, then run:

   ```bash
   ./restore.sh restore.dump
   ```

   This restores into a **scratch** database, `rightsku_restore_check`, and prints
   the number of migrations (it must be 13), users, employees, documents and so on. The live
   database is not touched.
4. Delete `restore.dump` afterwards. It is unencrypted salary data.

**Real recovery** (data lost or damaged): follow the same steps, then run:

```bash
./restore.sh restore.dump --replace     # type REPLACE when asked
```

This stops the backend and keeps the damaged database as
`rightsku_before_restore_<time>`; it is renamed, **not deleted**. It then makes the backup the
live database and starts the backend again. Once the app is confirmed working, drop the old copy
with the command the script prints.

**Server lost completely:** set up a new server (sections 1-2) using the **same `JWT_SECRET`**,
so sign-ins keep working. A new value only signs everyone out. Run `docker compose up -d --build`,
restore with `--replace`, and point DNS at the new IP.

## 6. Updating the app

On your PC first: run the backend tests (`.\mvnw.cmd test`) and push. Then, on the server:

```bash
./backup.sh                       # always back up before an update
git pull
docker compose up -d --build      # new migrations run automatically at start
docker compose ps                 # backend (healthy)
```

## Useful commands

```bash
docker compose ps                          # status
docker compose logs -f --tail 100 backend  # backend log
docker compose restart caddy               # apply Caddyfile changes (admin API is off)
docker compose exec backend curl -s http://localhost:8080/actuator/health   # {"status":"UP"}
```
