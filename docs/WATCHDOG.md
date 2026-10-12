# Process restart watchdog

`npm run start:watchdog` supervises the Emika process locally. Unexpected exit or spawn errors cause capped exponential delay (1-60 seconds). Ten failures in ten minutes are allowed; a further failure opens the restart circuit and exits with a clear operator-review message rather than hammering invalid credentials indefinitely. Five minutes of stable operation resets the backoff. SIGINT/SIGTERM stop the child and pending restart timer.

Use one supervisor. Docker Compose already has `restart: unless-stopped`; do not stack the local watchdog inside another restart manager. No host has been started and the Docker image has not been built. Four mocked lifecycle tests cover crash backoff/circuit, duplicate events, spawn errors and intentional shutdown. A watchdog restarts a process; it does not guarantee uptime, repair bad configuration, keep a free host awake or prevent provider outages.

Service event handlers must still contain errors. The giveaway scheduler now catches top-level storage failures without escaping its tick. Music/provider-specific failure handling and live restart tests remain work.
