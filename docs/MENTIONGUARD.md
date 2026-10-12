# MentionGuard

Owner-only Koki behavior port implemented in Luna code. Native Discord acceptance is pending. Off until explicitly configured. Requires ENABLE_MESSAGE_EVENTS=true and bot Moderate Members.

- `/mentionguard set target duration`: one confirmed human protected member per guild. Explicit integer duration with s/m/h/d,1s-28d. Setting replaces the rule and resets its revision/window.
- `/mentionguard status`: private saved rule and last outcome,not native timeout proof.
- `/mentionguard off`: disables the rule. Existing timeout is unchanged;an already submitted action may finish.

The fourth separate direct-mention message from one human sender within a rolling10minute window reserves one timeout attempt. Repeated mentions inside a message count once. Ignores bot/webhook/system/edited/self-mention/reply-only/role/everyone messages. Replay deduplication and window receipts persist in SQLite;reserved restart states become uncertain,no retry. Boundary messages exactly10minutes old expire. New events must have a verified recent timestamp.

Before the effect,forced native member fetches check exact guild/identity,bot Moderate Members,target moderation and hierarchy,non-owner/non-admin status,and the still-enabled unchanged policy. Any currently active timeout is left untouched. Timeout is submitted once with the specified reason;forced exact post-observation marks completed or uncertain. Permission denial is skipped. No automatic retries,channel alerts,DMs or warnings. One attempt per sender/window;after prior reserved/result receipt expires,a later new window can trigger again. No message content is stored. Rule target/duration/revision/last result and bounded10minute message IDs/sender IDs/status are stored. Different guilds are isolated.

This is original Luna code,not copying or changing Koki services. The other requested VC/prank ports remain separate pending batches. No Discord login,deployment or live use is part of this work.
