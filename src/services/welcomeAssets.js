import { isIP } from 'node:net';
import { UserError } from '../utils/errors.js';
export function validateWelcomeAsset(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u0020\u007f]/u.test(value))
    throw new UserError('welcomeAssetInvalid');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserError('welcomeAssetInvalid');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    isIP(host.replace(/^\[|\]$/g, '')) ||
    !host.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(host) ||
    /^\d+(?:\.\d+)*$/.test(host)
  )
    throw new UserError('welcomeAssetInvalid');
  return value;
}
export function welcomeStyle(settings, kind) {
  return {
    color: settings.color,
    title: (kind === 'goodbye' ? settings.goodbyeTitle : settings.title) || false,
    image: kind === 'goodbye' ? settings.goodbyeImage : settings.image,
    thumbnail: kind === 'goodbye' ? settings.goodbyeThumbnail : settings.thumbnail,
  };
}
