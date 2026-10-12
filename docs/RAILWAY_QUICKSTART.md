# Railway quickstart / Railway par Emika chalana

Prepared instructions,not a verified Railway deployment. Railway is not promised free;check the account's actual plan,credits,volume cost before deploying. Emika must be its own service/project,not Koki/FortiX. One instance only.

1. Railway mein New Project -> Deploy from GitHub Repo -> `1nonlyhckrr-hue/coldy` select karo. Root `/` rakho. Repo's Dockerfile uses Node22;do not override it with old Node. Build uses `npm ci --omit=dev`;start is `node src/index.js` (or `npm start`). No HTTP port/domain/healthcheck required for this gateway worker.
2. Add a persistent volume mounted at `/app/var`. Use `DATABASE_PATH=/app/var/luna.sqlite`. Docker runs as user `node`;ensure mounted directory is writable by that user. If permission denied,set volume ownership/permissions through an authorized Railway setup step,not a world-writable workaround. Without durable writable storage,do not call schedules/settings persistent.
3. Railway Variables mein set karo:
   - `DISCORD_TOKEN`:Emika's exact token from Discord Developer Portal,secret variable only. Never put it in GitHub,chat,README,logs or build args.
   - `DISCORD_CLIENT_ID=1556357674663153694`
   - `OWNER_IDS`:Aryan's Discord user ID,not bot/client ID. Multiple IDs comma-separated.
   - `DISCORD_GUILD_ID`:exact Cuties server ID for guild-command registration;do not guess it from server name.
   - `DATABASE_PATH=/app/var/luna.sqlite`,`NODE_ENV=production`,`LOG_LEVEL=info`.
   - Leave `ENABLE_MUSIC=false` and `MUSIC_RISK_ACCEPTED=false` unless the node below is verified. Other event flags default false. Enabling message/member events requires corresponding privileged intents in Developer Portal. Voice events require `ENABLE_VOICE_EVENTS=true`.
4. Install Emika using the Developer Portal OAuth2 URL generator:scopes `bot` + `applications.commands`,only needed permissions,correct Cuties server. Don't grant Administrator just to avoid diagnostics. Bot's role must be above roles/members it should manage. This repo has no confirmed install/server access yet.
5. Register slash commands once with the same env:locally `npm ci` then `npm run register:guild`;or Railway service shell using `node scripts/register.js --apply`. Docker now contains scripts. This REPLACES that exact guild's commands for this application;verify app/guild IDs first. No global registration and no registration every startup.
6. Deploy,and inspect logs for `Emika ready`. Confirm exact Emika bot online in Cuties,try `/ping`,`/help`,then feature permissions in an isolated test channel. `Login failed` means token/connectivity check,not a working bot. Missing privileged intent causes gateway rejection;keep the flag false until granted. No real-token/live verification has been performed by this build.

## Experimental music

Owner chose risky free public-node YouTube route. Source ToS/takedown/availability risks remain;paying for hosting does not license songs. No promise that every Bollywood track works.

Set `ENABLE_MUSIC=true`,`MUSIC_RISK_ACCEPTED=true`,`ENABLE_VOICE_EVENTS=true`,and operator-chosen `LAVALINK_URL=verified-host:443`,`LAVALINK_AUTH=<node password>` in secret variables. TLS only,stableLavalink4.2+ and YouTube source required. Do not insert Discord bot token as node password. Public node receives voice session credentials needed for playback once deployed;do not use unknown endpoints or forward provider raw errors.

First researched node `lavalinkv4.serenetia.com` returned opaque0.0 snapshot version,so currently FAILS compatibility guard. Do not enable it or bypass guard based only on 'v4' badge. Configure a verifiable compatible node first. Commands exist but live audio is unverified. Search words/exact11-character video IDs only,no arbitrary URLs/playlists/live streams. Queue capped50,session in-memory,restart loses it. `/music stay enabled:true` holds idle connection while process/provider healthy;not24/7 uptime guarantee. Provider failure freezes queue until explicit stop/review,no uncontrolled retries.

Official hosting references:
https://docs.railway.com/guides/volumes
https://docs.railway.com/guides/dockerfiles
Music protocol/source references:docs/MUSIC_CORE.md.

### Candidate version checked,not automatically selected

LiveREST `https://lavalink.nazha.online/v4/info` checkedOctober11,2026 15:32IST:stable4.2.2 +YouTube,passes existing strictguard. Publiclisting:https://lavalink.darrennathanael.com/SSL/Lavalink-SSL/ . Candidateonly:providertrust/publicnodeterms/privacy,SLA,websocket/client/playbackremainunverified. No config oractivation applied. Do not treat its ownbot'sfreeclaim as an audio-node SLA. Keepflagsfalse untiloperator selectsprovider and completes live isolatedtest. Never send bot token to node;necessary voice session data is still sensitive.

### Offline preflight

Aftersettingenv,run `npm run doctor` before registration/deploy. Failure reports fieldnames/constant diagnostics,not secrets. Verifies supportedNode,configuration shapes,registry and guildIDpresence only;no login/network/registration/provider/database/volumewrite. Passing is NOT live readiness. You muststill verifytoken/intents/permissions/provider/volume using separate isolatedactualtests.
