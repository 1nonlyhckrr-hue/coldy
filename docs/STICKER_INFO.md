# Current server sticker metadata

`/stickerinfo sticker-id` force-fetches one guild sticker through the guild endpoint. Exact ID,guild ID,type GUILD and reviewed PNG/APNG/Lottie/GIF format required. Private localized no-ping reply shows escaped name,ID,format and available state. Missing optional availability says unknown,not assumed enabled. No uploader,description,tags,standard pack,download,clone or native sticker write. Lottie is labelled JSON,not an image claim;no file URL shown.

Official endpoint/fields/types: https://docs.discord.com/developers/resources/sticker . Installed discord.js GuildStickerManager forced-fetch semantics and Sticker fields inspected. Local tests cover three locales,four formats,true/false/unknown availability,private metadata omission and wrong/foreign/standard/missing/invalid/error cases.386 total tests,38 top-level/163 installed paths,SQLite25. Native Discord and visual acceptance remain unverified.
