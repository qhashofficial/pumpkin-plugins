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
import { selectJobs } from './ci-gate.mjs';

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

/** The publish-tools step that checks each release tag points at the commit this run built. */
const tagCheckStep = (releaseWorkflow) =>
    releaseWorkflow.jobs['publish-tools'].steps.find((step) => step.run?.includes('git/ref/tags/$RELEASE_TAG'));

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
        const checkout = update.steps.find((step) => step.id === 'checkout-default-branch');
        const reconcile = update.steps.find((step) => step.id === 'reconcile-upstream-update-pr-or-issue');
        const release = releaseWorkflow.jobs.release.steps;
        const releaseToken = release.find((step) => step.id === 'app-token');
        const releasePlease = release.find((step) => step.id === 'release');

        assert.ok(token, 'updater must create a GitHub App token');
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
        assert.equal(publish.env.RELEASE_TARGET_SHA, ['$', '{{ inputs.release_commit || github.sha }}'].join(''));
        const publishScript = steps.find((step) => step.run?.includes('scripts/publish-tool-packages.mjs'));
        assert.match(publishScript.run, /npm 11\.5\.1 or newer/);
        const tagCheck = tagCheckStep(releaseWorkflow);
        assert.ok(tagCheck, 'publish-tools must check each release tag');
        assert.ok(
            steps.indexOf(tagCheck) < steps.indexOf(publishScript),
            'tags must be checked before anything is published',
        );
    });

    it('checks the release tag against its requested commit when a newer workflow commit exists', () => {
        const tagCheck = tagCheckStep(releaseWorkflow);
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

// Evaluate the actual workflow conditions and run the real result check against hosted outcome fixtures.
describe('CI job selection and release prerequisites', () => {
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
            fromJSON: JSON.parse,
            github: { head_ref: 'feature/test' },
            ...context,
        });
    /** Jobs that run after classification and before the result check. */
    const checkedJobs = Object.keys(ci.jobs).filter(
        (job) => !['changes', 'ci-result', 'release', 'cleanup'].includes(job),
    );

    it('starts Static Hermes preparation as soon as changes are classified', () => {
        assert.deepEqual(ci.jobs.build.needs, ['changes']);
        assert.ok(ci.jobs.build.steps.some((step) => step.id === 'prepare-hermes'));
        assert.deepEqual(ci.jobs.lint.needs, ['changes']);
        assert.deepEqual(ci.jobs.typecheck.needs, ['changes']);
    });

    it('skips redundant workflow jobs on Release Please branches', () => {
        for (const job of ['changes', 'ci-result']) {
            const condition = ci.jobs[job].if;
            assert.equal(
                evaluate(condition, {
                    github: { head_ref: 'RELEASE-PLEASE--BRANCHES--MASTER--COMPONENTS--WAYPOINTS' },
                }),
                false,
                job,
            );
            assert.equal(evaluate(condition, { github: { head_ref: 'dev/waypoints-placeholders' } }), true, job);
        }
    });

    it('runs each job from its own entry in the selection table', () => {
        const selection = Object.fromEntries(checkedJobs.map((job, index) => [job, index % 2 === 0]));
        const needs = { changes: { outputs: { jobs: JSON.stringify(selection) } } };
        for (const job of checkedJobs) {
            assert.equal(evaluate(ci.jobs[job].if, { needs }), selection[job], job);
        }
        assert.deepEqual(Object.keys(selectJobs({}, 'push')).sort(), [...checkedJobs].sort());
    });

    it('checks every selected job except the engine comparison before releasing', () => {
        assert.deepEqual(
            [...ci.jobs['ci-result'].needs].sort(),
            ['changes', ...checkedJobs.filter((job) => job !== 'engine-comparison')].sort(),
        );
        assert.deepEqual(ci.jobs.release.needs, ['ci-result']);
    });

    it('fails the result check when a selected job did not pass', () => {
        const step = ci.jobs['ci-result'].steps.find((entry) => entry.id === 'check-results');
        const jobs = JSON.stringify(selectJobs({ code: 'true', integration_scope: 'all' }, 'push'));
        const check = (integration) =>
            spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
                cwd: path.join(scripts, '..'),
                encoding: 'utf8',
                env: {
                    ...process.env,
                    NEEDS: JSON.stringify({
                        changes: { result: 'success', outputs: { jobs } },
                        build: { result: 'success' },
                        integration: { result: integration },
                    }),
                },
            });
        assert.equal(check('success').status, 0, check('success').stderr);
        assert.equal(check('skipped').status, 1);
    });

    it('releases a push only after the result check passes, and a recovery dispatch on its own', () => {
        const release = (event, result, inputs = {}) =>
            evaluate(ci.jobs.release.if, {
                github: { event_name: event, ref: 'refs/heads/master' },
                inputs,
                needs: { 'ci-result': { result } },
            });
        assert.equal(release('push', 'success'), true);
        for (const result of ['failure', 'cancelled', 'skipped']) assert.equal(release('push', result), false);
        assert.equal(release('pull_request', 'success'), false);
        assert.equal(release('workflow_dispatch', 'skipped', { release_commit: 'a'.repeat(40) }), true);
    });

    it('runs engine comparison through its own reusable workflow', () => {
        const comparison = parse(
            fs.readFileSync(path.join(scripts, '../.github/workflows/engine-comparison.yml'), 'utf8'),
        );
        const job = ci.jobs['engine-comparison'];
        assert.ok(Object.hasOwn(comparison.on, 'workflow_call'));
        assert.equal(job.uses, './.github/workflows/engine-comparison.yml');
        assert.ok(
            Object.values(comparison.jobs).some((job) =>
                job.steps?.some((step) => step.run?.includes('compare-engines')),
            ),
        );
    });

    it('passes the selected packages to the integration run', () => {
        const integration = ci.jobs.integration;
        const integrationCommand = integration.steps.find((entry) => entry.id === 'integration-tests');
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
    });

    it('passes the expanded matrix into the reusable action test workflow', () => {
        assert.equal(ci.jobs['action-tests']?.uses, './.github/workflows/actions.yml');
        assert.ok(actions.on.workflow_call.inputs.actions.required);
        assert.equal(actions.on.workflow_call.inputs.actions.type, 'string');
        const outputs = { actions: '[]', actions_to_test: '["common"]' };
        assert.equal(evaluate(ci.jobs['action-tests'].with.actions, { needs: { changes: { outputs } } }), '["common"]');
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
        assert.ok(extensions.jobs.verify.steps.some((step) => step.run?.includes('run package')));
    });
});
