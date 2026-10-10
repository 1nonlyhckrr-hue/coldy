import { UserError } from '../utils/errors.js';
const DAY=86400000;
export const utcDay = milliseconds => new Date(milliseconds).toISOString().slice(0,10);
export class MessageRanks {
  constructor(db){this.db=db;this.lastCleanup=0;}
  config(guildId){const row=this.db.prepare('SELECT enabled,excluded_json FROM message_rank_config WHERE guild_id=?').get(guildId);return{enabled:!!row?.enabled,excluded:row?JSON.parse(row.excluded_json):[]};}
  enable(guildId,enabled){if(typeof enabled!=='boolean')throw new TypeError('Invalid tracking state');this.db.prepare('INSERT INTO message_rank_config(guild_id,enabled) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled').run(guildId,enabled?1:0);}
  exclude(guildId,channelId,excluded){if(!/^\d{17,20}$/.test(channelId)||typeof excluded!=='boolean')throw new UserError('rankChannelInvalid');return this.db.transaction(()=>{const cfg=this.config(guildId),set=new Set(cfg.excluded);if(excluded)set.add(channelId);else set.delete(channelId);if(set.size>50)throw new UserError('rankExcludeLimit');this.db.prepare('INSERT INTO message_rank_config VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET excluded_json=excluded.excluded_json').run(guildId,cfg.enabled?1:0,JSON.stringify([...set]));})();}
  record(message,now=Date.now()){
    if(!message.guildId||!/^\d{17,20}$/.test(message.author?.id??'')||message.author.bot||message.webhookId||!/^\d{17,20}$/.test(message.id)||!Number.isFinite(message.createdTimestamp)||message.createdTimestamp<now-300000||message.createdTimestamp>now+30000)return false;
    const cfg=this.config(message.guildId);if(!cfg.enabled||cfg.excluded.includes(message.channelId)||cfg.excluded.includes(message.channel?.parentId)||cfg.excluded.includes(message.channel?.parent?.parentId))return false;
    if(now-this.lastCleanup>3600000){this.cleanup(now);this.lastCleanup=now;}
    return this.db.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM message_rank_seen WHERE message_id=?').get(message.id))return false;
      const day=utcDay(message.createdTimestamp),row=this.db.prepare('SELECT count FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day=?').get(message.guildId,message.author.id,day);
      // Bound storage growth and spam contribution. This is a message metric, never activity quality.
      if(!row&&this.db.prepare('SELECT count(*) n FROM message_rank_daily WHERE guild_id=? AND day=?').get(message.guildId,day).n>=10000)return false;
      if(row?.count>=10000)return false;
      this.db.prepare('INSERT INTO message_rank_seen VALUES(?,?)').run(message.id,now);
      this.db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,1) ON CONFLICT(guild_id,user_id,day) DO UPDATE SET count=count+1').run(message.guildId,message.author.id,day);
      return true;
    })();
  }
  cleanup(now=Date.now()){return this.db.transaction(()=>{this.db.prepare('DELETE FROM message_rank_seen WHERE created_at<?').run(now-7*DAY);this.db.prepare('DELETE FROM message_rank_daily WHERE day<?').run(utcDay(now-89*DAY));})();}
  since(period,now){if(!['today','week','retained'].includes(period))throw new UserError('rankPeriodInvalid');return utcDay(now-(period==='week'?6:period==='retained'?89:0)*DAY);}
  top(guildId,period,page=1,now=Date.now()){
    const since=this.since(period,now);if(!Number.isSafeInteger(page)||page<1||page>1000)throw new UserError('rankPageInvalid');
    const total=this.db.prepare('SELECT count(DISTINCT user_id) n FROM message_rank_daily WHERE guild_id=? AND day>=?').get(guildId,since).n,pages=Math.max(1,Math.ceil(total/10));if(page>pages)throw new UserError('rankPageInvalid');
    const rows=this.db.prepare('SELECT user_id,SUM(count) total FROM message_rank_daily WHERE guild_id=? AND day>=? GROUP BY user_id ORDER BY total DESC,user_id ASC LIMIT 10 OFFSET ?').all(guildId,since,(page-1)*10);return{rows,pages,page};
  }
  stats(guildId,userId,now=Date.now()){const result={};for(const period of ['today','week','retained'])result[period]=this.db.prepare('SELECT COALESCE(SUM(count),0) total FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=?').get(guildId,userId,this.since(period,now)).total;return result;}
  resetMine(guildId,userId){return this.db.prepare('DELETE FROM message_rank_daily WHERE guild_id=? AND user_id=?').run(guildId,userId).changes;}
}
export function createMessageRankHandler(c){return message=>{try{c.messageRanks.record(message);}catch{c.logger.warn({kind:'message_rank_storage'},'Message metric update unavailable');}};}
