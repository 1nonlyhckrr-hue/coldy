# Troubleshooting

| Problem | Check |
| --- | --- |
| Invalid configuration fields | Fill only the named fields; do not print the full environment |
| Invalid token or login failure | Confirm Luna's token and outbound network; reset leaked credentials |
| Commands missing | Preview then register to the same test guild using Luna's Application ID |
| Permission failure | Check both caller and bot permissions, channel overwrites and role hierarchy |
| SQLite readonly/cannot open | Confirm mount path, parent-directory write access and one writer |
| Native module build failure | Use a supported LTS, reinstall with npm ci on target OS; review native build prerequisites |
| Data disappears on redeploy | An ephemeral disk was used; attach persistent storage and restore a private backup |
| Music unavailable | Music is not implemented in Phase 2; no Lavalink node is connected |
| Expected Zynrax command absent | Reference inventory is not installed code; see COMMAND_INDEX |
| Internal reference error | Use the short reference ID to find sanitized logs; do not expose raw credentials or message bodies |

A successful local test is not a live Discord test. Report exact observed errors and the version; avoid saying a feature is working until the relevant end-to-end path has been run.
