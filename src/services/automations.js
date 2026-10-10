import { z } from 'zod';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
const schema=z.object({guildId:z.string().min(1),channelId:z.string().regex(/^\d{17,20}$/),body:z.string().min(1).max(1800),dueAt:z.number().int(),repeatMs:z.number().int().min(600000).max(30*86400000).optional(),interactionId:z.string().min(1)}).strict();
export function parseScheduledTime(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value??''))throw new UserError('automationTimeFormat');const time=Date.parse(value);if(!Number.isFinite(time))throw new UserError('automationTimeFormat');const local=value.slice(0,19),normalized=new Date(Date.parse(local+'Z')).toISOString().slice(0,19);if(local!==normalized)throw new UserError('automationTimeFormat');return time;}
export class MessageSchedules {
 constructor(db,now=Date.now){this.db=db;this.now=now;}
 create(input){const v=schema.parse(input);if(v.dueAt<this.now()+60000||v.dueAt>this.now()+365*86400000)throw new UserError('automationTimeBounds');return this.db.transaction(()=>{if(this.db.prepare("SELECT count(*) n FROM message_schedules WHERE guild_id=? AND status IN ('pending','sending','uncertain')").get(v.guildId).n>=25)throw new UserError('automationLimit');return Number(this.db.prepare("INSERT INTO message_schedules(guild_id,channel_id,body,due_at,repeat_ms,status,interaction_id,created_at) VALUES(?,?,?,?,?,'pending',?,?)").run(v.guildId,v.channelId,v.body,v.dueAt,v.repeatMs??null,v.interactionId,this.now()).lastInsertRowid);})();}
 get(id,guildId){return this.db.prepare('SELECT * FROM message_schedules WHERE id=? AND guild_id=?').get(id,guildId);}
 list(guildId){return this.db.prepare('SELECT * FROM message_schedules WHERE guild_id=? ORDER BY id DESC LIMIT 100').all(guildId);}
 claim(){return this.db.transaction(()=>{const row=this.db.prepare("SELECT * FROM message_schedules WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 1").get(this.now());if(!row)return null;this.db.prepare("UPDATE message_schedules SET status='sending' WHERE id=? AND status='pending'").run(row.id);return row;})();}
 finish(id,success){const row=this.db.prepare("SELECT * FROM message_schedules WHERE id=? AND status='sending'").get(id);if(!row)return;if(!success){this.db.prepare("UPDATE message_schedules SET status='uncertain' WHERE id=?").run(id);return;}if(!row.repeat_ms){this.db.prepare("UPDATE message_schedules SET status='done' WHERE id=?").run(id);return;}const next=row.due_at+(Math.max(1,Math.floor((this.now()-row.due_at)/row.repeat_ms)+1))*row.repeat_ms;this.db.prepare("UPDATE message_schedules SET status='pending',due_at=? WHERE id=?").run(next,id);}
 cancel(id,guildId){const r=this.db.prepare("UPDATE message_schedules SET status='cancelled' WHERE id=? AND guild_id=? AND status IN ('pending','uncertain')").run(id,guildId);if(!r.changes)throw new UserError('automationCancelInvalid');}
 recover(){this.db.prepare("UPDATE message_schedules SET status='uncertain' WHERE status='sending'").run();}
}
export class AutomationRunner {
 constructor(context,client){this.context=context;this.client=client;this.busy=false;this.timer=null;}
 async tick(){if(this.busy)return;this.busy=true;try{for(let n=0;n<10;n++){let job;try{job=this.context.messageSchedules.claim();}catch{this.context.logger.warn('Schedule storage unavailable');break;}if(!job)break;let success=false;try{const guild=await this.client.guilds.fetch(job.guild_id),channel=await validateOutputChannel(guild,job.channel_id),locale=this.context.guildConfig.get(job.guild_id).language;await channel.send(lunaPayload({content:job.body,allowedMentions:{parse:[]}},{locale}));success=true;}catch{this.context.logger.warn({scheduleId:job.id},'Scheduled send uncertain; no automatic retry');}try{this.context.messageSchedules.finish(job.id,success);}catch{this.context.logger.warn({scheduleId:job.id},'Schedule outcome could not be stored; reserved job will not resend');}}}finally{this.busy=false;}}
 start(){if(this.timer)return;void this.tick();this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
