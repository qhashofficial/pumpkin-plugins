# Findings

Status is one of: fixed (with the pull request), partly fixed, left for the maintainer, deferred, not a problem on closer reading, or not started.

## Static Hermes runtime (src)

| Severity | Finding | Status |
| --- | --- | --- |
| high | Generated Pumpkin resource drops miss most resources, so drop() is a silent no-op and host handles leak | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| high | ConsumedArgs.getValue never uses the generated adapter and rejects players, positions and most argument kinds | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| high | command-failed errors lose their text because setCommandFailure only accepts the hand-written TextObject | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | nativeResource calls getHostObject on arbitrary objects (undefined behaviour in Hermes) | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| high | Promise jobs are never drained, so async continuations never run on Static Hermes | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| low | on_unload and other callbacks dereference jsRuntime without checking it, and Pumpkin calls on_unload after a failed load | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | handle_ipc_message never frees its owned sender and message arguments | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | Hand-written host API and resource classes duplicate the generator, and the copies diverge | Deferred |
| low | Unchecked double-to-integer casts on live paths (command result, scheduler ids) | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | get-metadata hides the real error and returns a plugin named 'unknown' | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| low | result<T> with a unit error returns {tag:'err'} on failure but the bare value on success | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| medium | Each resource property access scans hundreds of string comparisons and allocates new host functions | Deferred |
| medium | wasm-tools release pins are hardcoded in TypeScript instead of the toolchain lock | Fixed on `fix/shr-toolchain-pins` (not merged yet) |
| medium | A different wit-bindgen in ~/.cargo/bin blocks setup instead of falling back to the pinned install | Partly fixed on `fix/shr-toolchain-pins` (not merged yet) |
| low | Hermes build fingerprint covers every src/hermes module and cli.ts, so any edit forces a full rebuild | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| low | Patch series applicability is checked up front, so overlapping patches show false conflicts | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| low | Hermes build writes into the WASI SDK installation | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| low | Toolchain lookups share the long Hermes prepare.lock | Fixed on `fix/shr-toolchain-pins` (not merged yet) |
| low | Facades wrap resource results by regex on type strings; nested resources come back raw and class names repeat | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| low | WIT naming and helper functions are copied across six generator modules | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| low | Dead or pass-through code in the WIT pipeline | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| low | Two exported buildStaticHermesComponent functions with different shapes; codegen duplicates component analysis | Not started |
| low | The runtime package hardcodes the update-check package API for dev builds | Not started |
| low | Bytecode is embedded as a hex initializer list | Not started |
| low | Unit tests assert wiring and exact argv instead of behaviour; the optional event-result marker exists only for fixtures | Not started |
| medium | Runtime docs still describe a hand-picked API subset and omit Static Hermes engine caveats | Partly fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |

## Static Hermes runtime (tests, patches, docs)

