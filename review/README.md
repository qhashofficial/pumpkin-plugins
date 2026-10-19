# Review of pumpkin-plugins

A line-by-line review of the whole repository, done in October 2026, and the fixes that came out of it.

## Scope and method

The repository was split into 15 areas. Each area was read in full (generated files, lock files and changelogs excluded; large JSON data checked for shape only). Findings that were unsure, critical or high were then checked by a second reader who tried to refute them; 2 were refuted and 56 corrected. Behaviour of the Pumpkin server was checked against its source at the pinned release `0.2.0+26.3-26.51`.

Fixes were grouped into topic branches. Each branch was tested on its own, then all branches were stacked on `master` and the whole suite was run on the result: build, lint, typecheck, unit tests, script tests, `pnpm check`, `pnpm readme:check`, commitlint and the integration tests against a real Pumpkin server (macOS arm64). Every pull request listed below passed that run before it was merged.

## Numbers

- Findings: 419 (critical 1, high 15, medium 168, low 233 after verification).
- Fixed: 335
- Deferred: 40
- Partly fixed: 40
- Left for the maintainer: 2
- Refuted in verification: 2

## Files

- [findings.md](findings.md): every finding by area, with its status and where it was fixed.
- [open-items.md](open-items.md): what is left: deferred findings with the reason, and notes that need a maintainer decision.

