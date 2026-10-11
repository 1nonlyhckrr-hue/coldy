import { guildConfigSchema } from './guildConfig.js';
import { UserError } from '../utils/errors.js';
const portable = guildConfigSchema.shape.welcome
  .removeDefault()
  .omit({ enabled: true, goodbyeEnabled: true, channelId: true });
export function exportWelcome(c, guildId) {
  const {
    enabled: _enabled,
    goodbyeEnabled: _goodbyeEnabled,
    channelId: _channelId,
    ...library
  } = c.get(guildId).welcome;
  return portable.parse(library);
}
export function importWelcome(c, guildId, text) {
  let library;
  try {
    if (typeof text !== 'string' || text.length > 4000) throw Error('bounds');
    library = portable.parse(JSON.parse(text));
  } catch {
    throw new UserError('welcomeImportInvalid');
  }
  return c.settings.db.transaction(() => {
    const current = c.get(guildId);
    const next = guildConfigSchema.parse({
      ...current,
      welcome: {
        ...library,
        channelId: current.welcome.channelId,
        enabled: false,
        goodbyeEnabled: false,
      },
    });
    c.settings.set(guildId, next);
    return next.welcome;
  })();
}
export function resetWelcome(c, guildId) {
  return c.settings.db.transaction(() => {
    const current = c.get(guildId),
      defaults = guildConfigSchema.parse({}).welcome;
    c.settings.set(guildId, { ...current, welcome: defaults });
  })();
}
