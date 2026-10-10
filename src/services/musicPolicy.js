import { isIP } from 'node:net';
import { UserError } from '../utils/errors.js';
export function validateMusicCatalog(catalog){
 if(!Array.isArray(catalog)||catalog.length<1||catalog.length>100)throw new TypeError('Catalog needs1-100 rights-cleared items');
 const ids=new Set();return catalog.map(item=>{
  if(!item||typeof item.id!=='string'||! /^[a-z][a-z0-9_-]{0,31}$/.test(item.id)||ids.has(item.id))throw new TypeError('Invalid catalog identifier');ids.add(item.id);
  if(typeof item.title!=='string'||!item.title.trim()||item.title.length>100||typeof item.author!=='string'||!item.author.trim()||item.author.length>100)throw new TypeError('Invalid catalog display fields');
  if(typeof item.rightsNote!=='string'||!item.rightsNote.trim()||item.rightsNote.length>500||item.rightsCleared!==true)throw new TypeError('Owner rights clearance required');
  let url;try{url=new URL(item.url);}catch{throw new TypeError('Invalid catalog URL');}
  // No user-supplied URL, credentials, queries/tokens, literals or local endpoints.
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||isIP(url.hostname)||!url.hostname.includes('.')||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal'))throw new TypeError('Unsafe catalog origin');
  if(!/\.(mp3|ogg|wav|flac|m4a)$/i.test(url.pathname))throw new TypeError('Catalog needs a direct audio file path');
  return{id:item.id,title:item.title.trim(),author:item.author.trim(),url:url.href,rightsCleared:true,rightsNote:item.rightsNote.trim()};
 });
}
export function requireDaveNode(info){
 const version=info?.version;
 if(!version||version.major!==4||version.minor<2||version.preRelease)throw new UserError('musicNodeIncompatible');
 if(!info.sourceManagers?.includes('http'))throw new UserError('musicHttpUnavailable');
 return true;
}
