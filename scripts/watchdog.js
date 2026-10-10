import {runWatchdog} from '../src/services/watchdog.js';
const watchdog=runWatchdog();
process.once('SIGINT',()=>watchdog.stop('SIGINT'));
process.once('SIGTERM',()=>watchdog.stop('SIGTERM'));
