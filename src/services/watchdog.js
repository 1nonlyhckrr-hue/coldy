import { spawn } from 'node:child_process';
export class RestartPolicy {
  constructor({ now = Date.now, maxCrashes = 10, windowMs = 600000, stableMs = 300000 } = {}) {
    if (
      typeof now !== 'function' ||
      !Number.isSafeInteger(maxCrashes) ||
      maxCrashes < 1 ||
      maxCrashes > 1000 ||
      !Number.isSafeInteger(windowMs) ||
      windowMs < 1 ||
      windowMs > 86400000 ||
      !Number.isSafeInteger(stableMs) ||
      stableMs < 1 ||
      stableMs > 86400000
    )
      throw new TypeError('Invalid restart policy');
    this.now = now;
    this.maxCrashes = maxCrashes;
    this.windowMs = windowMs;
    this.stableMs = stableMs;
    this.crashes = [];
    this.attempt = 0;
  }
  next(runtimeMs) {
    const now = this.now();
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(runtimeMs) || runtimeMs < 0)
      return null;
    if (runtimeMs >= this.stableMs) this.attempt = 0;
    this.crashes = this.crashes.filter((t) => now - t < this.windowMs);
    this.crashes.push(now);
    if (this.crashes.length > this.maxCrashes) return null;
    return Math.min(60000, 1000 * 2 ** Math.min(this.attempt++, 6));
  }
}
export function runWatchdog({
  spawnChild = spawn,
  policy = new RestartPolicy(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
  report = console.error,
  exit = (code) => (process.exitCode = code),
} = {}) {
  let child = null,
    timer = null,
    stopping = false,
    startedAt = 0;
  const start = () => {
    if (stopping) return;
    try {
      startedAt = now();
    } catch {
      startedAt = NaN;
    }
    if (!Number.isSafeInteger(startedAt)) {
      report('Emika process clock unavailable. Operator review required.');
      stopping = true;
      exit(1);
      return;
    }
    let settled = false;
    const ended = () => {
      if (settled) return;
      settled = true;
      child = null;
      if (stopping) return;
      let delay;
      try {
        delay = policy.next(now() - startedAt);
      } catch {
        delay = null;
      }
      if (!Number.isSafeInteger(delay) || delay < 1 || delay > 60000) {
        report('Emika restart circuit opened after repeated failures. Operator review required.');
        stopping = true;
        exit(1);
        return;
      }
      report(`Emika process stopped. Restarting in ${delay} ms.`);
      try {
        timer = setTimer(() => {
          timer = null;
          start();
        }, delay);
      } catch {
        report('Emika restart timer unavailable. Operator review required.');
        stopping = true;
        exit(1);
      }
    };
    try {
      child = spawnChild(process.execPath, [new URL('../index.js', import.meta.url).pathname], {
        stdio: 'inherit',
        env: process.env,
      });
      child.once('exit', ended);
      child.once('error', ended);
    } catch {
      ended();
    }
  };
  const stop = (signal) => {
    stopping = true;
    if (timer) {
      try {
        clearTimer(timer);
      } catch {
        report('Emika restart timer cancellation unavailable. Operator review required.');
        exit(1);
      }
    }
    timer = null;
    if (child) {
      try {
        if (child.kill(signal ?? 'SIGTERM') === false) {
          report('Emika child shutdown signal was not accepted. Operator review required.');
          exit(1);
        }
      } catch {
        report('Emika child shutdown signal unavailable. Operator review required.');
        exit(1);
      }
    }
  };
  start();
  return { stop, isStopped: () => stopping };
}
