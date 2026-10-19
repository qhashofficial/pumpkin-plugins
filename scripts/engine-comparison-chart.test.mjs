import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { uploadBenchmarkChart } from './engine-comparison-chart.mjs';

it('publishes light and dark SVGs to the retained chart branch', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'engine-comparison-chart-'));
    try {
        const lightPath = join(directory, 'changes-light.svg');
        const darkPath = join(directory, 'changes-dark.svg');
        const lightSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>light</text></svg>';
        const darkSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>dark</text></svg>';
        writeFileSync(lightPath, lightSvg);
        writeFileSync(darkPath, darkSvg);
        const requests = [];
        const outputs = [];
        const chartUrls = {
            light: 'https://raw.githubusercontent.com/example/project/benchmark-charts/engine-comparison/456-light.svg',
            dark: 'https://raw.githubusercontent.com/example/project/benchmark-charts/engine-comparison/456-dark.svg',
        };

        const result = await uploadBenchmarkChart(
            {
                apiUrl: 'https://api.github.com',
                chartPaths: { light: lightPath, dark: darkPath },
                defaultBranch: 'main',
                repository: 'example/project',
                serverUrl: 'https://github.com',
                sourceRunId: '456',
                token: 'app-token',
            },
            {
                fetchImpl: async (url, options) => {
                    requests.push({ url: String(url), options });
                    const requestUrl = new URL(url);
                    if (requestUrl.pathname === '/repos/example/project/git/ref/heads/benchmark-charts') {
                        return jsonResponse({ message: 'Not Found' }, 404);
                    }
                    if (requestUrl.pathname === '/repos/example/project/git/ref/heads/main') {
                        return jsonResponse({ object: { sha: 'mainsha' } });
                    }
                    if (requestUrl.pathname === '/repos/example/project/git/refs') {
                        return jsonResponse({ ref: 'refs/heads/benchmark-charts' }, 201);
                    }
                    const chartPath = requestUrl.pathname.match(
                        /\/contents\/(engine-comparison\/456-(light|dark)\.svg)$/,
                    )?.[1];
                    if (chartPath) {
                        if (options.method !== 'PUT') return jsonResponse({ message: 'Not Found' }, 404);
                        const theme = chartPath.endsWith('-light.svg') ? 'light' : 'dark';
                        return jsonResponse({ content: { download_url: chartUrls[theme], path: chartPath } }, 201);
                    }
                    assert.fail(`Unexpected GitHub API request: ${requestUrl.pathname}`);
                },
                writeOutput: (name, value) => outputs.push([name, value]),
            },
        );

        assert.deepEqual(result, chartUrls);
        assert.deepEqual(outputs, [
            ['light_chart_url', chartUrls.light],
            ['dark_chart_url', chartUrls.dark],
        ]);
        assert.deepEqual(
            requests.map(({ options }) => options.method ?? 'GET'),
            ['GET', 'GET', 'POST', 'GET', 'PUT', 'GET', 'PUT'],
        );
        assert.ok(requests.every(({ options }) => options.headers.Authorization === 'Bearer app-token'));

        const createBranch = requests[2];
        assert.equal(createBranch.options.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(createBranch.options.body), {
            ref: 'refs/heads/benchmark-charts',
            sha: 'mainsha',
        });

        const lightUpload = requests[4];
        assert.equal(new URL(requests[3].url).searchParams.get('ref'), 'benchmark-charts');
        assert.deepEqual(JSON.parse(lightUpload.options.body), {
            message: 'ci(benchmarks): publish light chart for run 456',
            content: Buffer.from(lightSvg).toString('base64'),
            branch: 'benchmark-charts',
        });
        assert.deepEqual(JSON.parse(requests[6].options.body), {
            message: 'ci(benchmarks): publish dark chart for run 456',
            content: Buffer.from(darkSvg).toString('base64'),
            branch: 'benchmark-charts',
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

it('updates both chart files when GitHub reruns a workflow', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'engine-comparison-chart-existing-'));
    try {
        const lightPath = join(directory, 'changes-light.svg');
        const darkPath = join(directory, 'changes-dark.svg');
        const lightSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>light</text></svg>';
        const darkSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>dark</text></svg>';
        writeFileSync(lightPath, lightSvg);
        writeFileSync(darkPath, darkSvg);
        const requests = [];
        const chartUrls = {
            light: 'https://raw.githubusercontent.com/example/project/benchmark-charts/engine-comparison/789-light.svg',
            dark: 'https://raw.githubusercontent.com/example/project/benchmark-charts/engine-comparison/789-dark.svg',
        };

        const result = await uploadBenchmarkChart(
            {
                apiUrl: 'https://api.github.com',
                chartPaths: { light: lightPath, dark: darkPath },
                defaultBranch: 'main',
                repository: 'example/project',
                serverUrl: 'https://github.com',
                sourceRunId: '789',
                token: 'app-token',
            },
            {
                fetchImpl: async (url, options) => {
                    requests.push({ url: String(url), options });
                    const requestUrl = new URL(url);
                    if (requestUrl.pathname === '/repos/example/project/git/ref/heads/benchmark-charts') {
                        return jsonResponse({ ref: 'refs/heads/benchmark-charts' });
                    }
                    const chartPath = requestUrl.pathname.match(
                        /\/contents\/(engine-comparison\/789-(light|dark)\.svg)$/,
                    )?.[1];
                    if (chartPath) {
                        const theme = chartPath.endsWith('-light.svg') ? 'light' : 'dark';
                        if (options.method !== 'PUT') {
                            return jsonResponse({
                                _links: {
                                    git: 'https://api.github.com/repos/example/project/git/blobs/oldsha',
                                    html: `https://github.com/example/project/blob/benchmark-charts/${chartPath}`,
                                    self: `https://api.github.com/repos/example/project/contents/${chartPath}`,
                                },
                                download_url: chartUrls[theme],
                                encoding: 'base64',
                                name: chartPath.split('/').at(-1),
                                path: chartPath,
                                sha: `${theme}-oldsha`,
                                size: 34,
                                type: 'file',
                                url: `https://api.github.com/repos/example/project/contents/${chartPath}`,
                            });
                        }
                        return jsonResponse({ content: { download_url: chartUrls[theme], path: chartPath } }, 201);
                    }
                    assert.fail(`Unexpected GitHub API request: ${requestUrl.pathname}`);
                },
                writeOutput: () => {},
            },
        );

        assert.deepEqual(result, chartUrls);
        assert.deepEqual(
            requests.map(({ options }) => options.method ?? 'GET'),
            ['GET', 'GET', 'PUT', 'GET', 'PUT'],
        );
        assert.deepEqual(JSON.parse(requests[2].options.body), {
            message: 'ci(benchmarks): publish light chart for run 789',
            content: Buffer.from(lightSvg).toString('base64'),
            branch: 'benchmark-charts',
            sha: 'light-oldsha',
        });
        assert.deepEqual(JSON.parse(requests[4].options.body), {
            message: 'ci(benchmarks): publish dark chart for run 789',
            content: Buffer.from(darkSvg).toString('base64'),
            branch: 'benchmark-charts',
            sha: 'dark-oldsha',
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', ...headers },
        status,
    });
}
