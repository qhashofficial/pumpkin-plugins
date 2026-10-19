---
navigation:
    category: Gameplay
---

# TabDisplay

TabDisplay customizes Pumpkin's native Java player list with formatted real-player names and
per-viewer headers and footers. It keeps the native roster and latency behavior. Bedrock players
continue to see Pumpkin's unchanged player list.

Install `tab-display.wasm` in the server's `plugins/` directory and restart. TabDisplay creates
`plugins/data/TabDisplay/config.toml`. It requests `fs.read.data` and `fs.write.data` for that file;
the normal Pumpkin Market update check also requests `http.outbound`.

## What it changes

| Surface | Behavior |
| --- | --- |
| Java row names | One name format for every listed player |
| Java header and footer | Lines rendered for each viewer |
| Bedrock player list | Left unchanged |
| Per-viewer row names, fake rows and fixed slots | Not implemented |

TabDisplay does not sort the player list or show numeric objectives. It does not send Java tab
fields to Bedrock players or modify names, scores, identities, skins or roster membership.

## PumpkinPIE placeholders

PumpkinPIE is an optional external plugin, built and released separately from TabDisplay. TabDisplay
talks to the configured plugin name through the shared PumpkinPIE client API and does not require
the provider as plugin metadata. If it is absent, the display
commands still work, `%player_name%` and `%server_online%` are filled in by TabDisplay, and other
tokens follow `placeholders.missing_provider` (`literal` by default, or `empty`). Once the provider returns, one shared session resumes bounded
placeholder work. Unknown identifiers follow `placeholders.unresolved`.

Install only a PumpkinPIE artifact compatible with the server and plugin API versions. Confirm its
release provenance from the provider's official distribution before installing it; no provider source
or binary is bundled here. Real-IPC integration against a provenance-verified provider artifact is
still pending.

Header and footer templates use the viewer's context. A row-name template uses the listed subject's
context. Placeholders receive a player's current name only at the request boundary; internal state
uses UUIDs. Provider output is rendered as literal text and cannot inject formatting JSON or
clickable commands.

## Configuration and ownership

At startup, an invalid value falls back to its default and is logged; invalid TOML makes TabDisplay
use all defaults. Use `/tabdisplay reload` to apply `config.toml` while the server runs. If the file
has invalid TOML or values, the reload reports them and keeps the running config. TabDisplay never
rewrites a file that has invalid values. `/tabdisplay status` reports provider state,
connected Java versions, unsupported capabilities and unresolved placeholder identifiers.
`/tabdisplay inspect <player>` reports safe per-player context and placeholder IDs; it never displays
resolved placeholder values.

The commands are operator-only by default. A row name is restored on disable, reload that turns row
formatting off, disconnect or unload only while the current value still matches TabDisplay's last
write. If another plugin changes the name, TabDisplay releases ownership and leaves that value alone.
Headers and footers have no getter for original state in the pinned API; TabDisplay clears them to
empty on disable or unload under exclusive ownership.

## Work limits and measurements

Defaults refresh templates every 20 ticks and snapshot at most 500 players; `general.max_players` is
bounded at 5,000. While more players are online than `general.max_players`, TabDisplay stops updating
and logs one warning, then logs again when the count drops back. Placeholder resolution processes at most 256 requests and 1 MiB per batch on a
tick. A rendered field longer than 8 KiB is cut to fit. When the provider is unavailable, the last
successful frame is retained for up to 30 seconds before configured fallback text is applied.

No server TPS or client display performance benchmark has been collected. The work limits bound
individual snapshots and placeholder batches, but they are not a measured capacity claim.
