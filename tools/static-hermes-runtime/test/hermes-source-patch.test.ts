import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { acquireHermesBuildLock, isHermesBuildCacheCurrent, saveHermesBuildCache } from '../src/hermes/build.ts';
import type { HermesPatch } from '../src/hermes/patch.ts';
import {
    applyHermesPatchSeries,
    HermesPatchConflictError,
    readHermesPatchSeries,
    verifyHermesPatchSeriesApplied,
} from '../src/hermes/patch.ts';
import {
    ensureHermesSource,
    parseHermesSourcePin,
    readHermesSourcePin,
    refreshHermesSource,
} from '../src/hermes/source.ts';
import { type HermesProcessRunner, hermesProcess } from '../src/hermes/system.ts';

const directories: string[] = [];
const pin = {
    repository: 'https://github.com/facebook/hermes.git',
    branch: 'static_h',
    commit: '820aa0d4b5fe5d3ed7900e1274211ef561081b3f',
};

afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('validates Hermes source pin shape before invoking Git', () => {
    expect(parseHermesSourcePin(pin)).toEqual(pin);
    expect(() => parseHermesSourcePin({ ...pin, commit: '1234' })).toThrow('40-character commit SHA');
    expect(() => parseHermesSourcePin({ ...pin, repository: 'file:///tmp/hermes.git' })).toThrow('public HTTPS URL');
});

it('reports a missing source pin with its path', () => {
    const root = temporaryDirectory();
    expect(() => readHermesSourcePin(path.join(root, 'missing.json'))).toThrow(/Hermes source pin not found/);
});

it('clones and validates the pinned checkout through an injectable Git runner', () => {
    const root = temporaryDirectory();
    const source = path.join(root, 'source');
    const commits = new Map<string, string>();
    const runner: HermesProcessRunner = {
        run(_command, args) {
            if (args[0] === 'clone') {
                const destination = args.at(-1);
                if (destination === undefined) throw new Error('Git clone destination is missing');
                fs.mkdirSync(path.join(destination, '.git'), { recursive: true });
                commits.set(destination, 'not-checked-out');
            } else if (args[0] === '-C' && args[2] === 'checkout') {
                const directory = args[1];
                if (directory === undefined) throw new Error('Git checkout directory is missing');
                commits.set(directory, pin.commit);
            }
        },
        output(_command, args) {
            if (args.includes('--git-dir')) return '.git';
            if (args.includes('HEAD')) {
                const directory = args[1];
                if (directory === undefined) throw new Error('Git HEAD directory is missing');
                return commits.get(directory) ?? '';
            }
            if (isPorcelainStatusCommand(args)) return '';
            throw new Error(`Unexpected Git command: ${args.join(' ')}`);
        },
        buffer() {
            return Buffer.alloc(0);
        },
    };

    expect(ensureHermesSource({ pin, source, managedSource: true, managedPaths: [], process: runner })).toBe(source);
    expect(fs.existsSync(path.join(source, '.git'))).toBe(true);
});

