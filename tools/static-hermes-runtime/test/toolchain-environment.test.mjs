import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as toolchainEnvironment from '../src/hermes/toolchain-environment.ts';

const { fetchWasiSdkRelease, prepareStaticHermesBuild, selectWasiSdkAsset, setupHermesToolchainEnvironment } =
    toolchainEnvironment;
const { selectWasmToolsAsset } = toolchainEnvironment;
const readJson = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const wasiSdkLock = readJson('../wasi-sdk.lock.json');
const wasmToolsLock = readJson('../wasm-tools.lock.json');
const { tools } = readJson('../toolchain-versions.json');
const wasiSdkDirectory = `wasi-sdk-${wasiSdkLock.version}`;
const witBindgenDirectory = `wit-bindgen-${tools['wit-bindgen']}`;

const temporaryDirs = [];

afterEach(() => {
    for (const directory of temporaryDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('uses the configured WASI SDK and wit-bindgen paths when provided', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-existing-tools-');
    const wasiSdk = path.join(workspaceRoot, 'wasi-sdk');
    const witBindgen = path.join(workspaceRoot, 'bin', 'wit-bindgen');
    writeExecutable(path.join(wasiSdk, 'bin', 'wasm32-wasip2-clang'));
    writeExecutable(path.join(wasiSdk, 'bin', 'wasm32-wasip2-clang++'));
    writeExecutable(witBindgen, `#!/bin/sh\necho "wit-bindgen-cli ${tools['wit-bindgen']} (fixture)"\n`);
    const installWasiSdk = vi.fn();
    const installWitBindgen = vi.fn();

    const environment = await setupHermesToolchainEnvironment({
        workspaceRoot,
        env: { WASI_SDK_PATH: wasiSdk, WIT_BINDGEN: witBindgen },
        installWasiSdk,
        installWitBindgen,
    });

    expect(environment).toEqual({
        STATIC_HERMES_CACHE_DIR: path.join(workspaceRoot, '.cache', 'hermes'),
        STATIC_HERMES_WASI_SDK_PATH: wasiSdk,
        WIT_BINDGEN: witBindgen,
    });
    expect(installWasiSdk).not.toHaveBeenCalled();
    expect(installWitBindgen).not.toHaveBeenCalled();
});

it('installs missing pinned toolchain dependencies under .cache/hermes', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-install-tools-');
    const installWasiSdk = vi.fn(({ destination }) => {
        writeExecutable(path.join(destination, 'bin', 'wasm32-wasip2-clang'));
        writeExecutable(path.join(destination, 'bin', 'wasm32-wasip2-clang++'));
        return destination;
    });
    const installWitBindgen = vi.fn(({ destination, version }) => {
        writeExecutable(destination, `#!/bin/sh\necho "wit-bindgen-cli ${version} (fixture)"\n`);
        return destination;
    });

    const environment = await setupHermesToolchainEnvironment({
        workspaceRoot,
        env: {},
        platform: 'darwin',
        arch: 'arm64',
        homeDirectory: workspaceRoot,
        installWasiSdk,
        installWitBindgen,
    });

    expect(installWasiSdk).toHaveBeenCalledWith(
        expect.objectContaining({
            platform: 'darwin',
            arch: 'arm64',
            destination: path.join(workspaceRoot, '.cache', 'hermes', 'toolchain', wasiSdkDirectory),
        }),
    );
    expect(installWitBindgen).toHaveBeenCalledWith(
        expect.objectContaining({
            destination: path.join(
                workspaceRoot,
                '.cache',
                'hermes',
                'toolchain',
                witBindgenDirectory,
                'bin',
                'wit-bindgen',
            ),
        }),
    );
    expect(environment.STATIC_HERMES_WASI_SDK_PATH).toBe(
        path.join(workspaceRoot, '.cache', 'hermes', 'toolchain', wasiSdkDirectory),
    );
    expect(environment.WIT_BINDGEN).toBe(
        path.join(workspaceRoot, '.cache', 'hermes', 'toolchain', witBindgenDirectory, 'bin', 'wit-bindgen'),
    );
});

it('keeps an installed SDK when a later installer publishes to the same cache path', () => {
    const workspaceRoot = temporaryDirectory('static-hermes-sdk-publish-');
    const destination = path.join(workspaceRoot, '.cache', 'hermes', 'toolchain', wasiSdkDirectory);
    const firstExtraction = path.join(workspaceRoot, 'first-install');
    const laterExtraction = path.join(workspaceRoot, 'later-install');
    const compilerPath = path.join(destination, 'bin', 'wasm32-wasip2-clang');

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    writeExecutable(path.join(firstExtraction, 'bin', 'wasm32-wasip2-clang'), '#!/bin/sh\n# first SDK\nexit 0\n');
    writeExecutable(path.join(firstExtraction, 'bin', 'wasm32-wasip2-clang++'), '#!/bin/sh\n# first SDK C++\nexit 0\n');
    writeExecutable(path.join(laterExtraction, 'bin', 'wasm32-wasip2-clang'), '#!/bin/sh\n# later SDK\nexit 0\n');
    writeExecutable(path.join(laterExtraction, 'bin', 'wasm32-wasip2-clang++'), '#!/bin/sh\n# later SDK C++\nexit 0\n');

    const publish = toolchainEnvironment.publishWasiSdkDirectory;
    const firstResult = publish?.(firstExtraction, destination);
    const laterResult = publish?.(laterExtraction, destination);

    expect(firstResult).toBe(destination);
    expect(laterResult).toBe(destination);
    expect(fs.readFileSync(compilerPath, 'utf8')).toBe('#!/bin/sh\n# first SDK\nexit 0\n');
});

it('uses the configured WASI SDK version for the cache path and release lookup', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-configured-sdk-');
    const installWasiSdk = vi.fn(({ destination }) => {
        writeExecutable(path.join(destination, 'bin', 'wasm32-wasip2-clang'));
        writeExecutable(path.join(destination, 'bin', 'wasm32-wasip2-clang++'));
        return destination;
    });

    await setupHermesToolchainEnvironment({
        workspaceRoot,
        env: {},
        platform: 'linux',
        arch: 'x64',
        homeDirectory: workspaceRoot,
        includeWitBindgen: false,
        wasiSdkConfig: {
            repository: 'https://github.com/WebAssembly/wasi-sdk',
            version: '35',
            checksums: { 'linux/x64': 'b'.repeat(64) },
        },
        installWasiSdk,
    });

    expect(installWasiSdk).toHaveBeenCalledWith(
        expect.objectContaining({
            version: '35',
            sha256: 'b'.repeat(64),
            destination: path.join(workspaceRoot, '.cache', 'hermes', 'toolchain', 'wasi-sdk-35'),
        }),
    );
});

