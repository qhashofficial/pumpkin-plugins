import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { discoverBenchmarkArtifacts } from './engine-comparison-comment.mjs';

it('uses the GitHub App token for artifact access and PR comments', () => {
    const workflow = readFileSync(
        new URL('../.github/workflows/engine-comparison-comment.yml', import.meta.url),
        'utf8',
    );

    assert.match(workflow, /uses: actions\/create-github-app-token@v3\.2\.0/);
    assert.match(workflow, /permission-contents: write/);
    assert.match(workflow, /GITHUB_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
    assert.match(workflow, /GH_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
    assert.equal((workflow.match(/github-token: \$\{\{ steps\.app-token\.outputs\.token \}\}/g) ?? []).length, 2);
    assert.match(workflow, /node scripts\/engine-comparison-comment\.mjs discover/);
    assert.match(workflow, /node scripts\/engine-comparison-chart\.mjs publish/);
    assert.match(workflow, /GITHUB_API_URL: \$\{\{ github\.api_url \}\}/);
    assert.match(workflow, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
    assert.match(workflow, /SOURCE_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    assert.match(
        workflow,
        /BENCHMARK_CHANGE_SVG_LIGHT_URL: \$\{\{ steps\.publish-chart\.outputs\.light_chart_url \}\}/,
    );
    assert.match(workflow, /BENCHMARK_CHANGE_SVG_DARK_URL: \$\{\{ steps\.publish-chart\.outputs\.dark_chart_url \}\}/);
    assert.ok(
        workflow.indexOf('name: 🕶️ Checkout trusted default-branch scripts') <
            workflow.indexOf('run: node scripts/engine-comparison-comment.mjs discover'),
    );
    assert.doesNotMatch(workflow, /secrets\.GITHUB_TOKEN/);
});

it('finds the current report and newest default-branch baseline before the PR base', async () => {
    const outputs = [];
    const requests = [];
    const responses = new Map([
        [
            '/repos/example/project/actions/runs/100/artifacts?per_page=100',
            { artifacts: [{ name: 'engine-comparison-report', id: 900, expired: false }] },
        ],
        [
            '/repos/example/project/actions/workflows/ci.yml/runs?branch=master&event=push&status=success&per_page=100',
            {
                workflow_runs: [
                    { id: 80, head_sha: 'recent' },
                    { id: 70, head_sha: 'ancestor' },
                ],
            },
        ],
        ['/repos/example/project/compare/recent...base', { status: 'diverged' }],
        ['/repos/example/project/compare/ancestor...base', { status: 'ahead' }],
        [
            '/repos/example/project/actions/runs/70/artifacts?per_page=100',
            { artifacts: [{ name: 'engine-comparison-report', id: 700, expired: false }] },
        ],
    ]);

    const result = await discoverBenchmarkArtifacts(
        {
            apiUrl: 'https://api.github.com',
            defaultBranch: 'master',
            pullRequestBaseSha: 'base',
            pullRequestNumber: '42',
            repository: 'example/project',
            sourceRunId: '100',
            token: 'app-token',
        },
        {
            fetchImpl: async (url, options) => {
                requests.push({ url: String(url), options });
                const pathname = new URL(url).pathname + new URL(url).search;
                assert.ok(responses.has(pathname), `Unexpected API request: ${pathname}`);
                return jsonResponse(responses.get(pathname));
            },
            writeOutput: (name, value) => outputs.push([name, value]),
        },
    );

    assert.deepEqual(result, {
        hasReport: true,
        baselineRunId: '70',
        baselineSha: 'ancestor',
        prBaseSha: 'base',
        sourceArtifactId: '900',
    });
    assert.deepEqual(outputs, [
        ['has_report', 'true'],
        ['pr_base_sha', 'base'],
        ['baseline_run_id', '70'],
        ['baseline_sha', 'ancestor'],
    ]);
    assert.ok(requests.every(({ options }) => options.headers.Authorization === 'Bearer app-token'));
});

it('finds an eligible baseline on the next workflow-runs page', async () => {
    const outputs = [];
    const requests = [];
    const responses = new Map([
        [
            '/repos/example/project/actions/runs/100/artifacts?per_page=100',
            jsonResponse({ artifacts: [{ name: 'engine-comparison-report', id: 900, expired: false }] }),
        ],
        [
            '/repos/example/project/actions/workflows/ci.yml/runs?branch=master&event=push&status=success&per_page=100',
            jsonResponse({ workflow_runs: [{ id: 80, head_sha: 'diverged' }] }, 200, {
                Link: '<https://api.github.com/repos/example/project/actions/workflows/ci.yml/runs?branch=master&event=push&status=success&per_page=100&page=2>; rel="next"',
            }),
        ],
        [
            '/repos/example/project/actions/workflows/ci.yml/runs?branch=master&event=push&status=success&per_page=100&page=2',
            jsonResponse({ workflow_runs: [{ id: 70, head_sha: 'ancestor' }] }),
        ],
        ['/repos/example/project/compare/diverged...base', jsonResponse({ status: 'diverged' })],
        ['/repos/example/project/compare/ancestor...base', jsonResponse({ status: 'ahead' })],
        [
            '/repos/example/project/actions/runs/70/artifacts?per_page=100',
            jsonResponse({ artifacts: [{ name: 'engine-comparison-report', id: 700, expired: false }] }),
        ],
    ]);

    const result = await discoverBenchmarkArtifacts(
        {
            apiUrl: 'https://api.github.com',
            defaultBranch: 'master',
            pullRequestBaseSha: 'base',
            pullRequestNumber: '42',
            repository: 'example/project',
            sourceRunId: '100',
            token: 'app-token',
        },
        {
            fetchImpl: async (url, options) => {
                requests.push({ url: String(url), options });
                const pathname = new URL(url).pathname + new URL(url).search;
                assert.ok(responses.has(pathname), `Unexpected API request: ${pathname}`);
                return responses.get(pathname);
            },
            writeOutput: (name, value) => outputs.push([name, value]),
        },
    );

    assert.equal(result.baselineRunId, '70');
    assert.equal(result.baselineSha, 'ancestor');
    assert.ok(
        requests.some(({ url }) =>
            url.endsWith('/actions/workflows/ci.yml/runs?branch=master&event=push&status=success&per_page=100&page=2'),
        ),
    );
    assert.deepEqual(outputs, [
        ['has_report', 'true'],
        ['pr_base_sha', 'base'],
        ['baseline_run_id', '70'],
        ['baseline_sha', 'ancestor'],
    ]);
});

it('skips runs without an unexpired benchmark report artifact', async () => {
    const outputs = [];
    const result = await discoverBenchmarkArtifacts(
        {
            apiUrl: 'https://api.github.com',
            defaultBranch: 'master',
            pullRequestBaseSha: 'base',
            pullRequestNumber: '42',
            repository: 'example/project',
            sourceRunId: '100',
            token: 'app-token',
        },
        {
            fetchImpl: async () =>
                jsonResponse({ artifacts: [{ name: 'engine-comparison-report', id: 900, expired: true }] }),
            writeOutput: (name, value) => outputs.push([name, value]),
        },
    );

    assert.deepEqual(result, { hasReport: false });
    assert.deepEqual(outputs, [['has_report', 'false']]);
});

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', ...headers },
        status,
    });
}
