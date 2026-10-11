import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RestartPolicy, runWatchdog } from '../src/services/watchdog.js';
test('restart policy backs off, resets after stable run and trips crash loops', () => {
  let now = 0;
  const p = new RestartPolicy({ now: () => now, maxCrashes: 3 });
  assert.equal(p.next(0), 1000);
  assert.equal(p.next(0), 2000);
  assert.equal(p.next(300000), 1000);
  assert.equal(p.next(0), null);
  now = 700000;
  assert.equal(p.next(0), 2000);
});
test('watchdog contains spawn errors and duplicate exit/error events', () => {
  let spawns = 0,
    timer,
    exit;
  const e = new EventEmitter();
  e.kill = () => {};
  const w = runWatchdog({
    spawnChild: () => {
      spawns++;
      return e;
    },
    setTimer: (cb) => {
      timer = cb;
      return 1;
    },
    clearTimer: () => {},
    report: () => {},
    exit: (code) => (exit = code),
  });
  e.emit('error', new Error('bad'));
  e.emit('exit', 1);
  assert.equal(spawns, 1);
  timer();
  assert.equal(spawns, 2);
  w.stop();
  assert.equal(exit, undefined);
});
test('watchdog signal shutdown cancels timer and never restarts', () => {
  let spawns = 0,
    cancelled = false,
    killed = false,
    callback;
  const e = new EventEmitter();
  e.kill = () => {
    killed = true;
  };
  const w = runWatchdog({
    spawnChild: () => {
      spawns++;
      return e;
    },
    setTimer: (cb) => {
      callback = cb;
      return 1;
    },
    clearTimer: () => (cancelled = true),
    report: () => {},
  });
  e.emit('exit', 1);
  w.stop();
  callback();
  assert(cancelled);
  assert.equal(spawns, 1);
  assert(w.isStopped());
  assert(!killed);
});
test('synchronous spawn failure uses bounded restart then fails clearly', () => {
  let timer, code;
  const p = new RestartPolicy({ maxCrashes: 1 });
  runWatchdog({
    spawnChild: () => {
      throw new Error('spawn');
    },
    policy: p,
    setTimer: (cb) => {
      timer = cb;
      return 1;
    },
    report: () => {},
    exit: (c) => (code = c),
  });
  timer();
  assert.equal(code, 1);
});

test('restart policy invalid configuration fails before child launch or persistent state', () => {
  for (const changes of [
    { now: 100 },
    { maxCrashes: 0 },
    { maxCrashes: 1.5 },
    { maxCrashes: 1001 },
    { windowMs: 0 },
    { windowMs: Infinity },
    { windowMs: 86400001 },
    { stableMs: 0 },
    { stableMs: '1000' },
  ])
    assert.throws(() => new RestartPolicy(changes), /policy/);
});
test('restart policy nonfinite clock and invalid runtime open circuit without recording bogus crashes', () => {
  let now = 100;
  const p = new RestartPolicy({ now: () => now });
  p.next(0);
  const before = [...p.crashes],
    attempt = p.attempt;
  for (const runtime of [-1, NaN, Infinity, 0.5, '100']) assert.equal(p.next(runtime), null);
  assert.deepEqual(p.crashes, before);
  assert.equal(p.attempt, attempt);
  for (const bad of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    now = bad;
    assert.equal(p.next(0), null);
    assert.deepEqual(p.crashes, before);
  }
});
test('watchdog clock rollback fails closed instead of restarting with invalid negative runtime', () => {
  let now = 100,
    timers = 0,
    code;
  const child = new EventEmitter();
  child.kill = () => {};
  const w = runWatchdog({
    now: () => now,
    policy: new RestartPolicy({ now: () => now }),
    spawnChild: () => child,
    setTimer: () => {
      timers++;
    },
    report: () => {},
    exit: (c) => (code = c),
  });
  now = 99;
  child.emit('exit', 1);
  assert.equal(code, 1);
  assert.equal(timers, 0);
  assert(w.isStopped());
});

test('watchdog failed shutdown signal is contained and never schedules restart', () => {
  for (const kind of ['throw', 'false']) {
    const child = new EventEmitter();
    let code,
      timers = 0,
      reports = [];
    child.kill = () => {
      if (kind === 'throw') throw Error('PRIVATE');
      return false;
    };
    const w = runWatchdog({
      spawnChild: () => child,
      setTimer: () => {
        timers++;
        return 1;
      },
      report: (s) => reports.push(s),
      exit: (c) => (code = c),
    });
    assert.doesNotThrow(() => w.stop());
    assert(w.isStopped());
    assert.equal(code, 1);
    child.emit('exit', 1);
    assert.equal(timers, 0);
    assert(!reports.join('').includes('PRIVATE'));
  }
});
test('watchdog successful shutdown forwards selected signal and stops without restart or error exit', () => {
  const child = new EventEmitter();
  let signal,
    code,
    timers = 0;
  child.kill = (s) => {
    signal = s;
    return true;
  };
  const w = runWatchdog({
    spawnChild: () => child,
    setTimer: () => {
      timers++;
      return 1;
    },
    report: () => {},
    exit: (c) => (code = c),
  });
  w.stop('SIGINT');
  assert.equal(signal, 'SIGINT');
  assert(w.isStopped());
  child.emit('exit', 0);
  assert.equal(timers, 0);
  assert.equal(code, undefined);
});

