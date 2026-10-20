# Review of pumpkin-plugins

A line-by-line review of the whole repository, done in October 2026, and the fixes that came out of it.

## Scope and method

The repository was split into 15 areas. Each area was read in full (generated files, lock files and changelogs excluded; large JSON data checked for shape only). Findings that were unsure, critical or high were then checked by a second reader who tried to refute them; 2 were refuted and 56 corrected. Behaviour of the Pumpkin server was checked against its source at the pinned release `0.2.0+26.3-26.51`.

Fixes were grouped into topic branches. Each branch was tested on its own, then all branches were stacked on `master` and the whole suite was run on the result: build, lint, typecheck, unit tests, script tests, `pnpm check`, `pnpm readme:check`, commitlint and the integration tests against a real Pumpkin server (macOS arm64). Every pull request listed below passed that run before it was merged.

## Numbers

- Findings: 419 (critical 1, high 15, medium 168, low 233 after verification).
- Fixed: 366
- Partly fixed: 26
- Deferred: 21
- Left for the maintainer: 3
- Refuted in verification: 2
- Not a problem on closer reading: 1
- Merged pull requests: 94 (65 review fixes, 17 follow-ups, 12 CI and test fixes).

## Files

- [findings.md](findings.md): every finding by area, with its status and where it was fixed.
- [open-items.md](open-items.md): what is left: deferred findings with the reason, and notes that need a maintainer decision.

## Review fixes

One pull request per topic branch of the review plan. A branch whose last commits were finished after it merged has a second part.

