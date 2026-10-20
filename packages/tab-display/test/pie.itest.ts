import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PIE_RELEASE, resolvePieProvider } from '@pumpkin-plugins/pumpkin-pie-api/testing/provider';
import { builtPluginPath, type PumpkinInstance, startPumpkin } from '@pumpkin-plugins/test-harness';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Build fixtures through the builder's published CLI, as a standalone plugin would.
const buildCli = createRequire(import.meta.url).resolve('@pumpkin-plugins/build/dist/cli.js');
const buildPlugin = (cwd: string) => promisify(execFile)(process.execPath, [buildCli, '--no-update-notifier'], { cwd });

describe('TabDisplay PumpkinPIE integration', () => {
    let server: PumpkinInstance;
    let providerPath: string;

    beforeAll(async () => {
        const fixtureDir = join(process.cwd(), 'test/fixtures/pie-expansion');
        await buildPlugin(fixtureDir);
        providerPath = await resolvePieProvider();
        server = await startPumpkin({
            name: 'tab-display-pie',
            plugins: [
                providerPath,
                builtPluginPath(process.cwd()),
                join(fixtureDir, 'tab-display-pie-expansion-fixture.wasm'),
            ],
        });
        await server.waitForLog(/Loaded.*PumpkinPIE/, 15_000);
        await server.waitForLog(/Loaded TabDisplay/);
        await server.waitForLog(/TabDisplayPIEFixture:.*senderRejected/);
    }, 180_000);

    afterAll(async () => {
        await server?.stop();
        if (server) expect(server.errors()).toEqual([]);
    });

    it('uses the checksum-pinned provider artifact and verifies a real IPC batch and expansion', async () => {
        const digest = createHash('sha256')
            .update(await readFile(providerPath))
            .digest('hex');
        expect(digest).toBe(PIE_RELEASE.sha256);
        expect(server.logs()).toMatch(/"text":"left=server:none"/);
        expect(server.logs()).toMatch(/"text":"right=server:none"/);
        expect(server.logs()).toMatch(/"value":"server:argument-value"/);
        expect(server.logs()).toMatch(/"senderRejected":true/);
        expect(server.errors()).toEqual([]);
    });

    it('negotiates PIE in TabDisplay and unregisters the fixture expansion on stop', async () => {
        await server.waitForLog(/TabDisplay: PumpkinPIE provider is ready/, 10_000);
        const statusFrom = server.lines.length;
        server.command('tabdisplay status');
        await server.waitForLog(/Placeholder provider: ready/, 5_000, statusFrom);

        const stopFrom = server.lines.length;
        server.command('piefixture');
        await server.waitForLog(/TabDisplayPIEFixture: session stopped/, 10_000, stopFrom);

        const parseFrom = server.lines.length;
        server.command('pie parse AFTER_STOP:%tabdisplayfixture_echo%');
        await server.waitForLog(/AFTER_STOP:%tabdisplayfixture_echo%/, 10_000, parseFrom);
        await server.waitForLog(/unresolved: tabdisplayfixture_echo/, 10_000, parseFrom);
        expect(server.errors()).toEqual([]);
    });
});