## Pull requests

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
| [#49](https://github.com/qhashofficial/pumpkin-plugins/pull/49) | `fix/dh-session-requests` | fix(distant-horizons): restart captures on terrain changes and report real rejection reasons |
| [#50](https://github.com/qhashofficial/pumpkin-plugins/pull/50) | `fix/shr-toolchain-pins` | fix(static-hermes-runtime): read toolchain pins from lock files |
| [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) | `fix/build-wasi-wit-pin` | fix(build): check the WASI WIT version against wasi-capabilities and simplify cache writes |
| [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) | `fix/shr-package-and-readme` | fix(static-hermes-runtime): publish declarations and correct the README coverage text |
| [#59](https://github.com/qhashofficial/pumpkin-plugins/pull/59) | `ci/cache-and-clone-costs` | ci: save caches only on the default branch and fix the malloc benchmark cache |
| [#29](https://github.com/qhashofficial/pumpkin-plugins/pull/29) | `docs/waypoints-placeholder-guide` | docs(waypoints): fix the placeholder table and move guide prose back into Markdown |
| [#30](https://github.com/qhashofficial/pumpkin-plugins/pull/30) | `fix/port-mapping-nat-reasons` | fix(port-mapping): name the real cause of non-public WAN addresses |
| [#60](https://github.com/qhashofficial/pumpkin-plugins/pull/60) | `fix/docs-pipeline-turbo` | fix(docs): build docs types through Turbo so a fresh clone works |
| [#61](https://github.com/qhashofficial/pumpkin-plugins/pull/61) | `refactor/docs-generator-hooks` | refactor(docs): drop one-shot README migrations from package doc generators |
| [#31](https://github.com/qhashofficial/pumpkin-plugins/pull/31) | `fix/npm-publish-scripts` | fix(release): share one pack-and-inspect helper and tag backfill publishes |
| [#32](https://github.com/qhashofficial/pumpkin-plugins/pull/32) | `fix/port-mapping-discovery` | fix(port-mapping): skip idle WAN services and probe the router web page last |
| [#33](https://github.com/qhashofficial/pumpkin-plugins/pull/33) | `fix/market-actions-lookup` | fix(actions): share Market listing lookup and skip re-uploading an existing version |
| [#34](https://github.com/qhashofficial/pumpkin-plugins/pull/34) | `build/turbo-typecheck-outputs` | build(turbo): declare typecheck outputs only where declarations are generated |
| [#35](https://github.com/qhashofficial/pumpkin-plugins/pull/35) | `fix/release-first-release-history` | fix(release): cut first-release history at the introduction commit |
| [#62](https://github.com/qhashofficial/pumpkin-plugins/pull/62) | `chore/repo-config-hygiene` | chore: restore the release-age guard and clean up repo config |
| [#63](https://github.com/qhashofficial/pumpkin-plugins/pull/63) | `docs/ci-release-benchmark-guides` | docs: correct the CI, release and benchmark guides |
| [#36](https://github.com/qhashofficial/pumpkin-plugins/pull/36) | `ci/labels-and-issue-intake` | ci: generate CodeRabbit labels in Node and test issue intake |
| [#37](https://github.com/qhashofficial/pumpkin-plugins/pull/37) | `fix/minecraft-colors-nesting` | fix(minecraft-colors): reopen the outer style after nested formatting |
| [#42](https://github.com/qhashofficial/pumpkin-plugins/pull/42) | `test/shr-retarget-oracle-suites` | test(static-hermes-runtime): test the production WIT generator instead of the legacy oracle |
| [#65](https://github.com/qhashofficial/pumpkin-plugins/pull/65) | `docs/dh-readme-and-tests` | docs(distant-horizons): trim the README and test behaviour instead of wiring |
| [#43](https://github.com/qhashofficial/pumpkin-plugins/pull/43) | `fix/plugin-release-scripts` | fix(scripts): absolutize Market README links and share plugin info loading |
| [#38](https://github.com/qhashofficial/pumpkin-plugins/pull/38) | `fix/test-harness-robustness` | fix(test-harness): pin binary checksums and handle musl and signals |
| [#39](https://github.com/qhashofficial/pumpkin-plugins/pull/39) | `refactor/shr-component-api` | refactor(static-hermes-runtime): clean up the component build API and its tests |
| [#40](https://github.com/qhashofficial/pumpkin-plugins/pull/40) | `fix/agent-hooks` | fix(hooks): run script tests for the files they validate and lazy-load workspace imports |
| [#41](https://github.com/qhashofficial/pumpkin-plugins/pull/41) | `fix/create-pumpkin-plugin-scaffold` | fix(create-pumpkin-plugin): simplify project creation and use the detected package manager |
| [#51](https://github.com/qhashofficial/pumpkin-plugins/pull/51) | `perf/waypoints-hud-access` | perf(waypoints): cache permission checks in the HUD tick and share distance formatting |
| [#53](https://github.com/qhashofficial/pumpkin-plugins/pull/53) | `fix/update-check-dev-mode` | fix(update-check): skip checks in dev builds and test the scheduled path |
| [#44](https://github.com/qhashofficial/pumpkin-plugins/pull/44) | `fix/config-toml-del` | fix(config): escape DEL in TOML strings and table headers |
| [#52](https://github.com/qhashofficial/pumpkin-plugins/pull/52) | `fix/cspell-minecraft-words` | fix(cspell-dict-minecraft): add common Minecraft terms and test the packaged dictionary |
| [#54](https://github.com/qhashofficial/pumpkin-plugins/pull/54) | `perf/apple-skin-tick` | perf(apple-skin): read the regeneration game rule once per world per tick |
| [#55](https://github.com/qhashofficial/pumpkin-plugins/pull/55) | `fix/signing-verify` | fix(signing): allow pinning the expected signer and validate metadata types |
| [#56](https://github.com/qhashofficial/pumpkin-plugins/pull/56) | `refactor/engine-comparison-scripts` | refactor(scripts): share GitHub API and output helpers in the engine comparison scripts |
| [#57](https://github.com/qhashofficial/pumpkin-plugins/pull/57) | `docs/repo-skills` | docs(skills): fix errors and repo-rule conflicts in local skills |
| [#58](https://github.com/qhashofficial/pumpkin-plugins/pull/58) | `perf/static-analysis-probes` | perf(static-analysis): cache browser-field probes and resolve edges in parallel |