test('watchdog failed restart timer opens circuit without uncaught error or another spawn', () => {
  const child = new EventEmitter();
  let code,
    spawns = 0,
    reports = [];
  child.kill = () => true;
  const w = runWatchdog({
    spawnChild: () => {
      spawns++;
      return child;
    },
    setTimer: () => {
      throw Error('SECRET');
    },
    report: (s) => reports.push(s),
    exit: (c) => (code = c),
  });
  assert.doesNotThrow(() => child.emit('exit', 1));
  assert.equal(code, 1);
  assert(w.isStopped());
  assert.equal(spawns, 1);
  assert(!reports.join('').includes('SECRET'));
});
test('watchdog timer cancellation failure still prevents queued callback restart and remains stopped', () => {
  const child = new EventEmitter();
  let code,
    spawns = 0,
    callback;
  child.kill = () => true;
  const w = runWatchdog({
    spawnChild: () => {
      spawns++;
      return child;
    },
    setTimer: (cb) => {
      callback = cb;
      return 1;
    },
    clearTimer: () => {
      throw Error('SECRET');
    },
    report: () => {},
    exit: (c) => (code = c),
  });
  child.emit('exit', 1);
  assert.doesNotThrow(() => w.stop());
  callback();
  assert.equal(code, 1);
  assert(w.isStopped());
  assert.equal(spawns, 1);
});

test('watchdog policy or clock errors open circuit without uncaught exit-event error', () => {
  for (const kind of ['policy', 'clock']) {
    const child = new EventEmitter();
    let code,
      timers = 0,
      clockReads = 0;
    child.kill = () => true;
    const w = runWatchdog({
      spawnChild: () => child,
      now: () => {
        if (kind === 'clock' && ++clockReads === 2) throw Error('SECRET');
        return 100;
      },
      policy: {
        next: () => {
          if (kind === 'policy') throw Error('SECRET');
          return 1000;
        },
      },
      setTimer: () => {
        timers++;
      },
      report: () => {},
      exit: (c) => (code = c),
    });
    assert.doesNotThrow(() => child.emit('exit', 1));
    assert.equal(code, 1);
    assert.equal(timers, 0);
    assert(w.isStopped());
  }
});
test('watchdog malformed policy delay cannot start unbounded immediate restart loop', () => {
  for (const delay of [undefined, NaN, Infinity, -1, 0, 1.5, 60001, '1000', null]) {
    const child = new EventEmitter();
    let code,
      timers = 0;
    child.kill = () => true;
    const w = runWatchdog({
      spawnChild: () => child,
      policy: { next: () => delay },
      setTimer: () => {
        timers++;
      },
      report: () => {},
      exit: (c) => (code = c),
    });
    child.emit('exit', 1);
    assert.equal(code, 1);
    assert.equal(timers, 0);
    assert(w.isStopped());
  }
});
test('watchdog accepts bounded delay endpoints and schedules only one timer for duplicate events', () => {
  for (const delay of [1, 60000]) {
    const child = new EventEmitter();
    let timers = 0,
      recorded;
    child.kill = () => true;
    const w = runWatchdog({
      spawnChild: () => child,
      policy: { next: () => delay },
      setTimer: (_cb, d) => {
        timers++;
        recorded = d;
        return 1;
      },
      clearTimer: () => {},
      report: () => {},
    });
    child.emit('exit', 1);
    child.emit('error', Error('duplicate'));
    assert.equal(timers, 1);
    assert.equal(recorded, delay);
    w.stop();
  }
});

test('watchdog invalid initial clock never launches a child or restart timer', () => {
  for (const value of [NaN, Infinity, -Infinity, 0.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
    let spawns = 0,
      timers = 0,
      code;
    const w = runWatchdog({
      now: () => value,
      spawnChild: () => {
        spawns++;
      },
      setTimer: () => {
        timers++;
      },
      report: () => {},
      exit: (c) => (code = c),
    });
    assert(w.isStopped());
    assert.equal(spawns, 0);
    assert.equal(timers, 0);
    assert.equal(code, 1);
  }
});
test('watchdog thrown initial or restart clock is contained without launching another child', () => {
  for (const initial of [true, false]) {
    let reads = 0,
      spawns = 0,
      callback,
      code;
    const child = new EventEmitter();
    child.kill = () => true;
    const w = runWatchdog({
      now: () => {
        if (initial || ++reads === 3) throw Error('SECRET');
        return 100;
      },
      spawnChild: () => {
        spawns++;
        return child;
      },
      setTimer: (cb) => {
        callback = cb;
        return 1;
      },
      report: () => {},
      exit: (c) => (code = c),
    });
    if (!initial) {
      child.emit('exit', 1);
      assert.doesNotThrow(() => callback());
    }
    assert(w.isStopped());
    assert.equal(code, 1);
    assert.equal(spawns, initial ? 0 : 1);
  }
});
