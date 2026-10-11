import { guildConfigSchema } from './guildConfig.js';
import { UserError } from '../utils/errors.js';
const schema = guildConfigSchema.shape.logging.removeDefault();
export function importLogging(c, guildId, text) {
  let policy;
  try {
    if (typeof text !== 'string' || text.length > 4000) throw Error('bounds');
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Error('object');
    policy = schema.parse(value);
    if (new Set(policy.events).size !== policy.events.length) throw Error('duplicate');
    policy.enabled = false;
  } catch {
    throw new UserError('logImportInvalid');
  }
  return c.settings.db.transaction(() => {
    const current = c.get(guildId);
    c.settings.set(guildId, guildConfigSchema.parse({ ...current, logging: policy }));
    return policy;
  })();
}
