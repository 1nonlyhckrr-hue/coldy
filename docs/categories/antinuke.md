# antinuke

Reference-only inventory, not installed Luna functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## anticonfig

```text
,anticonfig
```

You can use the `,anticonfig` command to view the current antinuke configuration.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## antilimit

```text
,antilimit (event) (limit)
```

The following flags can be used to define the Anti-Nuke module. Set a strict daily limit on the number of actions a moderator can perform. Once that limit is hit within the day, Zynrax instantly steps in and takes action — no second chances. It's recommended to keep the threshold between `5` and `10` to stay safe.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## antipunish

```text
,antipunish (event) (punishment)
```

Available Flags (see source for full description).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## extraowner set

```text
,extraowner set (user)
```

Initially, only the **Server Owner** can configure the antinuke. However, you can allow other users to configure the antinuke with the `extraowner set` command. This is a dangerous command and will allow the user to entirely alter the antinuke configuration.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## whitelist add

```text
,whitelist add (user)
```

You can exempt users from the antinuke with the `whitelist add` command. This is a dangerous command and will allow the user to bypass the antinuke entirely.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## whitelist remove

```text
,whitelist remove (user)
```

You can remove users from the antinuke whitelist with the `whitelist remove` command.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

## whitelist show

```text
,whitelist show
```

You can use the `whitelist show` command to view the whitelisted users.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/antinuke