it('uses the configured wit-bindgen version for its install cache', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-configured-bindgen-');
    const wasiSdk = path.join(workspaceRoot, 'wasi-sdk');
    writeExecutable(path.join(wasiSdk, 'bin', 'wasm32-wasip2-clang'));
    writeExecutable(path.join(wasiSdk, 'bin', 'wasm32-wasip2-clang++'));
    const installWitBindgen = vi.fn(({ destination, version }) => {
        writeExecutable(destination, `#!/bin/sh\necho "wit-bindgen-cli ${version} (fixture)"\n`);
        return destination;
    });

    await setupHermesToolchainEnvironment({
        workspaceRoot,
        env: { STATIC_HERMES_WASI_SDK_PATH: wasiSdk },
        homeDirectory: workspaceRoot,
        toolchainConfig: { tools: { 'wit-bindgen': '0.63.1', rust: '2.0.0' } },
        installWitBindgen,
    });

    expect(installWitBindgen).toHaveBeenCalledWith(
        expect.objectContaining({
            version: '0.63.1',
            destination: path.join(
                workspaceRoot,
                '.cache',
                'hermes',
                'toolchain',
                'wit-bindgen-0.63.1',
                'bin',
                'wit-bindgen',
            ),
        }),
    );
});

it('loads SDK assets from the configured GitHub release metadata endpoint', async () => {
    const release = { tag_name: 'wasi-sdk-35', assets: [] };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => release }));

    await expect(
        fetchWasiSdkRelease({
            repository: 'https://github.com/WebAssembly/wasi-sdk',
            version: '35',
            token: 'gh-token',
            fetchImpl,
        }),
    ).resolves.toBe(release);
    expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.github.com/repos/WebAssembly/wasi-sdk/releases/tags/wasi-sdk-35',
        expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer gh-token' }),
        }),
    );
});

it.each([
    ['darwin', 'arm64', 'arm64-macos'],
    ['darwin', 'x64', 'x86_64-macos'],
    ['linux', 'arm64', 'arm64-linux'],
    ['linux', 'riscv64', 'riscv64-linux'],
    ['linux', 'x64', 'x86_64-linux'],
    ['win32', 'arm64', 'arm64-windows'],
    ['win32', 'x64', 'x86_64-windows'],
])('selects the pinned WASI SDK archive and checksum for %s/%s', (platform, arch, target) => {
    const { version } = wasiSdkLock;
    const name = `wasi-sdk-${version}.0-${target}.tar.gz`;
    const digest = wasiSdkLock.checksums[`${platform}/${arch}`];
    const release = {
        assets: [
            { name: `wasi-sdk-${version}.0-x86_64-linux.deb`, browser_download_url: 'https://example.invalid/deb' },
            {
                name,
                browser_download_url: `https://example.invalid/${name}`,
                digest: `sha256:${digest}`,
            },
        ],
    };

    expect(selectWasiSdkAsset(release, { version, platform, arch, expectedSha256: digest })).toEqual(
        expect.objectContaining({ name, digest: `sha256:${digest}` }),
    );
});

