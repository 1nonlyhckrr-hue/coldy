# Music core: prepared, not activated

No executable Music slash command or bot-start hook in this checkpoint. Do not advertise playback as working. Queue/adapter unit foundation only, actual free node, legally cleared source catalog, Discord authorization and DAVE voice session remain release gates.

Pinned Shoukaku4.3.0 supports channelId required by Lavalink4.2+ DAVE. Adapter requires connected stable4.2+ node with http source manager; encrypted node connection required by factory. No production node credentials/catalog bundled. Catalog validation requires1-100 direct HTTPS audio files with unique IDs, title/author and explicit owner rights clearance note. No arbitrary caller URL, search prefix, credentials, token query, URL literal/local host, streaming/playlist/mirrored catalog mode. Approved remote host can still redirect or resolve internally: trusted catalog host/files/redirect behavior must be verified by the operator and the Lavalink node must enforce its own outbound network restrictions. This code's URL checks alone are not complete SSRF protection.

Adapter resolution accepts exact requested URI, http sourceName and finite-file mode only. Does not silently substitute YouTube/Spotify/SoundCloud media. Encoded track events use unique per-play userData token echoed by Lavalink, not encoded-audio equality, so stale end for repeated same-track requests cannot consume the new queue item. Missing echo freezes/doesn't advance rather than guessing. Raw provider error/debug content is not logged.

In-memory sessions: max100 guilds,50 queued/current tracks, same-channel, mutex. Explicit pause/resume and stop, completed-track advance, bounded load/join failures. Provider/voice/track uncertainty freezes, no queue cascade or repeat. Explicit keep-connected core retains idle session while process/node/Discord remain available, not uptime promise. Turning stay off when idle leaves. No persistent queue/config yet; process restart loses sessions and no auto replay. No skip/seek/filters/shuffle/loop/playlist/live-source commands yet. User permissions and channel checks must be added before any slash/boot exposure. This core is intentionally not wired until those gates are met.

Ten new distinct tests,188 total project tests pass: catalog rights/direct-URL guards, DAVE/source requirements, bounded joins/queue/current token, stay/leave, uncertainty/freeze, pause/resume/stop, caps/locks, exact direct-audio resolver, repeated-track server-echo token and failed-load capacity release. No node REST/voice playback/live bot verification. A package implementation check is not a Discord session test.

Source research:
- https://lavalink.dev/changelog/v4.html (4.2.0 first DAVE,4.2.2 libdave updates)
- https://github.com/lavalink-devs/Lavalink/releases/tag/4.2.0
- https://registry.npmjs.org/shoukaku (published4.3.0 package inspected locally)
- https://lavalink.dev/api/rest.html
- https://lavalink.dev/api/websocket.html
- https://developers.soundcloud.com/docs/api/terms-of-use (scraping and aggregate on-demand limitations)
- https://freelavalink.serenetia.com/about (provider documents mirrored catalogue/source policy issue)
- https://lavalink.vexanode.cloud/ (free directory claim, no selected node validation)