| PR | Branch | Title |
| --- | --- | --- |
| [#1](https://github.com/qhashofficial/pumpkin-plugins/pull/1) | `fix/fresh-clone-build` | fix(scripts): build the Static Hermes runtime before importing it |
| [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) | `fix/shr-shim-commands-lifecycle` | fix(static-hermes-runtime): fix shim command arguments, errors and callback lifecycle |
| [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) | `fix/tab-display-defaults` | fix(tab-display): keep native names without PumpkinPIE and drop dead sorting code |
| [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) | `fix/pumpkin-api-compat-tooling` | fix(pumpkin-api): decouple the operation inventory from the package version |
| [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) | `fix/generator-templates` | fix(generators): add build:parse-ts and stop the starter claiming /plugin |
| [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) | `fix/docs-cli-dist` | fix(docs): publish the docs CLI as compiled JS and mark unreleased plugins |
| [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) | `fix/upnpumpkin-bedrock-tcp` | fix(upnpumpkin): forward TCP 19132 for Bedrock signaling and keep config on reload errors |
| [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) | `fix/pumpkin-api-compiled-output` | fix(pumpkin-api): publish compiled output and fail when registerPlugin is missing |
| [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) | `fix/docs-site-readme-pages` | fix(docs): publish README pages on the docs site and fail on dead links |
| [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) | `fix/bedrock-addon-manager-export` | fix(bedrock-addon-manager): print a pumpkin.toml pack block and restrict pack details to operators |
| [#11](https://github.com/qhashofficial/pumpkin-plugins/pull/11) | `fix/upstream-pin-pr-reuse` | fix(ci): open a new upstream pin PR instead of reopening a closed one |
| [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) | `fix/plugin-kit-command-dispatch` | fix(plugin-kit): document the handleCommand export and reject non-item arguments |
| [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) | `fix/shr-generated-resource-drops` | fix(static-hermes-runtime): emit drops for every imported Pumpkin resource |
| [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) | `fix/dev-pinned-pumpkin` | fix(dev): run the pinned Pumpkin release by default and reuse the harness resolver |
| [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) | `fix/build-cli-update-check` | fix(build): run the update check in the background and publish globals.d.ts |
| [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) | `fix/pie-test-provider-exports` | fix(pumpkin-pie-api): export the test provider and session timing for consumers |
| [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) | `test/split-workflow-tests` | test(scripts): split workflow tests out and match whole script names in check-docs |
| [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) | `fix/waypoints-admin-commands` | fix(waypoints): allow console administration and revoking offline players |
| [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) | `ci/consolidate-gates` | ci: replace gate jobs with one result job and skip suites that changes don't need |
| [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) | `fix/codemod-migration-gaps` | fix(codemod): flag engine changes, accept trailing commas and derive version ranges |
| [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) | `perf/dh-writer-and-cache` | perf(distant-horizons): back the protocol writer with a Uint8Array and bound the cache by bytes |
| [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) | `fix/engine-comparison-report` | fix(engine-comparison): format numbers in en-US and time samples with a monotonic clock |
| [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) | `fix/shr-hermes-patch-series` | fix(static-hermes-runtime): apply Hermes patches in sequence and drop the dead iterator patch |
| [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) | `fix/dynamic-lights-sources` | fix(dynamic-lights): match bare source IDs and key preferences by UUID |
| [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) | `fix/build-bundle-errors-analysis` | fix(build): report bundle failures as build errors and analyze the bundled inputs |
| [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) | `docs/contributor-guides` | docs: fix the testing policy, API pin locations and runtime caveats |
| [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) | `fix/build-wasi-wit-pin` | fix(build): check the WASI WIT version against wasi-capabilities and simplify cache writes |
| [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) | `fix/shr-package-and-readme` | fix(static-hermes-runtime): publish declarations and correct the README coverage text |
| [#29](https://github.com/qhashofficial/pumpkin-plugins/pull/29) | `docs/waypoints-placeholder-guide` | docs(waypoints): fix the placeholder table and move guide prose back into Markdown |
| [#30](https://github.com/qhashofficial/pumpkin-plugins/pull/30) | `fix/port-mapping-nat-reasons` | fix(port-mapping): name the real cause of non-public WAN addresses |
| [#31](https://github.com/qhashofficial/pumpkin-plugins/pull/31) | `fix/npm-publish-scripts` | fix(release): share one pack-and-inspect helper and tag backfill publishes |
| [#32](https://github.com/qhashofficial/pumpkin-plugins/pull/32) | `fix/port-mapping-discovery` | fix(port-mapping): skip idle WAN services and probe the router web page last |
| [#33](https://github.com/qhashofficial/pumpkin-plugins/pull/33) | `fix/market-actions-lookup` | fix(actions): share Market listing lookup and skip re-uploading an existing version |
| [#34](https://github.com/qhashofficial/pumpkin-plugins/pull/34) | `build/turbo-typecheck-outputs` | build(turbo): declare typecheck outputs only where declarations are generated |
| [#35](https://github.com/qhashofficial/pumpkin-plugins/pull/35) | `fix/release-first-release-history` | fix(release): cut first-release history at the introduction commit |
| [#36](https://github.com/qhashofficial/pumpkin-plugins/pull/36) | `ci/labels-and-issue-intake` | ci: generate CodeRabbit labels in Node and test issue intake |
| [#37](https://github.com/qhashofficial/pumpkin-plugins/pull/37) | `fix/minecraft-colors-nesting` | fix(minecraft-colors): reopen the outer style after nested formatting |
| [#38](https://github.com/qhashofficial/pumpkin-plugins/pull/38) | `fix/test-harness-robustness` | fix(test-harness): pin binary checksums and handle musl and signals |
| [#39](https://github.com/qhashofficial/pumpkin-plugins/pull/39) | `refactor/shr-component-api` | refactor(static-hermes-runtime): clean up the component build API and its tests |
| [#40](https://github.com/qhashofficial/pumpkin-plugins/pull/40) | `fix/agent-hooks` | fix(hooks): run script tests for the files they validate and lazy-load workspace imports |
| [#41](https://github.com/qhashofficial/pumpkin-plugins/pull/41) | `fix/create-pumpkin-plugin-scaffold` | fix(create-pumpkin-plugin): simplify project creation and use the detected package manager |
| [#42](https://github.com/qhashofficial/pumpkin-plugins/pull/42) | `test/shr-retarget-oracle-suites` | test(static-hermes-runtime): test the production WIT generator instead of the legacy oracle |
| [#43](https://github.com/qhashofficial/pumpkin-plugins/pull/43) | `fix/plugin-release-scripts` | fix(scripts): absolutize Market README links and share plugin info loading |
| [#44](https://github.com/qhashofficial/pumpkin-plugins/pull/44) | `fix/config-toml-del` | fix(config): escape DEL in TOML strings and table headers |
| [#45](https://github.com/qhashofficial/pumpkin-plugins/pull/45) | `fix/test-harness-robustness-rest` | fix(test-harness): pin binary checksums and handle musl and signals (part 2) |
| [#46](https://github.com/qhashofficial/pumpkin-plugins/pull/46) | `refactor/shr-component-api-rest` | refactor(static-hermes-runtime): clean up the component build API and its tests (part 2) |
| [#47](https://github.com/qhashofficial/pumpkin-plugins/pull/47) | `fix/agent-hooks-rest` | fix(hooks): run script tests for the files they validate and lazy-load workspace imports (part 2) |
| [#48](https://github.com/qhashofficial/pumpkin-plugins/pull/48) | `fix/create-pumpkin-plugin-scaffold-rest` | fix(create-pumpkin-plugin): simplify project creation and use the detected package manager (part 2) |
| [#49](https://github.com/qhashofficial/pumpkin-plugins/pull/49) | `fix/dh-session-requests` | fix(distant-horizons): restart captures on terrain changes and report real rejection reasons |
| [#50](https://github.com/qhashofficial/pumpkin-plugins/pull/50) | `fix/shr-toolchain-pins` | fix(static-hermes-runtime): read toolchain pins from lock files |
| [#51](https://github.com/qhashofficial/pumpkin-plugins/pull/51) | `perf/waypoints-hud-access` | perf(waypoints): cache permission checks in the HUD tick and share distance formatting |
| [#52](https://github.com/qhashofficial/pumpkin-plugins/pull/52) | `fix/cspell-minecraft-words` | fix(cspell-dict-minecraft): add common Minecraft terms and test the packaged dictionary |
| [#53](https://github.com/qhashofficial/pumpkin-plugins/pull/53) | `fix/update-check-dev-mode` | fix(update-check): skip checks in dev builds and test the scheduled path |
| [#54](https://github.com/qhashofficial/pumpkin-plugins/pull/54) | `perf/apple-skin-tick` | perf(apple-skin): read the regeneration game rule once per world per tick |
| [#55](https://github.com/qhashofficial/pumpkin-plugins/pull/55) | `fix/signing-verify` | fix(signing): allow pinning the expected signer and validate metadata types |
| [#56](https://github.com/qhashofficial/pumpkin-plugins/pull/56) | `refactor/engine-comparison-scripts` | refactor(scripts): share GitHub API and output helpers in the engine comparison scripts |
| [#57](https://github.com/qhashofficial/pumpkin-plugins/pull/57) | `docs/repo-skills` | docs(skills): fix errors and repo-rule conflicts in local skills |
| [#58](https://github.com/qhashofficial/pumpkin-plugins/pull/58) | `perf/static-analysis-probes` | perf(static-analysis): cache browser-field probes and resolve edges in parallel |
| [#59](https://github.com/qhashofficial/pumpkin-plugins/pull/59) | `ci/cache-and-clone-costs` | ci: save caches only on the default branch and fix the malloc benchmark cache |
| [#60](https://github.com/qhashofficial/pumpkin-plugins/pull/60) | `fix/docs-pipeline-turbo` | fix(docs): build docs types through Turbo so a fresh clone works |
| [#61](https://github.com/qhashofficial/pumpkin-plugins/pull/61) | `refactor/docs-generator-hooks` | refactor(docs): drop one-shot README migrations from package doc generators |
| [#62](https://github.com/qhashofficial/pumpkin-plugins/pull/62) | `chore/repo-config-hygiene` | chore: restore the release-age guard and clean up repo config |
| [#63](https://github.com/qhashofficial/pumpkin-plugins/pull/63) | `docs/ci-release-benchmark-guides` | docs: correct the CI, release and benchmark guides |
| [#65](https://github.com/qhashofficial/pumpkin-plugins/pull/65) | `docs/dh-readme-and-tests` | docs(distant-horizons): trim the README and test behaviour instead of wiring |
| [#66](https://github.com/qhashofficial/pumpkin-plugins/pull/66) | `ci/reusable-plugin-publish` | ci(release): share the plugin publish workflow between release and recovery |

## Follow-ups

Later pull requests that fixed or finished findings: the sweeps over what the first fixes left, and the refactors that were deferred until the branches they touched had merged.

| PR | Branch | Title |
| --- | --- | --- |
| [#68](https://github.com/qhashofficial/pumpkin-plugins/pull/68) | `fix/review-leftovers-tooling` | fix: clear review leftovers in tooling, CI and docs |
| [#69](https://github.com/qhashofficial/pumpkin-plugins/pull/69) | `fix/review-leftovers-plugins` | fix: clear review leftovers in plugins and APIs |
| [#70](https://github.com/qhashofficial/pumpkin-plugins/pull/70) | `ci/pin-action-digests` | ci: pin third-party actions to commit SHAs |
| [#71](https://github.com/qhashofficial/pumpkin-plugins/pull/71) | `ci/drop-step-summary-table` | ci: drop the step-outcome table from job summaries |
| [#72](https://github.com/qhashofficial/pumpkin-plugins/pull/72) | `refactor/build-stage-replace` | refactor(build): share one stage-and-replace routine for build outputs |
| [#73](https://github.com/qhashofficial/pumpkin-plugins/pull/73) | `refactor/terrain-drop-speculative-api` | refactor(terrain): remove the chunk loader and generator API that is never available |
| [#74](https://github.com/qhashofficial/pumpkin-plugins/pull/74) | `refactor/dynamic-lights-plugin-split` | refactor(dynamic-lights): split plugin.ts into lifecycle, events and sync modules |
| [#75](https://github.com/qhashofficial/pumpkin-plugins/pull/75) | `test/shr-colocate-unit-tests` | test(static-hermes-runtime): keep unit tests beside their modules |
| [#76](https://github.com/qhashofficial/pumpkin-plugins/pull/76) | `refactor/shared-wasi-net-helpers` | refactor: share the WASI socket and IPv4 helpers between plugins |
| [#77](https://github.com/qhashofficial/pumpkin-plugins/pull/77) | `feat/plugin-named-logger` | feat(plugin-kit): name the plugin in every log line |
| [#78](https://github.com/qhashofficial/pumpkin-plugins/pull/78) | `refactor/engine-comparison-src` | refactor(engine-comparison): move the benchmark code out of test/ |
| [#79](https://github.com/qhashofficial/pumpkin-plugins/pull/79) | `refactor/build-wit-method-usage` | refactor(build): split the WIT method usage analysis into modules |
| [#80](https://github.com/qhashofficial/pumpkin-plugins/pull/80) | `refactor/changed-areas-modules` | refactor(scripts): split changed-areas into modules |
| [#84](https://github.com/qhashofficial/pumpkin-plugins/pull/84) | `fix/engine-comparison-parser-mode` | fix(engine-comparison): detect the parser mode the builder reports again |
| [#87](https://github.com/qhashofficial/pumpkin-plugins/pull/87) | `refactor/dh-session-split` | refactor(distant-horizons): split session.ts by responsibility |
| [#88](https://github.com/qhashofficial/pumpkin-plugins/pull/88) | `refactor/shr-drop-handwritten-host-api` | refactor(static-hermes-runtime): use the generated host API instead of the hand-written copy |
| [#90](https://github.com/qhashofficial/pumpkin-plugins/pull/90) | `perf/dh-capture-scheduler` | perf(distant-horizons): capture each section once and resolve players once per tick |

## CI and test fixes

Pull requests that no finding asked for: fixes for CI jobs and flaky tests, and small cleanups.

| PR | Branch | Title |
| --- | --- | --- |
| [#64](https://github.com/qhashofficial/pumpkin-plugins/pull/64) | `test/stabilize-timing-tests` | test: make the dev hot-reload and forced-capture budget tests deterministic |
| [#67](https://github.com/qhashofficial/pumpkin-plugins/pull/67) | `test/vitest-cache-race` | test: give each package its own vitest module cache |
| [#81](https://github.com/qhashofficial/pumpkin-plugins/pull/81) | `test/engine-comparison-colocate` | test(engine-comparison): keep unit tests beside their modules |
| [#82](https://github.com/qhashofficial/pumpkin-plugins/pull/82) | `fix/ci-test-cold-cache` | test: make the CI test job pass on a runner with a cold cache |
| [#83](https://github.com/qhashofficial/pumpkin-plugins/pull/83) | `fix/external-consumer-json-output` | fix(scripts): keep build output out of the JSON the external consumer check parses |
| [#85](https://github.com/qhashofficial/pumpkin-plugins/pull/85) | `fix/docs-dead-links` | docs: fix the dead links that fail the documentation build |
| [#86](https://github.com/qhashofficial/pumpkin-plugins/pull/86) | `ci/skip-secret-jobs-on-forks` | ci: skip jobs that need repository secrets when running in a fork |
| [#89](https://github.com/qhashofficial/pumpkin-plugins/pull/89) | `refactor/benchmark-chart-steps` | refactor(engine-comparison): split the chart renderer into drawing steps |
| [#91](https://github.com/qhashofficial/pumpkin-plugins/pull/91) | `fix/windows-wit-fetch` | fix: make the pinned Pumpkin WIT fetch work on Windows |
| [#92](https://github.com/qhashofficial/pumpkin-plugins/pull/92) | `fix/hermes-build-cache-toolchain` | fix: stop cached Hermes builds from including a deleted toolchain file |
| [#93](https://github.com/qhashofficial/pumpkin-plugins/pull/93) | `test/ci-run-all-unit-tests` | test: run every package's unit tests in CI |
| [#94](https://github.com/qhashofficial/pumpkin-plugins/pull/94) | `fix/pumpkin-api-typecheck-order` | build(turbo): build the Static Hermes runtime before typechecking pumpkin-api |
