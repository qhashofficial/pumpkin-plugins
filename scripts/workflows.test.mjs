// Tests for the GitHub workflows and actions: they evaluate the real `if:` conditions and run the
// real gate scripts against fixture inputs. Run with `pnpm test:scripts`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

const scripts = import.meta.dirname;
const dirs = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes files into a new temporary directory and returns its path. */
function repo(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflows-'));
    dirs.push(dir);
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
    }
    return dir;
}

describe('setup-static-hermes action', () => {
    const action = parse(
        fs.readFileSync(path.join(scripts, '../.github/common/setup-static-hermes/action.yml'), 'utf8'),
    );
    const steps = action.runs.steps;
    const step = (id) => steps.find((candidate) => candidate.id === id);

    it('uses pinned host tool and toolchain versions in cache keys', () => {
        const versionScript = step('versions').run;
        assert.match(versionScript, /wasi-sdk\.lock\.json/);
        assert.match(versionScript, /toolchain-versions\.json/);
        assert.match(versionScript, /\.tools\["wit-bindgen"\]/);
        assert.match(versionScript, /\.tools\.rust/);

        const hostToolsCache = step('host-tools-cache').with;
        assert.match(hostToolsCache.path, /host-tools/);
        assert.match(hostToolsCache.key, /steps\.versions\.outputs\.cmake-version/);
        assert.match(hostToolsCache.key, /steps\.versions\.outputs\.ninja-version/);

        const witBindgenCache = step('wit-bindgen-cache').with;
        assert.match(witBindgenCache.path, /wit-bindgen-\$\{\{ steps\.versions\.outputs\.wit-bindgen-version \}\}/);
        assert.match(witBindgenCache.key, /steps\.versions\.outputs\.wit-bindgen-version/);
        assert.match(witBindgenCache.key, /steps\.versions\.outputs\.rust-toolchain-version/);

        const hermesCache = step('hermes-workspace-cache').with;
        assert.match(hermesCache.path, /\.cache\/hermes/);
        assert.match(hermesCache.key, /static-hermes-workspace-cache-v6/);
        assert.match(hermesCache.key, /src\/hermes/);
        assert.match(hermesCache.key, /src\/cli\.ts/);
        assert.doesNotMatch(hermesCache.key, /bin\/toolchain-environment\.mjs/);
        assert.match(hermesCache.key, /steps\.versions\.outputs\.cmake-version/);
        assert.match(hermesCache.key, /steps\.versions\.outputs\.ninja-version/);
        assert.match(hermesCache.key, /steps\.versions\.outputs\.wasi-sdk-version/);
        assert.match(hermesCache.key, /steps\.versions\.outputs\.wit-bindgen-version/);
        assert.match(hermesCache.key, /steps\.versions\.outputs\.rust-toolchain-version/);
        assert.doesNotMatch(`${witBindgenCache.key} ${hermesCache.key}`, /wasi-sdk-34|wit-bindgen-0\.62|rust-1\.99/);
    });
});