it('requires a checksum and a matching archive for the pinned WASI SDK release', () => {
    expect(() =>
        selectWasiSdkAsset(
            {
                assets: [
                    { name: 'wasi-sdk-34.0-x86_64-linux.tar.gz', browser_download_url: 'https://example.invalid' },
                ],
            },
            { version: '34', platform: 'linux', arch: 'x64', expectedSha256: 'a'.repeat(64) },
        ),
    ).toThrow(/SHA-256 digest/);
    expect(() =>
        selectWasiSdkAsset(
            { assets: [] },
            { version: '34', platform: 'freebsd', arch: 'x64', expectedSha256: 'a'.repeat(64) },
        ),
    ).toThrow(/no WASI SDK 34 archive for freebsd\/x64/);
});

it('rejects release metadata whose SDK checksum differs from the lock pin', () => {
    const release = {
        assets: [
            {
                name: 'wasi-sdk-34.0-x86_64-linux.tar.gz',
                browser_download_url: 'https://example.invalid/sdk.tar.gz',
                digest: `sha256:${'a'.repeat(64)}`,
            },
        ],
    };

    expect(() =>
        selectWasiSdkAsset(release, {
            version: '34',
            platform: 'linux',
            arch: 'x64',
            expectedSha256: 'b'.repeat(64),
        }),
    ).toThrow(/does not match the pinned SHA-256/);
});

it('verifies downloaded WASI SDK bytes against the lock checksum', async () => {
    const archive = path.join(temporaryDirectory('static-hermes-sdk-archive-checksum-'), 'sdk.tar.gz');
    const archiveBytes = Buffer.from([1, 2, 3]);
    const expectedSha256 = createHash('sha256').update(archiveBytes).digest('hex');
    fs.writeFileSync(archive, archiveBytes);

    await expect(toolchainEnvironment.verifyWasiSdkArchiveChecksum(archive, expectedSha256)).resolves.toBeUndefined();

    await expect(toolchainEnvironment.verifyWasiSdkArchiveChecksum(archive, '0'.repeat(64))).rejects.toThrow(
        /WASI SDK checksum mismatch/,
    );
});

it.each([
    ['darwin', 'arm64', 'aarch64-macos.tar.gz'],
    ['darwin', 'x64', 'x86_64-macos.tar.gz'],
    ['linux', 'arm64', 'aarch64-linux.tar.gz'],
    ['linux', 'x64', 'x86_64-linux.tar.gz'],
    ['win32', 'arm64', 'aarch64-windows.zip'],
    ['win32', 'x64', 'x86_64-windows.zip'],
])('pins the wasm-tools archive and checksum for %s/%s', (platform, arch, suffix) => {
    const version = tools['wasm-tools'];
    const name = `wasm-tools-${version}-${suffix}`;
    expect(selectWasmToolsAsset(wasmToolsLock, { version, platform, arch })).toEqual({
        name,
        url: `https://github.com/bytecodealliance/wasm-tools/releases/download/v${version}/${name}`,
        digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
});

it('fails clearly for a platform without a pinned wasm-tools binary', () => {
    const version = tools['wasm-tools'];
    expect(() => selectWasmToolsAsset(wasmToolsLock, { version, platform: 'freebsd', arch: 'x64' })).toThrow(
        `no pinned wasm-tools ${version} binary for freebsd/x64`,
    );
});

it('downloads the wasm-tools archive that the lock file pins for the configured version', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-wasm-tools-lock-');
    const name = 'wasm-tools-1.262.0-x86_64-linux.tar.gz';
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));

    await expect(
        setupHermesToolchainEnvironment({
            workspaceRoot,
            env: {},
            platform: 'linux',
            arch: 'x64',
            includeWasiSdk: false,
            includeWitBindgen: false,
            includeWasmTools: true,
            toolchainConfig: { tools: { ...tools, 'wasm-tools': '1.262.0' } },
            wasmToolsLock: {
                repository: 'https://github.com/bytecodealliance/wasm-tools',
                assets: { 'linux/x64': { name, sha256: 'c'.repeat(64) } },
            },
            fetchImpl,
        }),
    ).rejects.toThrow(`Could not download ${name}: HTTP 404`);
    expect(fetchImpl).toHaveBeenCalledWith(
        `https://github.com/bytecodealliance/wasm-tools/releases/download/v1.262.0/${name}`,
    );
});

