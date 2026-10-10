import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { UserError } from '../utils/errors.js';
const snowflake=z.string().regex(/^\d{17,20}$/);
const schema=z.object({guildId:z.string().min(1),channelId:snowflake,prize:z.string().trim().min(1).max(250),winnerCount:z.number().int().min(1).max(20),requiredRoleId:snowflake.optional(),durationMs:z.number().int().min(60000).max(30*86400000),interactionId:z.string().min(1)}).strict();
export function sampleWinners(candidates,count,random=randomInt){const values=[...new Set(candidates)];for(let n=values.length-1;n>0;n--){const swap=random(n+1);if(!Number.isInteger(swap)||swap<0||swap>n)throw new Error('Invalid random source');[values[n],values[swap]]=[values[swap],values[n]];}return values.slice(0,count);}
export class Giveaways {
 constructor(db,now=Date.now){this.db=db;this.now=now;}
 reserve(input){const v=schema.parse(input);return this.db.transaction(()=>{if(this.db.prepare("SELECT count(*) n FROM giveaways WHERE guild_id=? AND status IN ('pending','active','ending','uncertain')").get(v.guildId).n>=20)throw new UserError('giveawayLimit');const r=this.db.prepare("INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,required_role_id,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)").run(v.guildId,v.channelId,v.prize,v.winnerCount,v.requiredRoleId??null,this.now()+v.durationMs,v.interactionId,this.now());return Number(r.lastInsertRowid);})();}
 get(id,guildId){return this.db.prepare('SELECT * FROM giveaways WHERE id=? AND guild_id=?').get(id,guildId);}
 activate(id,messageId){this.db.prepare("UPDATE giveaways SET message_id=?,status='active' WHERE id=? AND status='pending'").run(messageId,id);}
 uncertain(id){this.db.prepare("UPDATE giveaways SET status='uncertain' WHERE id=? AND status='pending'").run(id);}
 list(guildId){return this.db.prepare('SELECT * FROM giveaways WHERE guild_id=? ORDER BY id DESC LIMIT 100').all(guildId);}
 due(){return this.db.prepare("SELECT * FROM giveaways WHERE (status='active' AND ends_at<=?) OR status='ending' ORDER BY ends_at LIMIT 20").all(this.now());}
 entries(id){return this.db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id=? ORDER BY user_id').all(id).map(r=>r.user_id);}
 enter(id,guildId,userId){return this.db.transaction(()=>{const g=this.get(id,guildId);if(!g||g.status!=='active'||g.ends_at<=this.now())throw new UserError('giveawayNotActive');if(!/^\d{17,20}$/.test(userId))throw new UserError('giveawayUserInvalid');if(this.entries(id).length>=1000&&!this.db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').get(id,userId))throw new UserError('giveawayEntryLimit');return this.db.prepare('INSERT OR IGNORE INTO giveaway_entries VALUES(?,?,?)').run(id,userId,this.now()).changes===1;})();}
 draw(id,guildId,eligible,{reroll=false,random=randomInt}={}){return this.db.transaction(()=>{const g=this.get(id,guildId);if(!g)throw new UserError('giveawayNotFound');if(g.status==='ending')return g;if((reroll&&g.status!=='ended')||(!reroll&&g.status!=='active'))throw new UserError('giveawayDrawInvalid');const registered=new Set(this.entries(id));const previous=new Set(reroll?JSON.parse(g.winners_json):[]);const candidates=eligible.filter(user=>registered.has(user)&&!previous.has(user));const winners=sampleWinners(candidates,g.winner_count,random);this.db.prepare("UPDATE giveaways SET winners_json=?,status='ending',draw_version=draw_version+1 WHERE id=?").run(JSON.stringify(winners),id);return this.get(id,guildId);})();}
 endPublished(id,version){this.db.prepare("UPDATE giveaways SET status='ended' WHERE id=? AND status='ending' AND draw_version=?").run(id,version);}
 recover(){this.db.prepare("UPDATE giveaways SET status='uncertain' WHERE status='pending'").run();}
}
