// Tests the plugin publish workflow's steps and where release-please is pinned.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const publishWorkflow = parse(
    fs.readFileSync(path.join(root, '.github', 'workflows', 'publish-plugin-release.yml'), 'utf8'),
);
const dirs = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('release workflow', () => {
    it('validates the tagged plugin identity before writing asset job outputs', () => {
        const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-workflow-'));
        dirs.push(sourceRoot);
        fs.mkdirSync(path.join(sourceRoot, 'packages/plugin/src'), { recursive: true });
        fs.writeFileSync(
            path.join(sourceRoot, 'release-please-config.json'),
            JSON.stringify({ packages: { 'packages/plugin': { component: 'plugin' } } }),
        );
        fs.writeFileSync(path.join(sourceRoot, '.release-please-manifest.json'), '{"packages/plugin":"1.2.3"}');
        fs.writeFileSync(
            path.join(sourceRoot, 'packages/plugin/package.json'),
            JSON.stringify({
                version: '1.2.3',
                pumpkinPlugin: { info: 'src/info.mjs', output: 'build/plugin.wasm' },
            }),
        );
        fs.writeFileSync(
            path.join(sourceRoot, 'packages/plugin/src/info.mjs'),
            `export const info = { name: ${JSON.stringify('Published plugin\nplugin_name=Attacker')} };`,
        );

        const step = publishWorkflow.jobs.publish.steps.find(({ id }) => id === 'plugin');
        assert.ok(step?.run, 'missing asset input resolver run block');

        const outputFile = path.join(sourceRoot, 'github-output');
        fs.writeFileSync(outputFile, '');
        const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, GITHUB_OUTPUT: outputFile, SOURCE_ROOT: sourceRoot, TAG: 'plugin-v1.2.3' },
        });

        assert.notEqual(result.status, 0, result.stderr);
        assert.match(result.stderr, /single-line name/);
        assert.equal(fs.readFileSync(outputFile, 'utf8'), '');
    });

    it('passes the repository signing key to the Market preparation step', () => {
        const step = publishWorkflow.jobs.publish.steps.find(({ run }) => run?.includes('prepare-market-plugin.mjs'));
        assert.equal(step?.env?.PLUGIN_SIGNING_KEY, ['$', '{{ secrets.PLUGIN_SIGNING_KEY }}'].join(''));
    });
});

it('pins release-please only in the root package.json', () => {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies?.[
        'release-please'
    ];
    assert.match(version ?? '', /^\d+\.\d+\.\d+$/, 'the root package.json needs an exact release-please version');
    // Tracked files that name release-please, apart from the root manifest and pnpm's lockfile.
    const grep = spawnSync('git', ['grep', '-lIF', 'release-please', '--', '.', ':!package.json', ':!pnpm-lock.yaml'], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.ok(grep.status === 0 || grep.status === 1, grep.stderr);
    // A versioned `release-please@` package spec or a copy of the version is a second pin.
    const pins = grep.stdout.split('\n').filter((file) => {
        if (!file) return false;
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        return /release-please@\d/.test(text) || text.includes(version);
    });
    assert.deepEqual(pins, [], `read the release-please version from the root package.json (${version})`);
});
