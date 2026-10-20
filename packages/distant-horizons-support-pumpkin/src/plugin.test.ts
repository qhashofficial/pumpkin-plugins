import type { Context } from 'pumpkin:plugin/context@0.1.0';
import type { Server } from 'pumpkin:plugin/server@0.1.0';
import { MemoryFiles } from '@pumpkin-plugins/plugin-kit/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the host is fake here: Pumpkin's lifecycle base, WIT imports, the data folder and command
// registration. Sessions, the cache, settings and the PumpkinPIE service are the real modules.

interface LoadedPlugin {
    onPluginLoad(context: Context): void;
    onPluginUnload(context: Context): void;
}

type Handler = (server: Server, event?: unknown) => void;

const host = vi.hoisted(() => ({
    plugin: undefined as LoadedPlugin | undefined,
    events: new Map<string, Handler>(),
    commands: undefined as Record<string, (...args: never[]) => string[]> | undefined,
    files: undefined as (MemoryFiles & Disposable) | undefined,
    filesReleased: false,
    logs: [] as { level: string; message: string }[],
    clockNs: 1_000_000_000n,
    ipcReply: undefined as Uint8Array | undefined,
    transitionLogFails: false,
    commandRegistrationFails: false,
}));

vi.mock('@pumpkin-plugins/plugin-kit/plugin', () => ({
    PluginBase: class {
        registerEvent(_ctx: Context, name: string, handler: Handler): void {
            host.events.set(name, handler);
        }
        handleIpcMessage(): Uint8Array {
            return new Uint8Array();
        }
    },
    registerPlugin: (plugin: LoadedPlugin) => {
        host.plugin = plugin;
    },
    handleCommand: vi.fn(),
    handleTask: vi.fn(),
}));
vi.mock('@pumpkin-plugins/pumpkin-api', () => ({}));
vi.mock('@pumpkin-plugins/plugin-kit/data-dir', () => ({ WasiDataDir: { open: () => host.files } }));
vi.mock('@pumpkin-plugins/plugin-kit/register-commands', () => ({
    registerCommands: (_ctx: Context, _tree: unknown, handlers: typeof host.commands) => {
        if (host.commandRegistrationFails) throw new Error('command registration failed');
        host.commands = handlers;
    },
}));
vi.mock('pumpkin:plugin/logging@0.1.0', () => ({
    log: (level: string, message: string) => {
        if (host.transitionLogFails && message.includes('PumpkinPIE provider is')) throw new Error('log unavailable');
        host.logs.push({ level, message });
    },
}));
vi.mock('pumpkin:plugin/scheduler@0.1.0', () => ({}));
vi.mock('pumpkin:plugin/text@0.1.0', () => ({ TextComponent: class {} }));
vi.mock('pumpkin:plugin/world@0.1.0', () => ({ blockStateToInfo: vi.fn() }));
// PumpkinPIE is not installed until a test sets the provider's reply.
vi.mock('pumpkin:plugin/ipc@0.1.0', () => ({
    sendIpcMessage: () =>
        host.ipcReply ? { tag: 'ok', val: host.ipcReply } : { tag: 'err', val: 'plugin not loaded' },
}));
vi.mock('wasi:clocks/monotonic-clock@0.2.3', () => ({ now: () => host.clockNs }));

const context = {} as Context;
const server = { getMspt: () => 10, getPlayerByName: () => undefined } as unknown as Server;

function loadedPlugin(): LoadedPlugin {
    if (!host.plugin) throw new Error('Plugin was not registered');
    return host.plugin;
}

function workerTicks(): number {
    const status = host.commands?.['dhs status']?.().join('\n').replaceAll(/§./g, '');
    const ticks = status?.match(/(\d+) worker tick/)?.[1];
    if (ticks === undefined) throw new Error(`No worker tick count in status: ${status}`);
    return Number(ticks);
}

function tickEnd(): void {
    const handler = host.events.get('server-tick-end-event');
    if (!handler) throw new Error('Tick-end handler was not registered');
    handler(server);
}

describe('DistantHorizonsSupportPumpkin lifecycle', () => {
    beforeEach(async () => {
        vi.resetModules();
        host.plugin = undefined;
        host.events.clear();
        host.commands = undefined;
        host.logs.length = 0;
        host.clockNs = 1_000_000_000n;
        host.ipcReply = undefined;
        host.transitionLogFails = false;
        host.commandRegistrationFails = false;
        host.filesReleased = false;
        host.files = Object.assign(new MemoryFiles(), {
            [Symbol.dispose]: () => {
                host.filesReleased = true;
            },
        });
        await import('./plugin.ts');
    });

    it('keeps processing DH ticks when the PumpkinPIE tick fails', () => {
        const plugin = loadedPlugin();
        plugin.onPluginLoad(context);
        tickEnd();
        expect(workerTicks()).toBe(1);

        // A provider with another protocol answers the next retry, and logging that change throws
        // inside the PumpkinPIE tick. DH sessions use the same clock, so it has to keep working.
        host.ipcReply = new TextEncoder().encode(
            JSON.stringify({
                ok: true,
                ping: { protocol: 1, name: 'PumpkinPIE', version: '9.0.0', placeholders: 0, expansions: 0 },
            }),
        );
        host.transitionLogFails = true;
        host.clockNs += 2_000_000_000n;
        expect(() => tickEnd()).not.toThrow();
        expect(() => tickEnd()).not.toThrow();

        expect(workerTicks()).toBe(3);
        expect(host.logs).toContainEqual({
            level: 'warn',
            message: expect.stringContaining('PumpkinPIE session tick failed: Error: log unavailable'),
        });
        plugin.onPluginUnload(context);
        expect(host.filesReleased).toBe(true);
    });

    it('releases its data folder when loading fails', () => {
        const plugin = loadedPlugin();
        host.commandRegistrationFails = true;

        expect(() => plugin.onPluginLoad(context)).toThrow('command registration failed');
        expect(host.filesReleased).toBe(true);
    });
});