describe('upstream pin workflow', () => {
    const workflow = parse(
        fs.readFileSync(path.join(scripts, '../.github/workflows/update-upstream-pins.yml'), 'utf8'),
    );
    const releaseWorkflow = parse(fs.readFileSync(path.join(scripts, '../.github/workflows/release.yml'), 'utf8'));

    it('bootstraps dependencies before discovering upstream updates', () => {
        const steps = workflow.jobs.discover.steps;
        const bootstrapIndex = steps.findIndex((step) => step.uses === './.github/common/bootstrap');
        const discoverIndex = steps.findIndex((step) => step.id === 'pins');

        assert.ok(bootstrapIndex > 0, 'discover job must install repository dependencies');
        assert.ok(discoverIndex > bootstrapIndex, 'discovery must run after the dependency install');
    });

    it('fails discovery when the Node command fails', () => {
        const steps = workflow.jobs.discover.steps;
        const discover = steps.find((step) => step.id === 'pins');
        const dir = repo({ 'bin/node': '#!/bin/sh\nexit 23\n' });
        const output = path.join(dir, 'github-output');
        fs.chmodSync(path.join(dir, 'bin/node'), 0o755);

        const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', discover.run], {
            cwd: scripts,
            env: {
                ...process.env,
                PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
                GITHUB_OUTPUT: output,
            },
            encoding: 'utf8',
        });

        assert.equal(result.status, 23, `${result.stdout}${result.stderr}`);
        assert.equal(fs.existsSync(output), false, 'failed discovery must not write an empty matrix');
    });

    it('uses the release GitHub App token so created pull requests trigger CI', () => {
        const update = workflow.jobs.update;
        const token = update.steps.find((step) => step.id === 'app-token');
        const checkout = update.steps.find((step) => step.uses === 'actions/checkout@v7.0.1');
        const reconcile = update.steps.find((step) => step.name === '🔄 Reconcile upstream update PR or issue');
        const release = releaseWorkflow.jobs.release.steps;
        const releaseToken = release.find((step) => step.id === 'app-token');
        const releasePlease = release.find((step) => step.id === 'release');

        assert.ok(token, 'updater must create a GitHub App token');
        assert.equal(token.uses, 'actions/create-github-app-token@v3.2.0');
        assert.equal(token.with['client-id'], releaseToken.with['client-id']);
        assert.equal(token.with['private-key'], releaseToken.with['private-key']);
        assert.equal(token.with['permission-contents'], 'write');
        assert.equal(token.with['permission-issues'], 'write');
        assert.equal(token.with['permission-pull-requests'], 'write');
        const appTokenExpression = ['$', '{{ steps.app-token.outputs.token }}'].join('');
        assert.equal(checkout.with.token, appTokenExpression);
        assert.equal(reconcile.env.GH_TOKEN, appTokenExpression);
        assert.equal(releasePlease.env.GITHUB_TOKEN, appTokenExpression);
        assert.equal(reconcile.run, 'node scripts/upstream-pins.mjs reconcile');
    });

    it('publishes registered tool releases through the caller workflow with OIDC', () => {
        const ciWorkflow = parse(fs.readFileSync(path.join(scripts, '../.github/workflows/ci.yml'), 'utf8'));
        const callerPermissions = ciWorkflow.jobs.release.permissions;
        const publish = releaseWorkflow.jobs['publish-tools'];
        assert.equal(ciWorkflow.on.workflow_dispatch.inputs.release_commit.required, true);
        assert.equal(ciWorkflow.jobs.release.with.release_commit, ['$', "{{ inputs.release_commit || '' }}"].join(''));
        assert.ok(releaseWorkflow.jobs.release.outputs.tool_paths_released);
        assert.equal(callerPermissions['id-token'], 'write');
        assert.ok(publish, 'release workflow needs a separate npm publish job for tools');
        assert.equal(publish.permissions['id-token'], 'write');
        assert.match(publish.if, /needs\.release\.outputs\.tool_paths_released/);
        assert.equal(publish.strategy, undefined, 'tool publication must run sequentially in one job');
        assert.equal(publish['timeout-minutes'], 60);
        assert.equal(publish['runs-on'], 'ubuntu-26.04');
        assert.equal(
            releaseWorkflow.jobs.release.outputs.release_metadata,
            ['$', '{{ steps.release.outputs.release_metadata }}'].join(''),
        );
        assert.equal(
            releaseWorkflow.jobs.release.outputs.release_notes,
            ['$', '{{ steps.release.outputs.release_notes }}'].join(''),
        );
        assert.equal(releaseWorkflow.jobs.release.outputs.all, undefined);
        assert.equal(
            releaseWorkflow.jobs['release-fanout-check'].env.RELEASE_METADATA,
            ['$', '{{ needs.release.outputs.release_metadata }}'].join(''),
        );
        assert.equal(
            publish.env.RELEASED_TOOL_PATHS,
            ['$', '{{ needs.release.outputs.tool_paths_released }}'].join(''),
        );
        assert.equal(publish.env.RELEASE_METADATA, ['$', '{{ needs.release.outputs.release_metadata }}'].join(''));
        assert.equal(
            releaseWorkflow.jobs.market.env.MARKET_RELEASE_NOTES,
            ['$', "{{ fromJSON(needs.release.outputs.release_notes)[format('{0}--body', matrix.path)] }}"].join(''),
        );
        const steps = publish.steps;
        const tagCheck = steps.find((step) => step.name === '🔒 Check each tag is the commit this run built');
        assert.match(tagCheck.run, /git\/ref\/tags\/\$RELEASE_TAG/);
        assert.match(tagCheck.run, /git\/tags\/\$sha/);
        assert.equal(publish.env.RELEASE_TARGET_SHA, ['$', '{{ inputs.release_commit || github.sha }}'].join(''));
        const publishScript = steps.find((step) => step.name === '📤 Publish verified public npm packages');
        assert.match(publishScript.run, /npm 11\.5\.1 or newer/);
        assert.match(publishScript.run, /pnpm exec node scripts\/publish-tool-packages\.mjs/);
    });

    it('checks the release tag against its requested commit when a newer workflow commit exists', () => {
        const tagCheck = releaseWorkflow.jobs['publish-tools'].steps.find(
            (step) => step.name === '🔒 Check each tag is the commit this run built',
        );
        const directory = repo({
            'bin/gh': '#!/bin/sh\nprintf "commit %s\\n" "$TAG_SHA"\n',
            'bin/jq': '#!/bin/sh\nprintf "%s\\n" "$TAG_NAME"\n',
        });
        fs.chmodSync(path.join(directory, 'bin/gh'), 0o755);
        fs.chmodSync(path.join(directory, 'bin/jq'), 0o755);
        const releaseSha = 'b'.repeat(40);
        const fasterWorkflowSha = 'a'.repeat(40);
        const runGuard = (releaseTargetSha) =>
            spawnSync('bash', ['-e', '-o', 'pipefail', '-c', tagCheck.run], {
                cwd: scripts,
                env: {
                    ...process.env,
                    PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`,
                    GH_REPO: 'filiphsps/pumpkin-plugins',
                    RELEASED_TOOL_PATHS: '["tools/codemod"]',
                    RELEASE_METADATA: '{}',
                    RELEASE_TARGET_SHA: releaseTargetSha,
                    TAG_NAME: 'codemod-v0.1.0',
                    TAG_SHA: releaseSha,
                    GITHUB_SHA: fasterWorkflowSha,
                },
                encoding: 'utf8',
            });

        const exactTarget = runGuard(releaseSha);
        assert.equal(exactTarget.status, 0, exactTarget.stderr);

        const fasterCommitTarget = runGuard(fasterWorkflowSha);
        assert.equal(fasterCommitTarget.status, 1);
        assert.match(fasterCommitTarget.stdout, /requested release commit/);
    });

    it('packages released extensions and attaches VSIX files to GitHub releases', () => {
        const publish = releaseWorkflow.jobs['publish-extensions'];
        assert.ok(releaseWorkflow.jobs.release.outputs.extension_paths_released);
        assert.ok(publish, 'release workflow needs a VSIX packaging job for extensions');
        assert.match(publish.if, /extension_paths_released/);
        assert.equal(
            publish.strategy.matrix.path,
            ['$', '{{ fromJSON(needs.release.outputs.extension_paths_released) }}'].join(''),
        );
        const steps = publish.steps.map((step) => step.run ?? '').join('\n');
        assert.match(steps, /run build/);
        assert.match(steps, /run package/);
        assert.match(steps, /gh release upload/);
        assert.match(steps, /git\/ref\/tags\/\$TAG/);
        assert.match(releaseWorkflow.jobs['release-fanout-check'].steps[0].run, /extension_count/);
    });
});

// Evaluate the actual workflow conditions and shell gate against hosted outcome fixtures.
describe('action release prerequisites', () => {
    const ci = parse(fs.readFileSync(path.join(scripts, '../.github/workflows/ci.yml'), 'utf8'));
    const actions = parse(fs.readFileSync(path.join(scripts, '../.github/workflows/actions.yml'), 'utf8'));
    const extensions = parse(fs.readFileSync(path.join(scripts, '../.github/workflows/extensions.yml'), 'utf8'));
    const startsWith = (searchString, searchValue) =>
        String(searchString ?? '')
            .toLowerCase()
            .startsWith(String(searchValue ?? '').toLowerCase());
    const evaluate = (expression, context) =>
        runInNewContext(expression.trim().replace(/^\$\{\{|\}\}$/g, ''), {
            always: () => true,
            startsWith,
            github: { head_ref: 'feature/test' },
            needs: { changes: { outputs: { config_only: 'false' } } },
            ...context,
        });

    it('starts Static Hermes preparation as soon as changes are classified', () => {
        assert.deepEqual(ci.jobs.build.needs, ['changes']);
        assert.equal(ci.jobs.build.steps.find((step) => step.name === '🏗️ Prepare Static Hermes')?.id, 'prepare-hermes');
        assert.deepEqual(ci.jobs.lint.needs, ['changes']);
        assert.deepEqual(ci.jobs.typecheck.needs, ['changes']);
        assert.deepEqual(ci.jobs.release.needs, [
            'changes',
            'lint',
            'typecheck',
            'build',
            'external-consumer',
            'test',
            'docs',
            'integration-gate',
            'action-gate',
            'extension-gate',
            'generator-gate',
        ]);
        assert.match(ci.jobs.release.if, /needs\.lint\.result == 'success'/);
        assert.match(ci.jobs.release.if, /needs\.typecheck\.result == 'success'/);
    });

    it('skips redundant workflow jobs on Release Please branches', () => {
        const condition = ci.jobs.changes.if;
        assert.equal(
            evaluate(condition, { github: { head_ref: 'RELEASE-PLEASE--BRANCHES--MASTER--COMPONENTS--WAYPOINTS' } }),
            false,
        );
        assert.equal(evaluate(condition, { github: { head_ref: 'dev/waypoints-placeholders' } }), true);
    });

    it('awaits action verification alongside every existing plugin prerequisite', () => {
        assert.deepEqual(ci.jobs.release.needs, [
            'changes',
            'lint',
            'typecheck',
            'build',
            'external-consumer',
            'test',
            'docs',
            'integration-gate',
            'action-gate',
            'extension-gate',
            'generator-gate',
        ]);
        assert.deepEqual(ci.jobs['action-gate'].needs, ['changes', 'action-tests']);
        assert.equal(evaluate(ci.jobs['action-gate'].if, {}), true);
    });

    it('skips result gates for label configuration changes', () => {
        const context = { needs: { changes: { outputs: { config_only: 'true' } } } };
        for (const job of ['action-gate', 'extension-gate', 'integration-gate', 'generator-gate']) {
            assert.equal(evaluate(ci.jobs[job].if, context), false, `${job} should skip config-only changes`);
        }
    });

    it('requires the generator smoke test only when the classifier selects it', () => {
        const generator = ci.jobs.generator;
        for (const [selected, skipExpensiveChecks, expected] of [
            ['true', 'false', true],
            ['false', 'false', false],
            ['true', 'true', false],
        ]) {
            assert.equal(
                evaluate(generator.if, {
                    needs: {
                        changes: {
                            outputs: { generator: selected, skip_expensive_checks: skipExpensiveChecks },
                        },
                    },
                }),
                expected,
            );
        }
        const gate = ci.jobs['generator-gate'];
        assert.ok(gate, 'Generator result gate is missing');
        assert.deepEqual(gate.needs, ['changes', 'generator']);
        assert.equal(evaluate(gate.if, {}), true);
        assert.ok(ci.jobs.release.needs.includes('generator-gate'));
        assert.match(ci.jobs.release.if, /needs\['generator-gate'\]\.result == 'success'/);

        const step = gate.steps.find((entry) => entry.env?.GENERATOR_RESULT);
        assert.ok(step, 'Generator result gate has no generator result input');
        for (const [selected, skipExpensiveChecks, result, changes, expected] of [
            ['true', 'false', 'success', 'success', 0],
            ['true', 'false', 'failure', 'success', 1],
            ['true', 'false', 'cancelled', 'success', 1],
            ['true', 'false', 'skipped', 'success', 1],
            ['false', 'false', 'skipped', 'success', 0],
            ['false', 'false', 'success', 'success', 1],
            ['false', 'false', 'failure', 'success', 1],
            ['false', 'false', 'skipped', 'failure', 1],
            ['true', 'true', 'skipped', 'success', 0],
            ['true', 'true', 'failure', 'success', 1],
        ]) {
            const outcome = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    GENERATOR: selected,
                    SKIP_EXPENSIVE_CHECKS: skipExpensiveChecks,
                    GENERATOR_RESULT: result,
                    CHANGES_RESULT: changes,
                },
            });
            assert.equal(outcome.status, expected, `${selected}/${result}/${changes}: ${outcome.stderr}`);
        }
    });

    it('runs engine comparison through its own reusable workflow', () => {
        const comparison = parse(
            fs.readFileSync(path.join(scripts, '../.github/workflows/engine-comparison.yml'), 'utf8'),
        );
        const job = ci.jobs['engine-comparison'];
        assert.ok(Object.hasOwn(comparison.on, 'workflow_call'));
        assert.equal(job.uses, './.github/workflows/engine-comparison.yml');
        assert.deepEqual(job.needs, ['changes', 'build']);
        for (const [codeChanged, skipExpensiveChecks, expected] of [
            ['true', 'false', true],
            ['false', 'false', false],
            ['true', 'true', false],
        ]) {
            assert.equal(
                evaluate(job.if, {
                    needs: {
                        changes: {
                            outputs: { code: codeChanged, skip_expensive_checks: skipExpensiveChecks },
                        },
                    },
                }),
                expected,
            );
        }
        assert.ok(
            Object.values(comparison.jobs).some((job) =>
                job.steps?.some((step) => step.run?.includes('compare-engines')),
            ),
        );
    });

    it('runs integration only for relevant scopes and gates releases on its result', () => {
        const integration = ci.jobs.integration;
        assert.match(integration.if, /outputs\.integration_scope == 'affected'/);
        assert.match(integration.if, /outputs\.integration_scope == 'all'/);
        for (const [scope, expected] of [
            ['none', false],
            ['benchmark', false],
            ['affected', true],
            ['all', true],
        ]) {
            const changes = { outputs: { integration_scope: scope } };
            assert.equal(evaluate(integration.if, { needs: { changes } }), expected, scope);
        }

        const integrationCommand = integration.steps.find((entry) => entry.name === '🎃 Integration tests');
        assert.ok(integrationCommand, 'Integration job has no test command');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-command-'));
        dirs.push(directory);
        const argsFile = path.join(directory, 'args');
        const pnpm = path.join(directory, 'pnpm');
        fs.writeFileSync(pnpm, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$CAPTURED_ARGS"\n');
        fs.chmodSync(pnpm, 0o755);

        for (const [scope, extra, packages, expected] of [
            [
                'affected',
                '@pumpkin-plugins/bedrock-addon-manager',
                '["@pumpkin-plugins/upnpumpkin"]',
                [
                    'turbo',
                    'run',
                    'test:integration',
                    '--concurrency=2',
                    '--only',
                    '--filter=...@pumpkin-plugins/upnpumpkin',
                    '--filter=@pumpkin-plugins/bedrock-addon-manager',
                ],
            ],
            ['all', '', '[]', ['turbo', 'run', 'test:integration', '--concurrency=2', '--only']],
        ]) {
            const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', integrationCommand.run], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    CAPTURED_ARGS: argsFile,
                    INTEGRATION_SCOPE: scope,
                    INTEGRATION_EXTRA: extra,
                    INTEGRATION_PACKAGES: packages,
                },
            });
            assert.equal(result.status, 0, `${scope}: ${result.stderr}`);
            assert.deepEqual(fs.readFileSync(argsFile, 'utf8').trim().split('\n'), expected, scope);
        }

        const gate = ci.jobs['integration-gate'];
        assert.ok(gate, 'Integration result gate is missing');
        assert.deepEqual(gate.needs, ['changes', 'integration']);
        assert.ok(ci.jobs.release.needs.includes('integration-gate'));
        assert.match(ci.jobs.release.if, /needs\['integration-gate'\]\.result == 'success'/);

        const step = gate.steps.find((entry) => entry.env?.INTEGRATION_RESULT);
        assert.ok(step, 'Integration result gate has no integration result input');
        for (const [scope, result, changes, expected] of [
            ['none', 'skipped', 'success', 0],
            ['benchmark', 'skipped', 'success', 0],
            ['affected', 'success', 'success', 0],
            ['all', 'success', 'success', 0],
            ['affected', 'failure', 'success', 1],
            ['affected', 'cancelled', 'success', 1],
            ['affected', 'skipped', 'success', 1],
            ['all', 'skipped', 'success', 1],
            ['none', 'success', 'success', 1],
            ['none', 'skipped', 'failure', 1],
        ]) {
            const outcome = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    INTEGRATION_SCOPE: scope,
                    INTEGRATION_RESULT: result,
                    CHANGES_RESULT: changes,
                },
            });
            assert.equal(outcome.status, expected, `${scope}/${result}/${changes}: ${outcome.stderr}`);
        }

        const needs = {
            changes: { result: 'success', outputs: { code: 'true', integration_scope: 'benchmark' } },
            lint: { result: 'success' },
            typecheck: { result: 'success' },
            build: { result: 'success' },
            'external-consumer': { result: 'success' },
            test: { result: 'success' },
            docs: { result: 'success' },
            'integration-gate': { result: 'success' },
            'action-gate': { result: 'success' },
            'extension-gate': { result: 'success' },
            'generator-gate': { result: 'success' },
        };
        assert.equal(evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }), true);
    });

    it('passes the expanded matrix into the reusable action test workflow', () => {
        assert.equal(ci.jobs['action-tests']?.uses, './.github/workflows/actions.yml');
        assert.ok(actions.on.workflow_call.inputs.actions.required);
        assert.equal(actions.on.workflow_call.inputs.actions.type, 'string');
        const outputs = { actions: '[]', actions_to_test: '["common"]' };
        assert.equal(evaluate(ci.jobs['action-tests'].with.actions, { needs: { changes: { outputs } } }), '["common"]');
        assert.equal(evaluate(ci.jobs['action-tests'].if, { needs: { changes: { outputs } } }), true);
        assert.equal(
            evaluate(ci.jobs['action-tests'].if, { needs: { changes: { outputs: { actions_to_test: '[]' } } } }),
            false,
        );
        const expression = actions.jobs.test.strategy.matrix.action;
        const selected = [
            'common',
            'publish-to-pumpkin-market',
            'sign-pumpkin-plugin',
            'update-pumpkin-market-listing',
            'verify-pumpkin-plugin',
        ];
        assert.deepEqual(
            Array.from(evaluate(expression, { inputs: { actions: JSON.stringify(selected) }, fromJSON: JSON.parse })),
            selected,
        );
        assert.equal(evaluate(actions.jobs.test.if, { inputs: { actions: '[]' } }), false);
        assert.equal(evaluate(actions.jobs.test.if, { inputs: { actions: '["common"]' } }), true);
    });

    it('passes extensions into their own test and VSIX packaging workflow', () => {
        assert.equal(ci.jobs['extension-tests']?.uses, './.github/workflows/extensions.yml');
        assert.ok(extensions.on.workflow_call.inputs.extensions.required);
        assert.equal(extensions.on.workflow_call.inputs.extensions.type, 'string');
        const outputs = { extensions_to_test: '["minecraft-terms"]' };
        assert.equal(
            evaluate(ci.jobs['extension-tests'].with.extensions, { needs: { changes: { outputs } } }),
            '["minecraft-terms"]',
        );
        assert.equal(evaluate(ci.jobs['extension-tests'].if, { needs: { changes: { outputs } } }), true);
        assert.equal(
            evaluate(ci.jobs['extension-tests'].if, { needs: { changes: { outputs: { extensions_to_test: '[]' } } } }),
            false,
        );
        assert.deepEqual(ci.jobs['extension-gate'].needs, ['changes', 'extension-tests']);
        assert.ok(extensions.jobs.verify.steps.some((step) => step.run?.includes('run package')));
    });

    for (const code of ['true', 'false']) {
        for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
            it(`allows ${code === 'true' ? 'mixed' : 'action-only'} release only after a successful action gate (${result})`, () => {
                const needs = {
                    changes: {
                        result: 'success',
                        outputs: { code, actions: '["sign-pumpkin-plugin"]', extensions: '[]' },
                    },
                    lint: { result: code === 'true' ? 'success' : 'skipped' },
                    typecheck: { result: code === 'true' ? 'success' : 'skipped' },
                    docs: { result: 'success' },
                    build: { result: code === 'true' ? 'success' : 'skipped' },
                    'external-consumer': { result: code === 'true' ? 'success' : 'skipped' },
                    test: { result: 'success' },
                    'integration-gate': { result: 'success' },
                    'action-gate': { result },
                    'extension-gate': { result: 'success' },
                    'generator-gate': { result: 'success' },
                };
                assert.equal(
                    evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }),
                    result === 'success',
                );
            });
        }
    }

    // Failure inventory: action-only coverage can fail, cancel or skip while all other release
    // gates pass; version-only action changes must still release without running coverage.
    it('requires coverage for action-code releases and accepts version-only coverage skips', () => {
        for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
            const needs = {
                changes: {
                    result: 'success',
                    outputs: {
                        code: 'false',
                        actions: '["sign-pumpkin-plugin"]',
                        actions_to_test: '["sign-pumpkin-plugin"]',
                        extensions: '[]',
                    },
                },
                test: { result },
                docs: { result: 'success' },
                'action-gate': { result: 'success' },
                'extension-gate': { result: 'success' },
                'integration-gate': { result: 'success' },
                'generator-gate': { result: 'success' },
            };
            assert.equal(
                evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }),
                result === 'success',
                result,
            );
            needs.changes.outputs.actions_to_test = '[]';
            needs.test.result = 'skipped';
            assert.equal(evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }), true);
        }
    });

    it('runs docs/config for version-only releases and common helper changes', () => {
        for (const [actions, actions_to_test] of [
            ['["sign-pumpkin-plugin"]', '[]'],
            ['[]', '["common"]'],
        ]) {
            const needs = {
                changes: {
                    outputs: {
                        code: 'false',
                        actions,
                        actions_to_test,
                        extensions: '[]',
                        extensions_to_test: '[]',
                        generated_readmes: 'false',
                    },
                },
            };
            assert.equal(evaluate(ci.jobs.docs.if, { needs }), true);
            assert.equal(evaluate(ci.jobs.commits.if, { needs, github: { event_name: 'pull_request' } }), true);
        }
        const extensionChanges = {
            changes: {
                outputs: {
                    code: 'false',
                    actions: '[]',
                    actions_to_test: '[]',
                    extensions: '["minecraft-terms"]',
                    extensions_to_test: '["minecraft-terms"]',
                    generated_readmes: 'false',
                },
            },
        };
        assert.equal(evaluate(ci.jobs.docs.if, { needs: extensionChanges }), true);
        assert.equal(
            evaluate(ci.jobs.commits.if, { needs: extensionChanges, github: { event_name: 'pull_request' } }),
            true,
        );
    });

    it('allows an extension-only release only after extension verification succeeds', () => {
        for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
            const needs = {
                changes: {
                    result: 'success',
                    outputs: { code: 'false', actions: '[]', actions_to_test: '[]', extensions: '["minecraft-terms"]' },
                },
                docs: { result: 'success' },
                'action-gate': { result: 'success' },
                'extension-gate': { result },
                'integration-gate': { result: 'success' },
                'generator-gate': { result: 'success' },
            };
            assert.equal(
                evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }),
                result === 'success',
                result,
            );
        }
    });

    it('preserves version-only, docs-only, common-only, and existing plugin release conditions', () => {
        for (const [code, selected, docs, expected] of [
            ['false', '["sign-pumpkin-plugin"]', 'success', true],
            ['false', '[]', 'skipped', false],
            ['false', '[]', 'success', false],
            ['true', '[]', 'success', true],
        ]) {
            const needs = {
                changes: { result: 'success', outputs: { code, actions: selected, extensions: '[]' } },
                lint: { result: code === 'true' ? 'success' : 'skipped' },
                typecheck: { result: code === 'true' ? 'success' : 'skipped' },
                docs: { result: docs },
                build: { result: 'success' },
                'external-consumer': { result: code === 'true' ? 'success' : 'skipped' },
                test: { result: 'success' },
                'integration-gate': { result: 'success' },
                'action-gate': { result: 'success' },
                'extension-gate': { result: 'success' },
                'generator-gate': { result: 'success' },
            };
            assert.equal(evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs }), expected);
            if (code === 'true') {
                for (const required of [
                    'changes',
                    'lint',
                    'typecheck',
                    'build',
                    'external-consumer',
                    'test',
                    'docs',
                    'integration-gate',
                    'generator-gate',
                ]) {
                    const failing = { ...needs, [required]: { ...needs[required], result: 'failure' } };
                    assert.equal(
                        evaluate(ci.jobs.release.if, { github: { event_name: 'push' }, needs: failing }),
                        false,
                        required,
                    );
                }
            }
        }
    });

    it('executes the gate for required failures, cancellations, and legitimate empty matrices', () => {
        const gate = ci.jobs['action-gate'];
        assert.ok(gate, 'Action result gate is missing');
        const step = gate.steps.find((step) => step.env?.TEST_RESULT);
        assert.ok(step, 'Action result gate has no test result input');
        for (const [matrix, result, changes, expected] of [
            ['["sign-pumpkin-plugin"]', 'success', 'success', 0],
            ['["common"]', 'failure', 'success', 1],
            ['["common"]', 'cancelled', 'success', 1],
            ['["common"]', 'skipped', 'success', 1],
            ['[]', 'skipped', 'success', 0],
            ['[]', 'failure', 'success', 1],
            ['[]', 'cancelled', 'success', 1],
            ['[]', 'skipped', 'failure', 1],
        ]) {
            const outcome = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
                encoding: 'utf8',
                env: { ...process.env, ACTIONS: matrix, TEST_RESULT: result, CHANGES_RESULT: changes },
            });
            assert.equal(outcome.status, expected, `${matrix}/${result}/${changes}: ${outcome.stderr}`);
        }
    });

    it('executes the extension gate for required failures, cancellations, and an empty matrix', () => {
        const gate = ci.jobs['extension-gate'];
        assert.ok(gate, 'Extension result gate is missing');
        const step = gate.steps.find((step) => step.env?.TEST_RESULT);
        assert.ok(step, 'Extension result gate has no test result input');
        for (const [matrix, result, changes, expected] of [
            ['["minecraft-terms"]', 'success', 'success', 0],
            ['["minecraft-terms"]', 'failure', 'success', 1],
            ['["minecraft-terms"]', 'cancelled', 'success', 1],
            ['["minecraft-terms"]', 'skipped', 'success', 1],
            ['[]', 'skipped', 'success', 0],
            ['[]', 'failure', 'success', 1],
            ['[]', 'cancelled', 'success', 1],
            ['[]', 'skipped', 'failure', 1],
        ]) {
            const outcome = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
                encoding: 'utf8',
                env: { ...process.env, EXTENSIONS: matrix, TEST_RESULT: result, CHANGES_RESULT: changes },
            });
            assert.equal(outcome.status, expected, `${matrix}/${result}/${changes}: ${outcome.stderr}`);
        }
    });
});
