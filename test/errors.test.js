import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInteractionError, UserError } from '../src/utils/errors.js';
const logger={error:()=>{},warn:()=>{}};
test('deferred failures edit original response',async()=>{let called=false;await handleInteractionError(new UserError('Try later'),{deferred:true,editReply:async v=>{called=v.embeds[0].data.description==='Try later';}},logger);assert(called);});
test('already replied failures use follow-up; failed delivery contained',async()=>{let called=false;await handleInteractionError(new Error(),{replied:true,followUp:async()=>{called=true;}},logger);assert(called);await assert.doesNotReject(()=>handleInteractionError(new Error(),{reply:async()=>{throw new Error();}},logger));});
