import pino from 'pino';
export function createLogger(level = 'info', destination) {
  return pino(
    {
      level,
      base: { app: 'emika' },
      redact: {
        paths: [
          'token',
          'password',
          'authorization',
          'config.token',
          '*.token',
          '*.password',
          '*.authorization',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}
