import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';

const { default: defineGenerators } = await import('../turbo/generators/config.ts');

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoots = [];
// The pnpm stub below is a POSIX shell script.
const skipOnWindows = process.platform === 'win32' && 'the pnpm stub is a shell script';

after(() => {
    for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Runs a generator against a scratch root that holds copies of the root files it reads. pnpm is
 * replaced by a stub that records its arguments, so nothing is installed or formatted. `prepare`
 * can change the scratch root before the generator runs.
 */
function generate(generatorName, args, prepare) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'generator-'));
    temporaryRoots.push(root);
    for (const file of [
        'package.json',
        'LICENSE',
        'turbo.json',
        'pnpm-workspace.yaml',
        'release-please-config.json',
        '.release-please-manifest.json',
    ]) {
        fs.copyFileSync(path.join(workspaceRoot, file), path.join(root, file));
    }
    const bin = path.join(root, '.stub-bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\necho "$*" >> "$(dirname "$0")/calls"\n', { mode: 0o755 });
    prepare?.(root);

    execFileSync(
        process.execPath,
        [
            path.join(workspaceRoot, 'node_modules/@turbo/gen/dist/cli.js'),
            'run',
            generatorName,
            '--config',
            path.join(workspaceRoot, 'turbo/generators/config.ts'),
            '--root',
            root,
            '--args',
            ...args,
        ],
        { cwd: root, stdio: 'pipe', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } },
    );
    return root;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getPluginDescriptionValidator() {
    const generators = new Map();
    defineGenerators({
        setHelper() {},
        setGenerator(name, definition) {
            generators.set(name, definition);
        },
    });

    const descriptionPrompt = generators.get('plugin').prompts.find(({ name }) => name === 'description');
    return descriptionPrompt.validate;
}

test('plugin generator rejects multiline descriptions and accepts a one-line description', () => {
    const validate = getPluginDescriptionValidator();

    assert.equal(validate('First line\nSecond line'), 'Enter a one-line description');
    assert.equal(validate('First line\rSecond line'), 'Enter a one-line description');
    assert.equal(validate('A valid plugin description'), true);
});

test('a generated plugin defines the parse-ts build every plugin needs', { skip: skipOnWindows }, () => {
    const root = generate('plugin', ['my-plugin', 'MyPlugin', 'Does a thing']);
    const manifest = readJson(path.join(root, 'packages/my-plugin/package.json'));

    // scripts/build.test.mjs asserts the same script for every plugin in packages/.
    assert.equal(manifest.scripts['build:parse-ts'], 'pumpkin-plugins-build --parse-ts');
});

test('the starter command is named after the plugin, not the built-in /plugin', { skip: skipOnWindows }, () => {
    const root = generate('plugin', ['my-plugin', 'MyPlugin', 'Does a thing']);
    const spec = fs.readFileSync(path.join(root, 'packages/my-plugin/src/commands/spec.ts'), 'utf8');
    const itest = fs.readFileSync(path.join(root, 'packages/my-plugin/test/plugin.itest.ts'), 'utf8');

    assert.match(spec, /["']my-plugin["']\s*:\s*\{/);
    assert.match(spec, /:command\.my-plugin`/);
    assert.doesNotMatch(spec, /\bplugin\s*:\s*\{/);
    assert.match(itest, /server\.command\(["']my-plugin["']\)/);
});

test('a generated extension supports the @types/vscode version in the catalog', { skip: skipOnWindows }, () => {
    const root = generate('extension', ['my-extension', 'My Extension', 'Does a thing'], (scratch) => {
        const workspaceFile = path.join(scratch, 'pnpm-workspace.yaml');
        const workspace = fs.readFileSync(workspaceFile, 'utf8');
        fs.writeFileSync(workspaceFile, workspace.replace(/("@types\/vscode":) .*/, '$1 1.999.0'));
    });
    const manifest = readJson(path.join(root, 'extensions/my-extension/package.json'));

    // vsce refuses to package when @types/vscode is newer than engines.vscode.
    assert.equal(manifest.engines.vscode, '^1.999.0');
});
