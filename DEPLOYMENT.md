# Deployment

Deployment is prepared, not performed or verified.

## Persistent container

`Dockerfile` uses Node 22 Debian slim and an unprivileged runtime user. `compose.yaml` attaches a persistent named volume to `/app/var`.

```sh
docker compose build
docker compose up -d
docker compose logs --tail=100 luna
```

Keep `.env` outside version control. Use an instance with outbound access to Discord's gateway and REST API. Do not expose a port unnecessarily; this bot has no web dashboard.

## Hosted service

Use one replica, secret environment variables, supported Node LTS, start command `npm start`, and a durable volume. Set `DATABASE_PATH` to the actual mounted location with write access. Do not deploy on a host that sleeps if scheduled features need timely execution. Do not promise free hosting; confirm current costs before buying a service. No Railway account changes are included in this phase.

## Backup and recovery

Use SQLite's online backup API or stop the bot cleanly before copying the database. Do not copy only the main SQLite file while WAL writes are active. Store backups privately; guild/user IDs and moderation data may be sensitive. Verify recovery into a separate instance before trusting backups. Only one instance should connect with the same token and write this database.

## CI

The GitHub Actions workflow runs npm ci, syntax checks, local tests, inventory export/diff, command registration preview and dependency audit on Node 22 and 24. It needs no token. The workflow has not run on GitHub because the public `coldy` repo is not created/pushed yet.