it('preserves LF source files when global Git config enables CRLF checkouts', () => {
    const root = temporaryDirectory();
    const working = path.join(root, 'working');
    const repository = path.join(root, 'hermes.git');
    const source = path.join(root, 'source');
    const seedConfig = path.join(root, 'seed.gitconfig');
    const checkoutConfig = path.join(root, 'checkout.gitconfig');
    fs.writeFileSync(seedConfig, '[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n');
    const seedEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: seedConfig, GIT_CONFIG_NOSYSTEM: '1' };
    const runGit = (args: string[], env: NodeJS.ProcessEnv): string =>
        execFileSync('git', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] });

    runGit(['init', working], seedEnvironment);
    runGit(['-C', working, 'config', 'user.name', 'Hermes test'], seedEnvironment);
    runGit(['-C', working, 'config', 'user.email', 'hermes-test@example.com'], seedEnvironment);
    fs.mkdirSync(path.join(working, 'cmake'));
    fs.writeFileSync(path.join(working, 'cmake', 'Hermes.cmake'), 'set(LLVM_ON_UNIX 1)\n');
    runGit(['-C', working, 'add', '.'], seedEnvironment);
    runGit(['-C', working, 'commit', '-m', 'pinned source fixture'], seedEnvironment);
    const commit = runGit(['-C', working, 'rev-parse', 'HEAD'], seedEnvironment).trim();
    runGit(['clone', '--bare', working, repository], seedEnvironment);

    fs.writeFileSync(checkoutConfig, '[core]\n\tautocrlf = true\n');
    const checkoutEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: checkoutConfig, GIT_CONFIG_NOSYSTEM: '1' };
    const runner: HermesProcessRunner = {
        run(command, args) {
            hermesProcess.run(command, args, { env: checkoutEnvironment, stdio: 'ignore' });
        },
        output(command, args) {
            return hermesProcess.output(command, args, { env: checkoutEnvironment });
        },
        buffer(command, args) {
            return hermesProcess.buffer(command, args, { env: checkoutEnvironment });
        },
    };

    ensureHermesSource({
        pin: { ...pin, repository, commit },
        source,
        managedSource: true,
        managedPaths: [],
        process: runner,
    });

    expect(fs.readFileSync(path.join(source, 'cmake', 'Hermes.cmake'), 'utf8')).toBe('set(LLVM_ON_UNIX 1)\n');
});

it('retries an initial Hermes clone after a failed fetch', () => {
    const root = temporaryDirectory();
    const source = path.join(root, 'source');
    let cloneAttempts = 0;
    let failFirstFetch = true;
    const runner: HermesProcessRunner = {
        run(_command, args) {
            if (args[0] === 'clone') {
                const destination = args.at(-1);
                if (destination === undefined) throw new Error('Git clone destination is missing');
                cloneAttempts += 1;
                fs.mkdirSync(path.join(destination, '.git'), { recursive: true });
            } else if (args[0] === '-C' && args[2] === 'fetch' && failFirstFetch) {
                failFirstFetch = false;
                throw new Error('network interrupted');
            } else if (args[0] === '-C' && args[2] === 'checkout') {
                const directory = args[1];
                if (directory === undefined) throw new Error('Git checkout directory is missing');
                fs.writeFileSync(path.join(directory, '.git', 'resolved-commit'), pin.commit);
            }
        },
        output(_command, args) {
            const directory = args[1];
            if (directory === undefined) throw new Error('Git source directory is missing');
            if (args.includes('--git-dir')) {
                if (!fs.existsSync(path.join(directory, '.git'))) throw new Error('not a Git checkout');
                return '.git';
            }
            if (args.includes('HEAD')) {
                return fs.readFileSync(path.join(directory, '.git', 'resolved-commit'), 'utf8');
            }
            if (isPorcelainStatusCommand(args)) return '';
            throw new Error(`Unexpected Git command: ${args.join(' ')}`);
        },
        buffer() {
            return Buffer.alloc(0);
        },
    };

    expect(() => ensureHermesSource({ pin, source, managedSource: true, managedPaths: [], process: runner })).toThrow(
        'network interrupted',
    );
    expect(fs.readdirSync(root)).toEqual([]);
    expect(ensureHermesSource({ pin, source, managedSource: true, managedPaths: [], process: runner })).toBe(source);
    expect(cloneAttempts).toBe(2);
});

it('discovers patches by numeric order and rejects gaps before applying', () => {
    const directory = temporaryDirectory();
    writePatch(directory, '0001-first.patch', 'first.txt');
    writePatch(directory, '0002-second.patch', 'second.txt');
    expect(readHermesPatchSeries(directory).map(({ name }) => name)).toEqual(['0001-first.patch', '0002-second.patch']);

    fs.renameSync(path.join(directory, '0002-second.patch'), path.join(directory, '0003-second.patch'));
    expect(() => readHermesPatchSeries(directory)).toThrow('expected 0002, found 0003-second.patch');
});

