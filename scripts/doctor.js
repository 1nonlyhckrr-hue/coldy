import 'dotenv/config';
import { preflight } from '../src/services/preflight.js';
const result = await preflight();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
