import { readFileSync } from 'node:fs';
const supported=['en','hi','hinglish'];
const dictionaries=Object.fromEntries(supported.map(locale=>[locale,JSON.parse(readFileSync(new URL(`../locales/${locale}.json`,import.meta.url),'utf8'))]));
export function translate(locale,key,parameters={}) {
 if(!supported.includes(locale))throw new Error('Unsupported locale');
 const template=dictionaries[locale][key];
 if(typeof template!=='string')throw new Error(`Missing localization key: ${locale}:${key}`);
 return template.replace(/\{(\w+)\}/g,(_,name)=>{if(!(name in parameters))throw new Error(`Missing localization parameter: ${name}`);return String(parameters[name]);});
}
export function validateLocaleCoverage(){const keys=Object.keys(dictionaries.en).sort();for(const locale of supported){if(JSON.stringify(Object.keys(dictionaries[locale]).sort())!==JSON.stringify(keys))throw new Error(`Locale key mismatch: ${locale}`);}return keys.length;}
export class Localization {
 constructor(guildConfig){this.guildConfig=guildConfig;}
 locale(guildId){return this.guildConfig.get(guildId).language;}
 t(guildId,key,parameters){return translate(this.locale(guildId),key,parameters);}
}