it('rejects a wasm-tools lock file whose assets belong to another version', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-wasm-tools-stale-lock-');
    const fetchImpl = vi.fn();

    await expect(
        setupHermesToolchainEnvironment({
            workspaceRoot,
            env: {},
            platform: 'linux',
            arch: 'x64',
            includeWasiSdk: false,
            includeWitBindgen: false,
            includeWasmTools: true,
            toolchainConfig: { tools: { ...tools, 'wasm-tools': '1.262.0' } },
            fetchImpl,
        }),
    ).rejects.toThrow(/wasm-tools\.lock\.json must pin wasm-tools 1\.262\.0/);
    expect(fetchImpl).not.toHaveBeenCalled();
});

it('rejects a configured wasm-tools executable with the wrong pinned version', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-wasm-tools-version-');
    const executable = path.join(workspaceRoot, 'wasm-tools');
    writeExecutable(executable, '#!/bin/sh\necho "wasm-tools 1.0.0 (fixture)"\n');

    await expect(
        setupHermesToolchainEnvironment({
            workspaceRoot,
            env: { WASM_TOOLS: executable },
            includeWasiSdk: false,
            includeWitBindgen: false,
            includeWasmTools: true,
        }),
    ).rejects.toThrow(`configured wasm-tools must be wasm-tools ${tools['wasm-tools']}: wasm-tools 1.0.0 (fixture)`);
});

it('does not install a wasm-tools archive whose digest differs from the pinned release', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-wasm-tools-checksum-');
    const fetchImpl = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    await expect(
        setupHermesToolchainEnvironment({
            workspaceRoot,
            env: {},
            platform: 'linux',
            arch: 'x64',
            includeWasiSdk: false,
            includeWitBindgen: false,
            includeWasmTools: true,
            fetchImpl,
        }),
    ).rejects.toThrow(/wasm-tools checksum mismatch/);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fs.readdirSync(path.join(workspaceRoot, '.cache', 'hermes', 'toolchain'))).toEqual([]);
});

it('installs and exposes the pinned wasm-tools binary in the shared cache', async () => {
    const workspaceRoot = temporaryDirectory('static-hermes-wasm-tools-');
    const destination = path.join(
        workspaceRoot,
        '.cache',
        'hermes',
        'toolchain',
        `wasm-tools-${tools['wasm-tools']}`,
        'bin',
        'wasm-tools',
    );
    const installWasmTools = vi.fn(({ destination: executable }) => {
        writeExecutable(executable, `#!/bin/sh\necho "wasm-tools ${tools['wasm-tools']} (fixture)"\n`);
        return executable;
    });

    const environment = await setupHermesToolchainEnvironment({
        workspaceRoot,
        env: {},
        platform: 'darwin',
        arch: 'arm64',
        includeWasiSdk: false,
        includeWitBindgen: false,
        includeWasmTools: true,
        installWasmTools,
    });

    expect(installWasmTools).toHaveBeenCalledWith(
        expect.objectContaining({ version: tools['wasm-tools'], platform: 'darwin', arch: 'arm64', destination }),
    );
    expect(environment.WASM_TOOLS).toBe(destination);
});

it('prepares the selected Hermes toolchain before compiling a component', async () => {
    const env = {};
    const setupEnvironment = vi.fn(async () => ({
        STATIC_HERMES_WASI_SDK_PATH: '/sdk',
        WIT_BINDGEN: '/tools/wit-bindgen',
    }));
    const prepare = vi.fn(async () => {
        expect(env.STATIC_HERMES_WASI_SDK_PATH).toBe('/sdk');
        expect(env.WIT_BINDGEN).toBe('/tools/wit-bindgen');
    });

    await prepareStaticHermesBuild({
        workspaceRoot: '/workspace',
        env,
        setupEnvironment,
        prepare,
    });

    expect(setupEnvironment).toHaveBeenCalledWith({ workspaceRoot: '/workspace', env, includeWasmTools: true });
    expect(prepare).toHaveBeenCalledOnce();
});

it('skips repeated Hermes preparation when the workspace build already prepared it', async () => {
    const env = { PUMPKIN_PLUGINS_STATIC_HERMES_PREPARED: '1' };
    const setupEnvironment = vi.fn(async () => ({ STATIC_HERMES_WASI_SDK_PATH: '/sdk' }));
    const prepare = vi.fn();

    await prepareStaticHermesBuild({
        workspaceRoot: '/workspace',
        env,
        setupEnvironment,
        prepare,
    });

    expect(setupEnvironment).toHaveBeenCalledWith({ workspaceRoot: '/workspace', env, includeWasmTools: true });
    expect(prepare).not.toHaveBeenCalled();
});

function temporaryDirectory(prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryDirs.push(directory);
    return directory;
}

function writeExecutable(file, contents = '#!/bin/sh\nexit 0\n') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    fs.chmodSync(file, 0o755);
}
