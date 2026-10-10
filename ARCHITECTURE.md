# Architecture

## Layout

- `src/commands/<category>/`: original command modules, exporting data/category/execute.
- `src/events/`: event dispatch, shared error handling.
- `src/services/`: command registry and bounded cooldown service.
- `src/database/`: transactional versioned migration, guild settings repository.
- `src/utils/`: permissions, hierarchy checks, sanitized logging and errors.
- `src/config/`: strict environment validation.
- `scripts/`: syntax checks, inventory export, preview/test-guild registration.
- `test/`: Node test runner; mocks and real temporary SQLite databases.
- `data/`: reference inventory, schema, evidence, coverage status, category taxonomy.

## SQLite v1 decision

Use better-sqlite3 and WAL for one bot process on one persistent disk. It removes a separate database service and works within a small resource budget. This does not make hosting free. Ephemeral disks will lose state; a durable volume and backups are required. SQLite is not a multi-host or multi-replica database. Migrate to PostgreSQL before multiple writers or large/high-write deployment.

Guild settings, moderation cases and scheduled job tables are present. Moderation and job execution are not implemented merely because their tables exist. Future schedulers must claim due jobs transactionally, handle recovery from running-state crashes, and use idempotent external effects. Persistent tables alone do not guarantee exactly-once posting.

## Safe command dispatch

Guild scope, owner gate when declared, user permissions, bot permissions, cooldown, execution, centralized sanitized error response. Slash defaults and runtime checks are complementary. Moderation requires separate target/hierarchy checks inside the command before action.

## Command scale

Discord allows 100 top-level global chat-input commands and at most 25 options per command/group. A 541-path product needs grouped subcommands and honest counts, not 541 top-level registrations. Alias counts, menu buttons, option combinations and base commands must be reported separately. Current registration deliberately contains four top-level commands only.

## Stability

Client errors are logged without raw payloads. Fatal programming errors shut down rather than continue in an unknown state. SIGTERM/SIGINT close Discord and SQLite. Deployment supervision can restart the process; a restart does not certify that a failed operation completed.