it('applies overlapping patches in order and treats a patched source as applied', () => {
    const { source, patches } = overlappingSeries();

    applyHermesPatchSeries({ source, patches });
    expect(fs.readFileSync(path.join(source, 'lines.txt'), 'utf8')).toBe('a\nB\nC\nd\n');
    expect(() => verifyHermesPatchSeriesApplied(source, patches)).not.toThrow();

    applyHermesPatchSeries({ source, patches });
    expect(fs.readFileSync(path.join(source, 'lines.txt'), 'utf8')).toBe('a\nB\nC\nd\n');
});

it('applies only the patches a partly patched source is missing', () => {
    const { source, patches, contents } = overlappingSeries();
    git(source, ['apply'], contents[0]);

    expect(() => verifyHermesPatchSeriesApplied(source, patches)).toThrow(/not applied: .*0002-second\.patch/);
    applyHermesPatchSeries({ source, patches });

    expect(fs.readFileSync(path.join(source, 'lines.txt'), 'utf8')).toBe('a\nB\nC\nd\n');
});

it('rejects unrelated edits and patch conflicts with actionable paths', () => {
    const { source, patches } = overlappingSeries();
    fs.writeFileSync(path.join(source, 'unrelated.txt'), 'local edit\n');
    expect(() => applyHermesPatchSeries({ source, patches })).toThrow(/outside the managed patch set.*unrelated\.txt/);

    fs.writeFileSync(path.join(source, 'unrelated.txt'), 'keep\n');
    fs.writeFileSync(path.join(source, 'lines.txt'), 'a\nlocal\nc\nd\n');
    let failure: unknown;
    try {
        applyHermesPatchSeries({ source, patches });
    } catch (error) {
        failure = error;
    }
    expect(failure).toBeInstanceOf(HermesPatchConflictError);
    expect(String(failure)).toMatch(/does not apply to the pinned source.*0001-first\.patch/);
    expect(fs.readFileSync(path.join(source, 'lines.txt'), 'utf8')).toBe('a\nlocal\nc\nd\n');
});

it('applies long-path CRLF patches from stdin on Windows', () => {
    const root = temporaryDirectory();
    const base = path.join(root, `workspace-${'x'.repeat(80)}`);
    const source = path.join(base, 'cache', 'hermes', 'source');
    const patchesDirectory = path.join(
        base,
        'consumer',
        'pnpm-create-typescript',
        'node_modules',
        '.pnpm',
        '@pumpkin-plugins+static-hermes-runtime@0.1.0',
        'node_modules',
        '@pumpkin-plugins',
        'static-hermes-runtime',
        'hermes-patches',
    );
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(patchesDirectory, { recursive: true });
    writePatch(patchesDirectory, '0001-first.patch', 'first.txt');
    const patchFilename = path.join(patchesDirectory, '0001-first.patch');
    fs.writeFileSync(patchFilename, fs.readFileSync(patchFilename, 'utf8').replace(/\n/g, '\r\n'));
    const patches = readHermesPatchSeries(patchesDirectory);
    const patch = patches[0];
    if (!patch) throw new Error('Long-path fixture patch is missing');
    expect(patch.filename.length).toBeGreaterThan(260);
    fs.writeFileSync(path.join(source, 'first.txt'), 'old\n');
    execFileSync('git', ['-C', source, 'init'], { stdio: 'ignore' });
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Hermes test'], { stdio: 'ignore' });
    execFileSync('git', ['-C', source, 'config', 'user.email', 'hermes-test@example.com'], { stdio: 'ignore' });
    execFileSync('git', ['-C', source, 'add', 'first.txt'], { stdio: 'ignore' });
    execFileSync('git', ['-C', source, 'commit', '-m', 'source fixture'], { stdio: 'ignore' });
    const runner: HermesProcessRunner = {
        run(command, args, options) {
            if (typeof options?.input !== 'string') throw new Error('Git patch contents must be sent through stdin');
            if (args.includes(patch.filename))
                throw new Error('Git must not receive the long patch path as an argument');
            hermesProcess.run(command, args, options);
        },
        output(command, args, options) {
            return hermesProcess.output(command, args, options);
        },
        buffer(command, args, options) {
            return hermesProcess.buffer(command, args, options);
        },
    };

    expect(() => applyHermesPatchSeries({ source, patches, process: runner })).not.toThrow();
    expect(() => verifyHermesPatchSeriesApplied(source, patches, runner)).not.toThrow();
    expect(fs.readFileSync(path.join(source, 'first.txt'), 'utf8')).toBe('new\n');
});

