# Attachment-only channel policy

Reference-led feature: https://docs.zynrax.site/configuration/media . Original Luna safety adaptation. Native Discord acceptance remains pending.

`/media setup channel confirm:true` opts in one normal text channel for future automatic deletion of messages without attachments. Requires fresh Manage Server manager,message events,and freshly fetched exact bot/channel View+ReadHistory+ManageMessages. No automatic channel creation,no retrospective purge.

`remove` disables future deletions;an already submitted one may finish. `config` private saved JSON. `bypassadd user` exempts one confirmed human member,max100. `bypassremove user-id` removes exact stored ID including departed users. `bypassshow` private saved IDs. Bypasses survive policy removal for later setup.

Any native attachment counts (images/videos/files),not media MIME filtering;links/embeds alone do not count. Bots,webhooks,system messages,edits,server owner,ManageServer/ManageMessages staff and saved bypasses exempt. Events must be verified younger than5minutes. Forced native message fetch prevents cached attachment absence from deleting a message with current attachments. Exact guild/channel/sender identities,bot permission,staff/bypass and policyrevision checks repeated before reserved deletion. No channel alerts/DMs/warnings. MessageCreate only.

SQLite replay receipt reserved before delete. Exact provider10008+404 missing-message post-observation marks completed;accepted deletion without proven absence is uncertain. No automatic retry. Reserved restart becomes uncertain;oldreceipts expire after30days while eventsolder5minutes cannotreplay. Unknown unsubmitted/nativeguard failures do not reserve. Native rate limits/falsepositives/clientvisualacceptance and operator recovery remain unverified. Private3locale config outputs with no mentions. No message content stored.
