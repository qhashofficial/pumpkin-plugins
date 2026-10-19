# Open items

## Deferred findings

These need a real Minecraft client, a decision from the maintainer, or a larger redesign.

| Finding | Reason |
| --- | --- |
| Config loader and field helpers are copied between plugins | A shared plugin config loader touches four plugins in parallel units and needs a maintainer decision on whether invalid TOML disables a plugin or falls back to defaults (see S15-003). |
| Re-extracting an .mcaddon deletes files a download may still have open | Unverifiable: needs a Windows host to see whether removing an open extracted .mcpack fails. |
| wit-method-usage.ts is one 590-line closure with duplicated import logic and test-only exports | Pure restructuring of the 680-line wit-method-usage.ts; do after U13's behaviour fixes to the same file land. |
| Three copies of the 'stage, move aside, rename, restore' publish routine | Extracting a shared stage-and-replace helper touches bundle.ts, types.ts and wit.ts, which U13 and U14 change in parallel; follow-up after both merge. |
| session.ts (838 lines) mixes protocol handling, capture scheduling, refresh, transfer pacing and status | Size-L split of session.ts into scheduler, transfer queue and status modules; do after U35's behaviour fixes to the same file land. |
| Capture scheduler interleaves many partial builders and can capture the same section twice | Reworking the capture scheduler belongs with the S08-002 session.ts split; it conflicts with U35's changes to the same code. |
| tick() re-resolves every player's host handles many times per tick, including idle clients | Peer-resolution and O(n^2) scan optimisations in tick() belong with the S08-002 session.ts restructure; the cost only shows near maximum settings. |
| World change sends a DH close message and then immediately a new level init; DH client behaviour unverified | Unverifiable: whether the DH 3.3.4 client keeps a session after a close message followed by a new LevelInit needs a real DH client. |
| Wire format is only tested against the plugin's own encoder; no golden fixtures or client-level E2E | Golden wire fixtures need byte captures from DH core 3.3.4 or a real client, and the test harness cannot send client custom payloads yet. |
| Terrain package ships speculative chunk-loader/generator machinery that is always 'unavailable' | Removing the speculative chunk-loader API changes tools/terrain types that DH peers.ts (U35) constructs; do after U35 merges to avoid a broken intermediate state. |
| No E2E coverage of player-facing behavior (HUD packets, teleport, access, online placeholders) | Needs a Java protocol client in the test harness (size L, cross-cutting); a separate project. |
| PIE namespace is never unregistered on a plugin-only unload | Unverifiable: whether IPC from onUnload is safe and how PumpkinPIE handles a dead expansion owner needs a real server with the provider. |
| World change between same-dimension-type worlds may orphan HUD entities on the client | Unverifiable: whether the client keeps its ClientLevel between same-dimension-type worlds needs a real client. |
| Every config-using plugin repeats the same ConfigStore adapter and syntax-error fallback | Same shared ConfigStore/loader consolidation as S15-003; needs the policy decision and touches several plugin units. |
| DynamicLights plugin.ts mixes lifecycle, event wiring and sync logic in 372 lines | Pure refactor of DynamicLights plugin.ts; do after U50's behaviour fixes to the same file land. |
| pumpkin-api compatibility matrix is generated from static-hermes-runtime test fixtures using the legacy oracle parser | Moving the compatibility matrix generator into tools/pumpkin-api changes package.json scripts of both static-hermes-runtime (U06) and pumpkin-api (U08) while they are edited in parallel; do after those merge. |
| Unit tests for src modules live in test/ and duplicate co-located suites | Moving test/ unit suites beside their modules touches files owned by U03, U04, U05 and U09 at once; schedule as a mechanical follow-up after those merge. |
| No facade API for command-node handlers, so plugin-kit runs a second handler-ID space that can collide | Adding registerCommandHandler to the public facade and moving plugin-kit onto the facade's ID space is a public API change; the collision needs a plugin mixing both schedulers, so the maintainer should decide. U48 documents the ceiling meanwhile. |
| API compatibility audit is owned by another package's test fixtures and ships in the npm tarball half-broken | Same cross-package move as S02-003 (refresh entry point, files exclusion, maintainer docs); follow-up after U06/U08/U09 merge. |
| Third-party actions pinned by mutable tag while holding write-scoped App tokens or secrets | Pinning every action to a commit SHA rewrites every workflow file that U21 and U29-U32 edit in parallel, and needs a Renovate digest setup; run as a mechanical pass after the workflow units merge. |
| Job-summary step-outcome table repeats the GitHub UI and requires toJSON(steps) plumbing, which carries App tokens | Removing the job-summary steps input changes 17 call sites across every workflow owned by parallel units; follow-up after they merge. |
| loadPluginConfig is copied across four plugins | Same shared config loader as S10-010/S15-003; U45 fixes the reload syntax-error bug locally. |
| changed-areas.mjs is a 490-line top-level script with duplicated, heuristic discovery | Size-L rewrite of changed-areas.mjs into modules; U29 adds the targeted outputs first, the restructure can follow. |
| JSDoc style differs across scripts | Picking one JSDoc convention for .mjs and enforcing it in ESLint touches every script file owned by other units; needs a maintainer decision on the convention first. |
| release-please version is pinned in three places and loaded through a pnpm dlx CLI-path indirection | Needs a new root devDependency, lockfile, release.yml and release.mjs changes across three parallel units for low value; follow-up. |
| Hand-written host API and resource classes duplicate the generator, and the copies diverge | Deleting about 600 lines of hand-written host API and the ResourceKind classes is a size-M architecture redesign that should follow U01/U02's correctness fixes and needs the maintainer's agreement on the single-WitResourceObject design. |
| Each resource property access scans hundreds of string comparisons and allocates new host functions | Performance redesign of generated dispatch (static lookup tables, cached functions, proxy changes) spans the template, generator and facades that U01/U02 change in parallel; do it after they land and measure with the engine benchmark. |
| Extension changelog lists unrelated commits under a duplicated version | Root cause of the duplicated extension changelog is unknown (path scoping is already correct); needs a separate investigation before any fix. |
| Production benchmark code lives in test/ and in oversized files | Moving benchmark modules from test/ into src/ and splitting large files is a structural follow-up after U61's fixes to the same files. |
| Parser mode is detected by grepping build stdout | Verification showed the parser-mode check fails loudly and cannot pass a wrong mode silently; no change is needed. |
| The runtime command model lives in a package named and described as a docs generator | Size-L architecture change moving the runtime command/info model out of @pumpkin-plugins/docs changes public package APIs used by every plugin; needs the maintainer's decision. |
| Codex hooks link in the agent tooling guide looks wrong | Unverifiable here: checking whether the Codex hooks URL resolves needs network access; the link can be fixed once confirmed. |
| Each plugin copies its config loading, and the copies now behave differently on the same error | Unifying config loading across plugins needs the maintainer to decide whether invalid TOML disables a plugin or falls back to defaults, and touches every plugin unit. |
| Plugin log lines don't consistently name their plugin, and Pumpkin doesn't add the name | A plugin-named logger must be adopted in every plugin's plugin.ts, which parallel plugin units are editing; add the helper and roll it out after they merge. |
| Each plugin hand-rolls unload teardown in a different way and tests the order with 7-17 module mocks | A PluginBase cleanup stack changes unload error semantics for every plugin and replaces each plugin's teardown tests; needs a maintainer decision and a follow-up after the plugin units merge. |
| WASI socket and IPv4 helpers are copied between plugins instead of shared | Deduplicating WASI socket and clock helpers touches plugin-kit, bedrock, upnpumpkin, DH, tab-display and waypoints at once; follow-up after those units merge (U42 already switches bedrock to port-mapping's parseIpv4). |
| Three separate cross-process file-lock implementations and two WIT fetch-and-cache pipelines | U09 (S03-010) and U14 (S04-007) remove two of the three locks; whether the remaining Hermes lock should use a library is a follow-up after they land. |
| @pumpkin-plugins/docs, a README generator, is also the runtime library for plugin info and commands, and the source of monorepo discovery | Size-L architecture change (same as S13-003) that moves the public runtime model; needs the maintainer's decision. |
| A published static-analysis package serves one consumer, while tools/build keeps its own separate TypeScript source analysis | Making @pumpkin-plugins/static-analysis private or folding it into codemod changes a published package; needs the maintainer's decision. |
| Plugin test helpers redeclare the plugin name and the data-folder layout | Cross-plugin test helper adoption touching itests in several parallel units; the bedrock PLUGIN_NAME part is covered by S10-016 in U42. |

## Left unchanged during the fixes

| Finding | Why |
| --- | --- |
| Update notice hardcodes a personal promo line | Needs a maintainer decision. The maintainer added the follow line himself in two feat commits (79d982b79a, fe868f0a28), so removing his own promo line from his own tool is his call. |
| Tests read the patch and manifest source text instead of checking behaviour | Not done. The auto-mode classifier blocked deleting the patch-text and manifest tests in prepare-hermes.test.mjs as security test removal. They are kept; the user has to allow this or delete them. I only changed one assertion string to match the new 0001 guard. |
