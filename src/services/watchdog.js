import { spawn } from 'node:child_process';
export class RestartPolicy {
 constructor({now=Date.now,maxCrashes=10,windowMs=600000,stableMs=300000}={}){this.now=now;this.maxCrashes=maxCrashes;this.windowMs=windowMs;this.stableMs=stableMs;this.crashes=[];this.attempt=0;}
 next(runtimeMs){const now=this.now();if(runtimeMs>=this.stableMs)this.attempt=0;this.crashes=this.crashes.filter(t=>now-t<this.windowMs);this.crashes.push(now);if(this.crashes.length>this.maxCrashes)return null;return Math.min(60000,1000*2**Math.min(this.attempt++,6));}
}
export function runWatchdog({spawnChild=spawn,policy=new RestartPolicy(),setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,report=console.error,exit=code=>process.exitCode=code}={}){
 let child=null,timer=null,stopping=false,startedAt=0;
 const start=()=>{
  if(stopping)return;startedAt=now();let settled=false;
  const ended=()=>{if(settled)return;settled=true;child=null;if(stopping)return;const delay=policy.next(now()-startedAt);if(delay===null){report('Luna restart circuit opened after repeated failures. Operator review required.');stopping=true;exit(1);return;}report(`Luna process stopped. Restarting in ${delay} ms.`);timer=setTimer(()=>{timer=null;start();},delay);};
  try{child=spawnChild(process.execPath,[new URL('../index.js',import.meta.url).pathname],{stdio:'inherit',env:process.env});child.once('exit',ended);child.once('error',ended);}catch{ended();}
 };
 const stop=signal=>{stopping=true;if(timer)clearTimer(timer);timer=null;if(child)child.kill(signal??'SIGTERM');};
 start();return {stop,isStopped:()=>stopping};
}