it('rejects refreshing a managed rename whose destination is outside the patch set', () => {
    const root = temporaryDirectory();
    const source = path.join(root, 'source');
    let rebuildStarted = false;
    const runner: HermesProcessRunner = {
        run() {
            rebuildStarted = true;
            throw new Error('unexpected source rebuild');
        },
        output(_command, args) {
            if (isPorcelainStatusCommand(args)) {
                return args.includes('-z') ? 'R  unrelated.txt\0managed.txt\0' : 'R  managed.txt -> unrelated.txt';
            }
            if (args.includes('--git-dir')) return '.git';
            if (args.includes('HEAD')) return pin.commit;
            throw new Error(`Unexpected Git command: ${args.join(' ')}`);
        },
        buffer() {
            return Buffer.alloc(0);
        },
    };

    expect(() =>
        refreshHermesSource({ pin, source, managedSource: true, managedPaths: ['managed.txt'], process: runner }),
    ).toThrow(/outside the managed patch set.*unrelated\.txt/);
    expect(rebuildStarted).toBe(false);
});

it('rejects patch application when a patch-owned rename targets an unrelated path', () => {
    const source = temporaryDirectory();
    let patchCheckStarted = false;
    const runner: HermesProcessRunner = {
        run() {
            patchCheckStarted = true;
            throw new Error('unexpected patch check');
        },
        output(_command, args) {
            if (isPorcelainStatusCommand(args)) {
                return args.includes('-z') ? 'R  unrelated.txt\0managed.txt\0' : 'R  managed.txt -> unrelated.txt';
            }
            throw new Error(`Unexpected Git command: ${args.join(' ')}`);
        },
        buffer() {
            return Buffer.alloc(0);
        },
    };

    expect(() =>
        applyHermesPatchSeries({
            source,
            patches: [
                {
                    name: '0001-managed.patch',
                    filename: '/patches/0001-managed.patch',
                    sequence: 1,
                    affectedPaths: ['managed.txt'],
                },
            ],
            process: runner,
        }),
    ).toThrow(/outside the managed patch set.*unrelated\.txt/);
    expect(patchCheckStarted).toBe(false);
});

it('rejects patch application when a patch-owned copy targets an unrelated path', () => {
    const source = temporaryDirectory();
    const runner: HermesProcessRunner = {
        run() {
            throw new Error('unexpected patch check');
        },
        output(_command, args) {
            if (isPorcelainStatusCommand(args)) {
                return args.includes('-z')
                    ? 'C  unrelated-copy.txt\0managed.txt\0'
                    : 'C  managed.txt -> unrelated-copy.txt';
            }
            throw new Error(`Unexpected Git command: ${args.join(' ')}`);
        },
        buffer() {
            return Buffer.alloc(0);
        },
    };

    expect(() =>
        applyHermesPatchSeries({
            source,
            patches: [
                {
                    name: '0001-managed.patch',
                    filename: '/patches/0001-managed.patch',
                    sequence: 1,
                    affectedPaths: ['managed.txt'],
                },
            ],
            process: runner,
        }),
    ).toThrow(/outside the managed patch set.*unrelated-copy\.txt/);
});

