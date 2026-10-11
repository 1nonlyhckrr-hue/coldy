# Music

`move from to`:waitingqueue1-N positions only,to is finalindex afterremoval;forward/back/sameposition valid. Currenttrack/paused/stay/requester/encodedeventIDsunchanged. Guildoperationlock,delayedcurrentvoiceauthorityrefresh againstcapturedchannel,no newproviderplayer/searcheffects. Missing/invalid/locked/uncertain rejectswithoutreorder;provider/sessioninvalidationwhileauthorityawaits aborts.4newtests,626localfullsuite/213paths,12musicpaths. Stilldefaultoff,Nazha4.2.2metadataonlycandidate,no actualvoice/playbackverification.

## Waiting-only queue transforms

`reverse` reverses waiting track order only. `deduplicate` keeps first waiting track per provider itemID,not title/requester,current track not compared. `removerange from to` removes inclusive waiting positions1-50,in ascending order with both within current queue. No replay/duplicate currenttrack/play/pause/stop/provider request or assignment. This is session-memory only,lost on restart.

Same-guild queue lock,pendingexact eventIDrevision and fresh samevoice/runtime/access callback before rewrite prevent stale queue mutation. Missing/uncertain session or badrange fails before rewrite. Currentplayback/requester fields preserved on retained tracks;no adapter calls by these transforms. Native music remains experimental opt-in/off by default,publicnode source/uptime/DAVE risks unchanged. Local queue/nativevoice mocks/private3locale replies tested,no liveaudio/clientpixel acceptance.

## Additional waiting-queue edits

`/music trim count` keeps the first0-N waiting tracks and discards later waiting tracks;count cannot exceed current waiting length. `duplicate position` appends one waiting-track copy attributed to the caller with a fresh event ID,subject to total queue cap. Encoded/provider metadata is copied,not resolved again. `removeown` removes only waiting requests whose stored requester ID matches caller. Current track,play/pause/connection are unchanged by these commands,even when caller requested current track.

All use guild queue lock,current session/event-ID revision checks and fresh same-voice authority before rewrite;no player adapter calls. Invalid ranges,capacity,session changes or lost authority leave proposed queue edits unapplied. Separate duplicated event IDs keep playback completion receipts distinct. Four tests cover effects/token/current/requester isolation,limits/revision/authority failure,finish-event separation and private3locale command dispatch. Music remains experimental/off by default,18paths;no livevoice/audio/client acceptance.
