# Open items

## Deferred findings

These need a real Minecraft client, a decision from the maintainer, or a larger redesign.

| Finding | Reason |
| --- | --- |
| Config loader and field helpers are copied between plugins | A shared plugin config loader touches four plugins and needs a maintainer decision on whether invalid TOML disables a plugin or falls back to defaults. |
| Re-extracting an .mcaddon deletes files a download may still have open | Unverifiable: needs a Windows host to see whether removing an open extracted .mcpack fails. |
| World change sends a DH close message and then immediately a new level init; DH client behaviour unverified | Unverifiable: whether the DH 3.3.4 client keeps a session after a close message followed by a new LevelInit needs a real DH client. |
| Wire format is only tested against the plugin's own encoder; no golden fixtures or client-level E2E | Golden wire fixtures need byte captures from DH core 3.3.4 or a real client, and the test harness cannot send client custom payloads yet. |
| No E2E coverage of player-facing behavior (HUD packets, teleport, access, online placeholders) | Needs a Java protocol client in the test harness (large, cross-cutting); a separate project. |
| PIE namespace is never unregistered on a plugin-only unload | Unverifiable: whether IPC from onUnload is safe and how PumpkinPIE handles a dead expansion owner needs a real server with the provider. |
| World change between same-dimension-type worlds may orphan HUD entities on the client | Unverifiable: whether the client keeps its ClientLevel between same-dimension-type worlds needs a real client. |
| Every config-using plugin repeats the same ConfigStore adapter and syntax-error fallback | Needs the policy decision and touches several plugins. |
| pumpkin-api compatibility matrix is generated from static-hermes-runtime test fixtures using the legacy oracle parser | Moving the compatibility matrix generator into tools/pumpkin-api changes package.json scripts of both static-hermes-runtime and pumpkin-api. |
| No facade API for command-node handlers, so plugin-kit runs a second handler-ID space that can collide | Adding registerCommandHandler to the public facade and moving plugin-kit onto the facade's ID space is a public API change; the collision needs a plugin mixing both schedulers, so the maintainer should decide. |
| API compatibility audit is owned by another package's test fixtures and ships in the npm tarball half-broken | Needs a maintainer decision or a larger change. |
| loadPluginConfig is copied across four plugins | Needs a maintainer decision or a larger change. |
| JSDoc style differs across scripts | Picking one JSDoc convention for .mjs and enforcing it in ESLint touches every script file; needs a maintainer decision on the convention first. |
| Each resource property access scans hundreds of string comparisons and allocates new host functions | Performance redesign of generated dispatch (static lookup tables, cached functions, proxy changes) spans the template, generator and facades; measure with the engine benchmark. |
| The runtime command model lives in a package named and described as a docs generator | Large architecture change moving the runtime command/info model out of @pumpkin-plugins/docs changes public package APIs used by every plugin; needs the maintainer's decision. |
| Each plugin copies its config loading, and the copies now behave differently on the same error | Unifying config loading across plugins needs the maintainer to decide whether invalid TOML disables a plugin or falls back to defaults, and touches every plugin. |
| Each plugin hand-rolls unload teardown in a different way and tests the order with 7-17 module mocks | A PluginBase cleanup stack changes unload error semantics for every plugin and replaces each plugin's teardown tests; needs a maintainer decision. |
| Three separate cross-process file-lock implementations and two WIT fetch-and-cache pipelines | Needs a maintainer decision or a larger change. |
| @pumpkin-plugins/docs, a README generator, is also the runtime library for plugin info and commands, and the source of monorepo discovery | Large architecture change that moves the public runtime model; needs the maintainer's decision. |
| A published static-analysis package serves one consumer, while tools/build keeps its own separate TypeScript source analysis | Making @pumpkin-plugins/static-analysis private or folding it into codemod changes a published package; needs the maintainer's decision. |
| Plugin test helpers redeclare the plugin name and the data-folder layout | Cross-plugin test helper adoption touching itests. |

## Left unchanged during the fixes

| Finding | Why |
| --- | --- |
| Update notice hardcodes a personal promo line | Needs a maintainer decision. The maintainer added the follow line himself in two feat commits (79d982b79a, fe868f0a28), so removing his own promo line from his own tool is his call. |
| Tests read the patch and manifest source text instead of checking behaviour | Needs a maintainer decision. |
| release-please version is pinned in three places and loaded through a pnpm dlx CLI-path indirection | A fix is ready on the branch build/release-please-single-pin: it pins release-please once, as an exact root devDependency. It was not merged because it adds about 117 packages to every install, and Renovate would then merge release-please updates on its own. |

## Found during the fixes

The plugin release selector (`pluginReleaseInputs` in `scripts/utils/release-commits.mjs`) needs the Static Hermes runtime's `dist/`, but the release-please job in `release.yml` only bootstraps and never builds, so that job has probably failed since f6198b920d7. When `dist/` does exist, the selector records the gitignored `dist/*.d.ts` files, so changes to the runtime's `src/` never select plugin releases. Fixing it changes which commits release which plugins, so it is left for the maintainer.