it('validates and atomically saves the build cache fingerprint', () => {
    const root = temporaryDirectory();
    const artifact = path.join(root, 'hermesvm.a');
    const state = path.join(root, 'prepared-build.json');
    fs.writeFileSync(artifact, 'archive');
    saveHermesBuildCache('a'.repeat(64), state, root);

    expect(isHermesBuildCacheCurrent('a'.repeat(64), state, [artifact])).toBe(true);
    expect(isHermesBuildCacheCurrent('b'.repeat(64), state, [artifact])).toBe(false);
    fs.writeFileSync(state, '{ invalid json');
    expect(isHermesBuildCacheCurrent('a'.repeat(64), state, [artifact])).toBe(false);
});

it('removes stale build locks, waits for live owners, and times out cleanly', async () => {
    const root = temporaryDirectory();
    const staleLock = path.join(root, 'stale.lock');
    fs.writeFileSync(staleLock, JSON.stringify({ pid: 99999999, startedAt: 1 }));
    await acquireHermesBuildLock(staleLock, { isProcessAlive: () => false, wait: async () => undefined });
    expect(JSON.parse(fs.readFileSync(staleLock, 'utf8')).pid).toBe(process.pid);

    const liveLock = path.join(root, 'live.lock');
    fs.writeFileSync(liveLock, JSON.stringify({ pid: 2, startedAt: 1 }));
    let time = 0;
    await expect(
        acquireHermesBuildLock(liveLock, {
            timeoutMs: 250,
            isProcessAlive: () => true,
            now: () => time,
            wait: async (delay) => {
                time += delay;
            },
        }),
    ).rejects.toThrow(`Timed out waiting for Hermes build lock: ${liveLock}`);
});

function temporaryDirectory(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'static-hermes-source-patch-'));
    directories.push(directory);
    return directory;
}

function writePatch(directory: string, name: string, filename: string): void {
    fs.writeFileSync(
        path.join(directory, name),
        `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n@@ -1 +1 @@\n-old\n+new\n`,
    );
}

/** Run Git in a fixture repository without signing or line-ending conversion from user config. */
function git(cwd: string, args: string[], input?: string): string {
    return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-C', cwd, ...args], {
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

/** Create a committed Git repository with the given files. */
function repository(files: Record<string, string>): string {
    const directory = temporaryDirectory();
    git(directory, ['init', '--quiet']);
    git(directory, ['config', 'user.name', 'Hermes test']);
    git(directory, ['config', 'user.email', 'hermes-test@example.com']);
    for (const [filename, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(directory, filename)), { recursive: true });
        fs.writeFileSync(path.join(directory, filename), text);
    }
    git(directory, ['add', '.']);
    git(directory, ['commit', '--quiet', '-m', 'source fixture']);
    return directory;
}

/** Build a two-patch series where the second patch's context includes the first patch's change. */
function overlappingSeries(): { source: string; patches: HermesPatch[]; contents: string[] } {
    const base = { 'lines.txt': 'a\nb\nc\nd\n', 'unrelated.txt': 'keep\n' };
    const author = repository(base);
    const patchesDirectory = temporaryDirectory();
    const contents = ['a\nB\nc\nd\n', 'a\nB\nC\nd\n'].map((text, index) => {
        fs.writeFileSync(path.join(author, 'lines.txt'), text);
        const patch = git(author, ['diff']);
        git(author, ['commit', '--quiet', '-am', `step ${index + 1}`]);
        fs.writeFileSync(
            path.join(patchesDirectory, `000${index + 1}-${index === 0 ? 'first' : 'second'}.patch`),
            patch,
        );
        return patch;
    });
    return { source: repository(base), patches: readHermesPatchSeries(patchesDirectory), contents };
}

function isPorcelainStatusCommand(args: readonly string[]): boolean {
    return args.some((argument) => argument.startsWith('--porcelain'));
}