| Severity | Finding | Status |
| --- | --- | --- |
| medium | Most WIT/codegen tests exercise the frozen legacy oracle, not the shipped generator | Not started |
| high | Operation inventory pins the pumpkin-api package version, so a release bump breaks this package's tests | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| medium | pumpkin-api compatibility matrix is generated from static-hermes-runtime test fixtures using the legacy oracle parser | Deferred |
| medium | Patch 0008 string-iterator fast path never runs for plugin components | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| medium | Hermes patch series has no rationale, no upgrade guide and no executed tests | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| low | Real-server event-result test cannot fail when cancellation is ignored | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | Hand-maintained test file list in package.json silently skips new tests | Fixed in [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) |
| medium | wit-api-coverage hard-codes WIT and WASI counts that change with every pin bump | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| medium | Tests read the patch and manifest source text instead of checking behaviour | Left for the maintainer |
| medium | Unit tests for src modules live in test/ and duplicate co-located suites | Deferred |
| medium | Fake git and cmake shells and mocked runners are coupled to exact argv | Fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| medium | Documented AI-goal and void-callback error handling is untested | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| medium | docs.ts keeps one-shot prose migrations that block handwritten doc edits | Fixed on `refactor/docs-generator-hooks` (not merged yet) |
| medium | Public types point at TS source, so consumers must enable allowImportingTsExtensions | Fixed in [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) |
| medium | README says the shim implements only part of the Pumpkin API | Fixed in [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) |
| low | Weak and vacuous assertions in codegen and event-dispatch tests | Partly fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| low | Toolchain tests hard-code pinned versions that are already read from the lock files | Fixed on `fix/shr-toolchain-pins` (not merged yet) |
| low | C++ contract fixtures each redefine fake runtime types and copy WitScopeGuard | Partly fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| low | CLI help asserted through full-text snapshots on top of option checks | Not started |
| low | Patch 0001 depends on the toolchain file name, and the toolchain copies upstream instead of including it | Partly fixed in [#23](https://github.com/qhashofficial/pumpkin-plugins/pull/23) |
| low | Small README and doc inaccuracies and gaps | Fixed in [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) |
| low | Unused schema copies shipped in the package; tsconfig includes a deleted bin/ directory | Fixed in [#28](https://github.com/qhashofficial/pumpkin-plugins/pull/28) |

## pumpkin-api, codemod, wasi-capabilities

| Severity | Finding | Status |
| --- | --- | --- |
| high | Published .ts sources force allowImportingTsExtensions and consumer strictness onto plugin authors; migration never sets it | Fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| medium | Codemod silently switches migrated plugins from QuickJS to Static Hermes, contradicting the migration guide | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| medium | Codemod rejects tsconfig.json files with trailing commas | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| medium | No facade API for command-node handlers, so plugin-kit runs a second handler-ID space that can collide | Deferred |
| medium | registerEvent `blocking` and EventHandler return-value docs don't match Pumpkin's dispatch | Fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| medium | CommandHandler doesn't say how to fail a command (WIT result<s32, command-error>) | Fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| medium | Compatibility audit mislabels source-breaking public type changes as 'retained' and omits additions | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| medium | API compatibility audit is owned by another package's test fixtures and ships in the npm tarball half-broken | Deferred |
| medium | WIT digest algorithm and compatibility-matrix types are duplicated three times | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| medium | Hand-rolled cross-process cache lock in wit.mjs is unnecessary and can stall builds for 15 minutes | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | WIT fetch clones all commits and trees before a depth-1 fetch | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | gen-types.mjs duplicates the builder's type generation and mishandles an empty cache env var | Partly fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| medium | Docs still describe the packages as unreleased | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| medium | Hardcoded '^0.1.0' range is reused for the builder and will pin migrations to stale versions | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| medium | JSONC package.json support and array de-duplication are speculative machinery | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| low | update-build resolves the installed builder from cwd and adds a note for every unrelated package.json | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| low | Source migration misses mocked module specifiers that the docs say are updated | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| low | Tests pin exact messages and implementation details | Partly fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | Real-server test covers only Static Hermes and a narrow slice of the facade | Partly fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| low | Missing registerPlugin call loads silently as plugin 'unknown' | Fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| low | Handler registry layout is split oddly, with copy-pasted AI-goal dispatchers | Fixed in [#8](https://github.com/qhashofficial/pumpkin-plugins/pull/8) |
| low | Inaccurate or redundant JSDoc in wit and codemod helpers | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| low | Duplicate build-script failure branches in package-json migration | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |
| low | Empty build-migration registry carries selection and composition machinery | Refuted in verification |
| low | Dead legacy-subdirectory fallbacks and loose matrix types in compatibility-audit | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | Migration guide assumes `.cache/` and `build/` are ignored in migrated projects | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | Codemod hardcodes the builder's external-module boundary | Fixed in [#20](https://github.com/qhashofficial/pumpkin-plugins/pull/20) |

## Build tool and static analysis

| Severity | Finding | Status |
| --- | --- | --- |
| medium | Update check is awaited before the build starts, contrary to docs and its own JSDoc | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| low | Biome unused-import warnings in cli.ts and cli.test.ts; executeCli has no test | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| medium | User-fixable build failures escape as plain Error with a stack trace instead of BuildError | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| medium | Adapter analysis re-resolves the module graph with TypeScript instead of using what esbuild actually bundled | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| medium | wit-method-usage.ts is one 590-line closure with duplicated import logic and test-only exports | Deferred |
| medium | Three copies of the 'stage, move aside, rename, restore' publish routine | Deferred |
| medium | 224-line PID/mtime file lock guards renames of identical, hash-verified content; misnamed for its second use | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| medium | WASI version has two unchecked sources of truth | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| medium | globals.d.ts (__PLUGIN_VERSION__, __PUMPKIN_DEV_MODE__) is not published | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| medium | runtime/README.md claims a CI release gate that was removed | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| medium | Tests assert exact output, mock behaviour or call counts instead of outcomes | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| medium | static-hermes-plugin.test.ts tests another package and couples to a plugin directory | Not started |
| low | static-analysis runs a full esbuild build per edge on the browser platform | Not started |
| low | 5 MiB size gate is toggled by matching the root package.json repository URL | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| low | Defaults repeated in several places; dead branch and odd label in output | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| low | Dead parameters and legacy cleanup in the CLI and prepareWit | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| low | CLI loads TypeScript and the Static Hermes runtime eagerly; jco runs on every Static Hermes build | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| low | camelCase-to-WIT name mapping is lossy for consecutive single-letter segments | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| medium | Method analysis ignores destructuring outside variable declarations | Fixed in [#25](https://github.com/qhashofficial/pumpkin-plugins/pull/25) |
| low | API package resolution silently falls back to an undeclared hoisted copy | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| low | Published build package bundles minecraft-colors from workspace source but still depends on it | Fixed in [#15](https://github.com/qhashofficial/pumpkin-plugins/pull/15) |
| low | docs.ts is not typechecked; build typecheck waits on its own build | Not started |
| low | runtime-provenance.test.ts hardcodes values from provenance.json | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| low | WASI WIT download has no explicit timeout | Fixed in [#27](https://github.com/qhashofficial/pumpkin-plugins/pull/27) |
| low | Update notice hardcodes a personal promo line | Left for the maintainer |
| low | README wording: fixed entry claim and dense, AI-sounding prose in static-analysis | Not started |

## Release scripts and root config

| Severity | Finding | Status |
| --- | --- | --- |
| medium | Root typecheck task declares build/types/** outputs that most packages never produce | Not started |
| medium | First-release history for a 0.0.0 component is not cut at its introduction commit | Not started |
| medium | Release selector drops shipped files of npm tools (public testing helpers, template READMEs) | Not started |
| medium | Renovate commits are all chore(deps), so dependency updates never reach released plugins or tools | Not started |
| medium | Supply-chain release-age guard disabled repo-wide while Renovate automerges minors | Not started |
| medium | `pnpm run docs` and `dev:docs` fail on a fresh clone because the builder CLI is not built first | Fixed on `fix/docs-pipeline-turbo` (not merged yet) |
| medium | Market listing description keeps README-relative links that break on market.pumpkinmc.org | Not started |
| medium | Pack-and-inspect logic is implemented three times and the real adapter only runs at release time | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | scripts/market-plugin-name.mjs is dead code, and its test file tests release.yml | Not started |
| low | release-please version is pinned in three places and loaded through a pnpm dlx CLI-path indirection | Deferred |
| low | release.test.mjs tests utils modules while release.mjs's workflow output contract is untested | Not started |
| low | Pre-major bump options are forced in code as well as required in config | Not started |
| low | npm-bootstrap hardcodes the GitHub repository | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | npm-bootstrap 'trust changes' assertion can never fail and the message describes nothing the script does | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | Tests keep vestigial assertions from older behaviour | Not started |
| low | unpin-release-as.mjs points to a docs heading that does not exist | Not started |
| low | Stale claims that pnpm-workspace.yaml pins the Pumpkin API ABI | Not started |
| low | Automated npm publish always moves the latest dist-tag | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | package-extension.mjs can leave package.json rewritten and has a dead normalization path | Not started |
| low | register-public-tool's atomic write is over-engineered and its test patches fs | Not started |
| low | Five different 'is this the entry module' idioms across release scripts | Not started |
| low | Plugin info-module loading is duplicated with inconsistent name validation | Not started |
| low | Root typecheck makes every package wait for the plugin builder build | Not started |
| low | turbo.json repeats the Static Hermes env list four times | Not started |
| low | release-commits.mjs has dead branches and duplicated test-file patterns | Not started |
| low | Release-critical .mjs scripts are never type-checked | Partly fixed on `fix/docs-pipeline-turbo` (not merged yet) |
| low | npm registry lookups are duplicated and use two requests where one suffices | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | .vscode settings hardcode one platform and duplicate schema mappings | Not started |
| low | Root .gitignore, .gitattributes and .npmrc leave gaps or are dead | Not started |
| low | package-metadata description message disagrees with the limit | Not started |

## Dev and check scripts, agent hooks, generators

| Severity | Finding | Status |
| --- | --- | --- |
| critical | Fresh clone: `pnpm build` and `pnpm test:scripts` fail because build.mjs statically imports an unbuilt package | Fixed in [#1](https://github.com/qhashofficial/pumpkin-plugins/pull/1) |
| high | Plugin generator template has no `build:parse-ts` script | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| medium | Starter plugin registers `/plugin`, which is Pumpkin's built-in plugin management command | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| medium | `pnpm dev` runs the latest Pumpkin release instead of the pinned one, and reimplements the harness downloader | Fixed in [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) |
| low | `pnpm dev --help` describes `--release` wrongly | Fixed in [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) |
| medium | Completion hook skips script tests for files they validate, and runs every package's tests for generator templates | Not started |
| medium | checks.test.mjs pins workflow implementation details and mixes unrelated concerns | Fixed in [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) |
| medium | External-consumer tests hardcode Node versions that break when .node-version changes | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| medium | Upstream pin reconcile tries to reopen a closed PR after its branch was deleted and re-pushed | Fixed in [#11](https://github.com/qhashofficial/pumpkin-plugins/pull/11) |
| low | Upstream pin issue lookup downloads 1000 issue bodies to find one marker | Fixed in [#11](https://github.com/qhashofficial/pumpkin-plugins/pull/11) |
| medium | changed-areas hardcodes action consumers and a cross-plugin integration dependency | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| medium | changed-areas.mjs is a 490-line top-level script with duplicated, heuristic discovery | Deferred |
| low | Benchmark charts accumulate forever on a branch forked from master | Not started |
| low | Baseline discovery can page through the whole CI run history, two API calls per run | Not started |
| low | Engine comparison scripts duplicate their GitHub API helpers | Not started |
| medium | check-docs counts a root script as documented when only a longer `name:suffix` script is mentioned | Fixed in [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) |
| low | check-docs uses its own heading slugs, link regex and CI-job parsing | Fixed in [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) |
| medium | Extension template hardcodes `engines.vscode` instead of reading the catalog `@types/vscode` | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| low | Extension README template HTML-escapes the display name and description | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| low | Generator templates hardcode owner metadata that package-metadata can derive | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| low | Codex adapter maps Edit and Write tool names that Codex never sends | Not started |
| low | Hooks hash every dirty file on each tool call and run uncached readme checks at every completion | Not started |
| low | Codex adapter tests write to the real hook scope directory and assert exact prose | Not started |
| low | clean.mjs hardcodes workspace folders and misses tools/apis/* | Fixed in [#1](https://github.com/qhashofficial/pumpkin-plugins/pull/1) |
| low | Hand-rolled `files` glob matching handles `**` incorrectly; three glob implementations | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | CLI help test keeps a hand-written script list | Not started |
| medium | No test covers the dev hot-reload copy path | Fixed in [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) |
| low | Generator config repeats prompts and release registration three times | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| low | Generators call `pnpm` through execFileSync, which fails on Windows | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| low | Stale or inaccurate comments and dead checks in scripts and hooks | Fixed in [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) |
| low | pinned-pumpkin-links reads PUMPKIN_RELEASE with a regex | Fixed in [#1](https://github.com/qhashofficial/pumpkin-plugins/pull/1) |
| low | Tarball lookup by name prefix can pick the wrong package | Fixed on `fix/npm-publish-scripts` (not merged yet) |
| low | check-docs.test.mjs runs the full docs check against the live repo through a symlink farm | Fixed in [#17](https://github.com/qhashofficial/pumpkin-plugins/pull/17) |
| low | JSDoc style differs across scripts | Deferred |
| low | Codex hooks crash before `pnpm install` because guard.mjs imports a workspace package | Not started |

## GitHub workflows and actions

| Severity | Finding | Status |
| --- | --- | --- |
| high | Upstream pin reconcile tries to reopen a closed PR whose branch was deleted, so the scheduled workflow fails every day | Fixed in [#11](https://github.com/qhashofficial/pumpkin-plugins/pull/11) |
| medium | Third-party actions pinned by mutable tag while holding write-scoped App tokens or secrets | Deferred |
| medium | Actions cache is over the 10 GB limit because of per-run and per-commit keys, which evicts the 8-minute Static Hermes build | Fixed on `ci/cache-and-clone-costs` (not merged yet) |
| medium | Action tests run twice: once in the coverage Test job and again in a per-action matrix with a full bootstrap each | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| medium | Four near-identical gate jobs and a 60-line release `if` encode CI selection logic in YAML | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| low | Release-merge fast path misses the bot's starter-sync commit, and the release PR job pushes three separate bot commits | Partly fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| medium | Engine comparison (11 jobs) runs on every code change although it never gates anything | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| medium | Malloc benchmark cache is hit but each variant still spends about 9 minutes in benchmark:build | Fixed on `ci/cache-and-clone-costs` (not merged yet) |
| medium | External consumer runs the full Linux/macOS/Windows matrix on every code PR | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| medium | Toolchain versions hardcoded in YAML instead of read from their source of truth | Partly fixed on `fix/shr-toolchain-pins` (not merged yet) |
| medium | Full-history clones of a 500 MB repo on the critical path and in jobs that do not need history | Fixed on `ci/cache-and-clone-costs` (not merged yet) |
| medium | Docs workflow repeats CI's docs checks and uploads two site artifacts on PRs that publish nothing | Partly fixed on `fix/docs-pipeline-turbo` (not merged yet) |
| medium | Recover workflow re-implements the release asset and Market pipeline, and tag verification is copied four times | Not started |
| medium | CI build exports the release signing key to the job environment although release.yml re-signs every asset | Partly fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| low | Benchmark comment never posts on fork PRs because workflow_run.pull_requests is empty for forks | Fixed on `ci/cache-and-clone-costs` (not merged yet) |
| medium | Market listing lookup duplicated across the publish and update actions with divergent behaviour | Fixed on `fix/market-actions-lookup` (not merged yet) |
| low | Name lookup searches only the first 20 results, so a release can silently skip Market publishing | Fixed on `fix/market-actions-lookup` (not merged yet) |
| low | Publish action docs tell users to upload signed artifacts, while this repo strips signatures before Market | Fixed on `fix/market-actions-lookup` (not merged yet) |
| low | Re-running a partly failed Market job re-uploads an existing version | Fixed on `fix/market-actions-lookup` (not merged yet) |
| medium | Label sync embeds about 70 lines of Ruby and pushes generated config straight to master | Not started |
| medium | Issue intake parser has no tests, and the form rules duplicate template data | Not started |
| low | Job-summary step-outcome table repeats the GitHub UI and requires toJSON(steps) plumbing, which carries App tokens | Deferred |
| low | Artifact cleanup jobs spend runners deleting artifacts that already expire after one day | Partly fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| low | Build job runs `pnpm run build` twice plus a smoke integration test the integration job repeats | Fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| low | setup-static-hermes installs the Rust toolchain in every job even when wit-bindgen is cached | Fixed on `fix/shr-toolchain-pins` (not merged yet) |
| low | Upstream pin validation builds Hermes with an unpinned, uncached toolchain, unlike CI | Fixed on `ci/cache-and-clone-costs` (not merged yet) |
| low | Action tests pass the whole runner environment to the spawned action | Fixed on `fix/market-actions-lookup` (not merged yet) |
| low | CI docs claim nine engine configurations while the matrix runs eleven | Not started |
| low | `main` branch triggers are dead configuration while the logic hardcodes `master` | Partly fixed in [#19](https://github.com/qhashofficial/pumpkin-plugins/pull/19) |
| low | Bug report form doesn't ask for the client edition (Java/Bedrock) | Not started |
| low | Per-plugin labels are hand-maintained and new plugins don't get one | Not started |

## Distant Horizons plugin and terrain

| Severity | Finding | Status |
| --- | --- | --- |
| medium | Byte-by-byte number[] Writer on the transfer, encode and cache hot paths | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| medium | session.ts (838 lines) mixes protocol handling, capture scheduling, refresh, transfer pacing and status | Deferred |
| low | /dhs status shows capture progress only when requests[0] is the one being built | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | A block change in a section rejects every pending request for it instead of restarting the capture | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | Capture scheduler interleaves many partial builders and can capture the same section twice | Deferred |
| low | Work-cost and handler timing use Date.now although the plugin already has a monotonic clock | Fixed on `fix/dh-session-requests` (not merged yet) |
| low | tick() re-resolves every player's host handles many times per tick, including idle clients | Deferred |
| low | Any error inside a peer callback is treated as 'player gone' and ends the session or forced job with a misleading reason | Fixed on `fix/dh-session-requests` (not merged yet) |
| low | Malformed or incompatible DH messages close the session but are logged at debug as 'Ignoring' | Fixed on `fix/dh-session-requests` (not merged yet) |
| high | World change sends a DH close message and then immediately a new level init; DH client behaviour unverified | Deferred |
| medium | Wire format is only tested against the plugin's own encoder; no golden fixtures or client-level E2E | Deferred |
| low | Block state properties sorted with localeCompare | Refuted in verification |
| medium | Unsupported world setup (unknown dimension height, non-DH world name) fails every request silently | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | /dhs generate and /dhs cache recover refuse Bedrock operators though they need no DH client | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | Forced capture uses a fixed 32,768 samples per tick, ignoring MSPT and blocks_per_tick | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| low | Sample counting, section region and section-position packing are duplicated | Partly fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| medium | Terrain package ships speculative chunk-loader/generator machinery that is always 'unavailable' | Deferred |
| low | Terrain package metadata contradicts its README | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| medium | Config file I/O borrows the DH protocol codec for UTF-8 and caps config.toml at 64 KiB | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| medium | Memory cache is bounded by entry count, not bytes | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| low | Interrupted cache writes leave .tmp files that are never cleaned up | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| low | Startup log points to a README section that does not exist | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | README and guides repeat the same terrain/bandwidth details and disagree in places | Not started |
| low | User-facing numbers shown as '16_384' and other text inconsistencies | Fixed on `fix/dh-session-requests` (not merged yet) |
| medium | Unit tests pin exact formatted output and mock-wired internals | Not started |
| low | Generic Static Hermes resource-disposal regression lives in the DH plugin's integration suite | Fixed in [#2](https://github.com/qhashofficial/pumpkin-plugins/pull/2) |
| low | Test-only exports and an inverted import through session.ts | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| low | docs.ts deep-imports PumpkinPIE source by relative path | Fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | Re-validation rejects always say 'Request no longer in range' | Fixed on `fix/dh-session-requests` (not merged yet) |
| low | Log prefixes and value formatting are inconsistent with the code style | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |
| low | Confusing names: left() vs playerLeft(), cached_requests_per_tick budgets uncached checks | Partly fixed on `fix/dh-session-requests` (not merged yet) |
| low | DTO encoder writes unexplained magic values | Fixed in [#21](https://github.com/qhashofficial/pumpkin-plugins/pull/21) |

## Waypoints and minecraft-colors

| Severity | Finding | Status |
| --- | --- | --- |
| medium | Console and RCON cannot run any waypoint admin command, and the console icon path is dead code | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | Revoking a player grant requires that player to be online | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | HUD tick fires PlayerPermissionCheckEvent per viewer and restricted waypoint, 20 times a second | Not started |
| medium | `/wp reset access` silently wipes all grants and `/wp reset enabled` duplicates enable | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | Validation failures all report 'The waypoint data is invalid.' | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | Generated placeholder field table is malformed (3 header columns, 2 delimiter columns) | Fixed on `docs/waypoints-placeholder-guide` (not merged yet) |
| medium | docs.ts keeps one-off migration rewrites and hard-codes the whole placeholder guide as a string array | Fixed on `docs/waypoints-placeholder-guide` (not merged yet) |
| medium | Duplicated helpers: placeholder argument examples (3 copies), token formatting, grantKey | Partly fixed on `docs/waypoints-placeholder-guide` (not merged yet) |
| medium | Y coordinate is unbounded, which forces exponent-expansion code and lets placeholders emit '1e+21' | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | No E2E coverage of player-facing behavior (HUD packets, teleport, access, online placeholders) | Deferred |
| medium | Unit tests check implementation details and export existence instead of behavior | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Placeholder integration test hardcodes the identifier count and echoes PIE pin constants | Fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | Integration tests share one server and depend on execution order | Fixed on `docs/waypoints-placeholder-guide` (not merged yet) |
| medium | Operator-only checks make the admin permission node meaningless | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| medium | PIE namespace is never unregistered on a plugin-only unload | Deferred |
| low | World change between same-dimension-type worlds may orphan HUD entities on the client | Deferred |
| low | Java clients other than 26.3 silently get no HUD | Not started |
| low | HUD and placeholder distance formatting are duplicated and disagree near 1000 blocks | Not started |
| low | Access commands report 'Waypoint not found.' when storage failed to load | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Dead APIs: catalog onChange and store.error | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Item icon workaround has no upstream reference and misses namespaced or execute forms | Partly fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Name suggestions are offered for `/wp create <name>` | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Icon sprite generator hard-codes its version header and is not discoverable | Not started |
| low | Waypoints logging repeats an inline prefixed logger and doesn't color values | Fixed in [#18](https://github.com/qhashofficial/pumpkin-plugins/pull/18) |
| low | Small consistency issues: template JSDoc, extensionless imports, raster icon | Partly fixed on `docs/waypoints-placeholder-guide` (not merged yet) |
| medium | Nested formatting loses the outer style despite the 'Chalk-style' claim | Not started |
| medium | Published package exports raw .ts, which plain Node cannot import from node_modules | Not started |
| low | `ansi.obfuscated` maps to SGR 8 (conceal), making log text invisible | Not started |
| low | Confusing table-helper names and unexported formatter types | Not started |

## BedrockAddonManager and TabDisplay

| Severity | Finding | Status |
| --- | --- | --- |
| high | BedrockAddonManager never gets packs offered, and nothing tells operators how to use its output | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| medium | Paused plugins tell users to download a release that does not exist | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| high | TabDisplay default config renames every Java player to literal '%player_name%' without PumpkinPIE | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| medium | Hardcoded Java version gate 'v-26-3' will silently disable TabDisplay on the next Pumpkin pin | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| medium | TabDisplay carries dead sorting, objective and adapter code, and its sort-direction premise is wrong | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| low | /baddon list is open to every player and can reveal the server's public IP | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| medium | Default config opens a router port for an HTTP server no client is told about | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Pack scans hold whole archives in memory and block the server tick | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Slow-reading clients can hold all 64 download slots indefinitely | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| medium | Config loader and field helpers are copied between plugins | Deferred |
| medium | TabDisplay docs and command text sound machine-written and are partly out of date | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| medium | One oversized placeholder value stops TabDisplay updates for all players | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| low | Pack count is logged twice on every start and reload | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Stale or wrong JSDoc and messages in bedrock-addon-manager; docs repeat the same facts | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Several tests in both plugins are tautological, misnamed, slow or test the wrong unit | Partly fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Unused shims, duplicated constants and small inconsistencies | Partly fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| medium | TabDisplay validates the config twice and rejects the whole file for one bad value | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| low | Re-extracting an .mcaddon deletes files a download may still have open | Deferred |
| low | web.enabled = false with no download_url gives packs a URL that nothing serves | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| low | Above max_players TabDisplay stops updating without logging it | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |
| low | TabDisplay hardcodes PumpkinPIE's wire format to size batches | Fixed in [#3](https://github.com/qhashofficial/pumpkin-plugins/pull/3) |

## UPnPumpkin, port-mapping, upnpumpkin-api

| Severity | Finding | Status |
| --- | --- | --- |
| high | Bedrock mapping opens only UDP 19132, but the pinned Pumpkin's NetherNet also needs TCP 19132 | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| medium | Every non-public router WAN address is reported as carrier-grade NAT, including double NAT and 0.0.0.0 | Fixed on `fix/port-mapping-nat-reasons` (not merged yet) |
| medium | UPnP discovery stops at the first WAN service, even one that reports 0.0.0.0, and never tries WANPPPConnection | Not started |
| medium | The web fingerprint probe can disable the plugin for good on a host that is not the gateway, before UPnP or NAT-PMP is tried | Not started |
| medium | The Telekom block says the routers have no UPnP, yet it also refuses Telekom devices that answer the IGD search | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| medium | releaseAll waits for an in-flight discovery and spends the 3 s shutdown budget before deleting any mapping | Fixed on `fix/port-mapping-nat-reasons` (not merged yet) |
| low | Unload busy-spins for up to 3 seconds inside onPluginUnload | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| medium | Any plugin can have UPnPumpkin open any host port to the internet by default | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | Mapping keys built as `plugin:${sender}:${key}` can collide between plugins | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | IPC key and description accept control characters, which reach the server log and the router's SOAP body | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | Router identity strings from untrusted LAN devices are logged and sent to chat without sanitizing | Not started |
| medium | /upnp reload with a TOML syntax error silently switches to defaults and reports success | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | loadPluginConfig is copied across four plugins | Deferred |
| medium | Mappings and the reported public address go stale for up to half a lease after a router reboot or WAN address change | Fixed on `fix/port-mapping-nat-reasons` (not merged yet) |
| low | UPnP 724 and 727 are treated as 'port in use', which triggers pointless random-port retries | Not started |
| low | NAT-PMP short error replies are ignored, so 'unsupported version' and 'unsupported opcode' show up as 'no answer' | Not started |
| low | SSDP and HTTP parsing require CRLF, so LF-only devices are never found | Not started |
| low | Device descriptions are fetched one at a time, so discovery can take about 25 s | Not started |
| low | http.ts parses chunked bodies twice and mapper.ts is very large | Not started |
| low | Changing only lease_seconds deletes and re-adds every mapping | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | Copied test helpers, and an itest skip check that disagrees with the plugin | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | Documentation inaccuracies across the README, the guide, and IPv6 support | Fixed on `fix/port-mapping-nat-reasons` (not merged yet) |
| low | Dead code and unused dependency | Partly fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | 1.5 MB icon.svg with 13 embedded raster images | Fixed on `fix/port-mapping-nat-reasons` (not merged yet) |
| low | Private packages declare publishConfig.access public; parseIpv4 is copied in BedrockAddonManager | Partly fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |
| low | /upnp reload says ports are 'being kept open' while counting failed and pending ones | Fixed in [#7](https://github.com/qhashofficial/pumpkin-plugins/pull/7) |

## Small plugins and shared plugin libraries

| Severity | Finding | Status |
| --- | --- | --- |
| high | Docs never say plugins must export the kit's handleCommand, so registerCommands handlers are unreachable | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| medium | Plugins re-implement the kit's handleCommand dispatcher instead of re-exporting it | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| medium | tomlString and table headers write raw U+007F, producing a config file the loader then rejects | Not started |
| medium | Unnamespaced DynamicLights source keys never match a held item | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| medium | DynamicLights toggle preference is keyed by player name | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| low | DynamicLights relies on 'lowest' event priority, which the pinned Pumpkin ignores | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| medium | Other players' held light sources are never shown to anyone else | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| medium | DynamicLights docs have no edition statement; Bedrock behaviour is unverified | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| low | Item command arguments silently become an empty string on unexpected host variants | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | sameArgument has no 'item' case, so shared item prefixes in argumentVariants throw | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| medium | Every config-using plugin repeats the same ConfigStore adapter and syntax-error fallback | Deferred |
| low | plugin-kit guide inverts the repeating-task rule | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | Outdated JSDoc on PluginBase lifecycle and command builders | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | PumpkinPIE provider cache resolves to tools/.cache instead of the repo .cache | Fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | Turning entity lights off also silently disables dropped-item lights | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| low | Wrong range in DynamicLights README and dead tracker method | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| low | DynamicLights plugin.ts mixes lifecycle, event wiring and sync logic in 372 lines | Deferred |
| low | AppleSkin does per-player world and game-rule host calls every tick; docs overstate the cost savings | Not started |
| medium | Real-server tests for both plugins never exercise their actual behaviour | Not started |
| medium | No guest-level test of PieClient/ExpansionRouter over real Pumpkin IPC | Fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | Config tests assert exact rendered text and the parser's exact error wording | Not started |
| low | plugin-kit host tests that cannot fail, and no test for handleCommand routing | Partly fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | Kit handler-id ranges are an unchecked assumption about the facade's counter | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | atomicWrite leaves orphaned temp siblings forever and does not sync before rename | Fixed in [#12](https://github.com/qhashofficial/pumpkin-plugins/pull/12) |
| low | resolveMany encodes the empty batch twice per line | Fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | DynamicLights skips recovery and initial sync when loaded after server start | Fixed in [#24](https://github.com/qhashofficial/pumpkin-plugins/pull/24) |
| low | Config and plugin-kit guides duplicate each other's prose | Not started |

## Documentation and docs tooling

| Severity | Finding | Status |
| --- | --- | --- |
| high | Every README page is missing from the published site, so sidebar, menu and in-page links 404 and CI can't see it | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| high | The published @pumpkin-plugins/docs CLI and /node entry fail when installed from npm | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| medium | The runtime command model lives in a package named and described as a docs generator | Deferred |
| medium | The generated README and the guides misstate when Pumpkin asks for plugin permissions | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| medium | The signing guide gets allow_unsigned backwards | Not started |
| medium | AGENTS.md has a sentence with no instruction | Fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |
| medium | The testing policy contradicts itself and the guides | Fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |
| medium | Docs say pnpm-workspace.yaml pins the API package and ABI, but it no longer does | Fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |
| medium | config.mts duplicates tools/docs helpers and puts discovery, llms.txt and nav in one 815-line file | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| low | Dead or duplicated config in config.mts | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| medium | The site ignores VS Code extensions although the generator and guides include them | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| medium | No tests for doc discovery, the docs tree or the docs index generator | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| medium | docs tool tests snapshot entire generated READMEs | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| medium | The benchmark guide's example run contradicts the current workload inventory | Not started |
| medium | `pnpm dev` runs the latest stable Pumpkin instead of the pinned release | Fixed in [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) |
| medium | The plugin starter registers `/plugin`, which collides with Pumpkin's built-in command | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| medium | Building the docs from a fresh clone fails because the builder CLI isn't built yet | Fixed on `fix/docs-pipeline-turbo` (not merged yet) |
| low | Plugin API index says the packages aren't published yet, but they are | Fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |
| low | The ABI page repeats pin values that already live in source files | Fixed in [#26](https://github.com/qhashofficial/pumpkin-plugins/pull/26) |
| low | The trusted-publishing guide describes a Node check the workflow doesn't do | Not started |
| low | Agent-facing pages are published in the public site's Docs menu | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| low | Guide categories are missing or misplaced | Not started |
| low | Handwritten docs hardcode counts and duplicate setup steps | Not started |
| low | Repo-local skills contain errors and contradict AGENTS.md | Not started |
| low | typescript-advanced-types is a generic skill that conflicts with repo rules | Not started |
| low | JSDoc guidance contradicts its own examples and the docs package | Not started |
| low | The docs generator guide is inaccurate and omits CLI commands | Fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| low | llms.txt says Static Hermes is Pumpkin's runtime | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| low | Arrow-key navigation in MegaNav assumes every menu is a button | Fixed in [#9](https://github.com/qhashofficial/pumpkin-plugins/pull/9) |
| low | Unused and misplaced schemas | Fixed in [#4](https://github.com/qhashofficial/pumpkin-plugins/pull/4) |
| low | Small cleanups in the docs generator and team loader | Partly fixed in [#6](https://github.com/qhashofficial/pumpkin-plugins/pull/6) |
| low | Codex hooks link in the agent tooling guide looks wrong | Deferred |

## Remaining tools, extension, benchmarks

| Severity | Finding | Status |
| --- | --- | --- |
| low | verifyWasm reports valid for any self-signed file and callers never pin the signer key | Not started |
| low | Verifier reads signing data differently from Pumpkin | Not started |
| low | signWasm signs metadata Pumpkin cannot parse when JS callers pass bad field types | Not started |
| low | Private internal packages declare public publishConfig | Not started |
| low | Signing guide puts key handling and actions under the 'Metadata IDs' heading | Not started |
| medium | docs.ts generators carry one-off migration code and hand-rolled parsers | Partly fixed on `refactor/docs-generator-hooks` (not merged yet) |
| low | isClosed matches error strings that no runtime produces | Not started |
| medium | The real-server test never exercises the default scheduled update check | Not started |
| low | Version validation by comparing with itself; request override contradicts the blocking warning | Not started |
| low | Garbled and duplicated JSDoc in the test harness | Not started |
| medium | Binary resolution needs the network on every run and rehashes the cached binary | Not started |
| low | waitFor misses lines when given a global or sticky RegExp | Not started |
| low | Seeded file path check is overcomplicated and runs twice | Not started |
| low | passWithNoTests lets CI pass when a package's tests disappear | Not started |
| low | Harness picks the glibc build on musl Linux | Not started |
| low | Server children may outlive a signal-terminated test worker | Not started |
| medium | Staged publish with inode-tracked rollback is more machinery than a scaffolder needs | Not started |
| low | CLI errors are printed twice | Not started |
| low | Generated project ignores the package manager in its README and files | Not started |
| low | Starter metadata version duplicates package.json | Not started |
| low | Help output is pinned by snapshot | Not started |
| medium | Minecraft dictionary misses common terms and has a dead hyphenated entry | Not started |
| low | Extension test is a mock tautology while the packaging risk is untested | Not started |
| low | Extension changelog lists unrelated commits under a duplicated version | Deferred |
| medium | Benchmark report formatting depends on the host locale | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Millisecond wall-clock timing makes the regression comments noisy and can produce negative samples | Partly fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| medium | Production benchmark code lives in test/ and in oversized files | Deferred |
| medium | Duplicated helpers and validation across report, regression and collect code | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| medium | Benchmark test script lists files; real-server test uses the unit suffix | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Workflow script tests inherit GITHUB_STEP_SUMMARY and include an assertion that cannot fail | Partly fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| medium | docs.ts evaluates the TypeScript AST to read workload metadata | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Dead chart API paths in benchmark regression | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Slow checksum tests and tests that restate the variant matrix | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Workload input counts are duplicated as literals | Fixed in [#22](https://github.com/qhashofficial/pumpkin-plugins/pull/22) |
| low | Parser mode is detected by grepping build stdout | Deferred |

## Cross-cutting architecture and duplication

| Severity | Finding | Status |
| --- | --- | --- |
| medium | A second 2,900-line WIT parser and code generator lives in tests as an 'oracle', and about 2,100 lines of tests only exercise that copy | Not started |
| medium | static-hermes-runtime tests and docs import tools/build sources without a declared dependency, so Turbo can replay stale passing results | Not started |
| medium | Each plugin copies its config loading, and the copies now behave differently on the same error | Deferred |
| medium | Plugin log lines don't consistently name their plugin, and Pumpkin doesn't add the name | Deferred |
| low | Five plugins and the turbo plugin template re-implement plugin-kit's handleCommand export | Fixed in [#5](https://github.com/qhashofficial/pumpkin-plugins/pull/5) |
| medium | Each plugin hand-rolls unload teardown in a different way and tests the order with 7-17 module mocks | Deferred |
| low | bedrock-addon-manager keeps re-export shim modules for plugin-kit, and one of them is never imported | Fixed in [#10](https://github.com/qhashofficial/pumpkin-plugins/pull/10) |
| medium | WASI socket and IPv4 helpers are copied between plugins instead of shared | Deferred |
| medium | Three separate cross-process file-lock implementations and two WIT fetch-and-cache pipelines | Deferred |
| low | WIT naming helpers are copied into every static-hermes-runtime generator module | Fixed in [#13](https://github.com/qhashofficial/pumpkin-plugins/pull/13) |
| medium | README generator hooks keep one-shot prose migrations as permanent code and duplicate their helpers | Partly fixed on `refactor/docs-generator-hooks` (not merged yet) |
| medium | Pumpkin Market listing lookup is duplicated between the two Market actions, and the copies have drifted | Fixed on `fix/market-actions-lookup` (not merged yet) |
| medium | pnpm dev copies the test-harness binary resolver but launches the latest Pumpkin instead of the pinned release | Fixed in [#14](https://github.com/qhashofficial/pumpkin-plugins/pull/14) |
| medium | @pumpkin-plugins/docs, a README generator, is also the runtime library for plugin info and commands, and the source of monorepo discovery | Deferred |
| low | A published static-analysis package serves one consumer, while tools/build keeps its own separate TypeScript source analysis | Deferred |
| medium | PumpkinPIE integration tests deep-import other packages' internals and assert hard-coded pins | Partly fixed in [#16](https://github.com/qhashofficial/pumpkin-plugins/pull/16) |
| low | GITHUB_OUTPUT writing and the GitHub API helpers are reimplemented across scripts in three styles | Not started |
| low | Workflows inline the bootstrap steps and one hard-codes the Node pin and an older setup-node version | Not started |
| low | The Minecraft spelling dictionary and its VS Code extension aren't used by the repo itself | Not started |
| low | Plugin test helpers redeclare the plugin name and the data-folder layout | Deferred |
