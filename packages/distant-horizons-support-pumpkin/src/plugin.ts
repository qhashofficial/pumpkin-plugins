import type { Context } from 'pumpkin:plugin/context@0.1.0';
import type {
    BlockBreakEventData,
    BlockGrowEventData,
    BlockPlaceEventData,
    BlockSpreadEventData,
    PlayerCustomPayloadEventData,
    PlayerLeaveEventData,
} from 'pumpkin:plugin/event@0.1.0';
import type { IpcMessage, PluginId } from 'pumpkin:plugin/ipc@0.1.0';
import { now as monotonicNow } from 'wasi:clocks/monotonic-clock@0.2.3';
import { ansi } from '@pumpkin-plugins/minecraft-colors';
import { WasiDataDir } from '@pumpkin-plugins/plugin-kit/data-dir';
import { hostLogger } from '@pumpkin-plugins/plugin-kit/host';
import { PluginBase, registerPlugin } from '@pumpkin-plugins/plugin-kit/plugin';
import { registerCommands } from '@pumpkin-plugins/plugin-kit/register-commands';
import { disposeWasiResource } from '@pumpkin-plugins/plugin-kit/wasi-resource';
import { commandHandlers } from './commands/handlers.ts';
import { commands } from './commands/spec.ts';
import { readSettings } from './config/load.ts';
import { info } from './info.ts';
import { LodCache } from './lod/cache.ts';
import { PLUGIN_NAME } from './name.ts';
import { DistantHorizonsPlaceholderService } from './placeholders/service.ts';
import { serverPeers, withPlayer } from './platform/peers.ts';
import { invalidateBlockGrow, invalidateBlockSpread } from './platform/world-mutations.ts';
import { CHANNEL, PROTOCOL } from './protocol/messages.ts';
import { Sessions } from './session.ts';

const logTag = ansi.named.name(PLUGIN_NAME);

/** Serves Distant Horizons requests from loaded chunks and previously captured terrain. */
class DistantHorizonsSupportPumpkin extends PluginBase {
    private dataDir: WasiDataDir | undefined;
    private placeholders: DistantHorizonsPlaceholderService | undefined;

    constructor() {
        super(info, __PLUGIN_VERSION__);
    }
    /** Loads bounded settings and installs request, tick and world-change handlers. */
    protected onPluginLoad(ctx: Context): void {
        const files = WasiDataDir.open();
        if (!files) throw new Error(`${PLUGIN_NAME} requires access to its data folder`);
        this.dataDir = files;
        try {
            this.initializePlugin(ctx, files);
        } catch (error) {
            this.stopPlaceholders();
            this.disposeDataDir();
            throw error;
        }
    }

    private initializePlugin(ctx: Context, files: WasiDataDir): void {
        const settings = readSettings(files, hostLogger);
        const cache = new LodCache(
            files,
            settings.memory_cache_entries,
            settings.disk_cache_entries,
            settings.memory_cache_mb * 1024 * 1024,
        );
        const sessions = new Sessions(settings, cache, hostLogger, Date.now, monotonicMilliseconds);
        this.placeholders = new DistantHorizonsPlaceholderService({
            sessions,
            cache,
            now: monotonicMilliseconds,
            onTransition: (state) =>
                hostLogger.info(`${logTag} PumpkinPIE provider is ${ansi.named.value(state.kind)}`),
        });
        registerCommands(ctx, commands, commandHandlers(sessions, cache, settings));
        this.registerEvent(ctx, 'player-custom-payload-event', (_server, event: PlayerCustomPayloadEventData) => {
            if (event.channel !== CHANNEL) return;
            try {
                withPlayer(event.player, settings, (peer) => sessions.receive(peer, event.data));
            } catch (err) {
                const name = event.player.getName();
                sessions.endSession(name);
                hostLogger.warn(`${logTag} DH message from ${ansi.named.name(name)} failed: ${String(err)}`);
            }
        });
        this.registerEvent(ctx, 'player-leave-event', (_server, event: PlayerLeaveEventData) => {
            sessions.playerLeft(event.player.getName());
        });
        this.registerEvent(ctx, 'server-tick-end-event', (server) => {
            sessions.tick(serverPeers(server, settings), server.getMspt());
            try {
                this.placeholders?.tick();
            } catch (err) {
                hostLogger.warn(`${logTag} PumpkinPIE session tick failed: ${String(err)}`);
            }
        });
        this.registerEvent(ctx, 'block-place-event', (_server, event: BlockPlaceEventData) => {
            if (event.cancelled) return;
            const world = event.player.getWorld();
            try {
                sessions.changed(world.getName(), event.blockPos.x, event.blockPos.z);
            } finally {
                disposeWasiResource(world);
            }
        });
        this.registerEvent(ctx, 'block-break-event', (_server, event: BlockBreakEventData) => {
            if (event.cancelled || !event.player) return;
            const world = event.player.getWorld();
            try {
                sessions.changed(world.getName(), event.blockPos.x, event.blockPos.z);
            } finally {
                disposeWasiResource(world);
            }
        });
        this.registerEvent(ctx, 'block-grow-event', (_server, event: BlockGrowEventData) => {
            invalidateBlockGrow(sessions, event);
        });
        this.registerEvent(ctx, 'block-spread-event', (_server, event: BlockSpreadEventData) => {
            invalidateBlockSpread(sessions, event);
        });
        hostLogger.info(
            `${logTag} serving DH protocol ${ansi.named.number(PROTOCOL)} from loaded chunks and cached terrain. This plugin cannot load saved chunks or request normal terrain generation; see the README's Compatibility and terrain section.`,
        );
    }

    protected override onPluginUnload(_ctx: Context): void {
        this.stopPlaceholders();
        this.disposeDataDir();
    }

    /** Releases the local PumpkinPIE session before the plugin's data directory. */
    private stopPlaceholders(): void {
        const placeholders = this.placeholders;
        this.placeholders = undefined;
        try {
            placeholders?.stop();
        } catch (err) {
            hostLogger.warn(`${logTag} failed to stop PumpkinPIE session: ${String(err)}`);
        }
    }

    /** Routes authenticated provider callbacks to the active expansion router. */
    override handleIpcMessage(sender: PluginId, message: IpcMessage): IpcMessage {
        const placeholders = this.placeholders;
        return placeholders === undefined
            ? super.handleIpcMessage(sender, message)
            : placeholders.handleIpcMessage(sender, message);
    }

    private disposeDataDir(): void {
        const files = this.dataDir;
        this.dataDir = undefined;
        files?.[Symbol.dispose]();
    }
}

function monotonicMilliseconds(): number {
    return Number(monotonicNow()) / 1_000_000;
}

registerPlugin(new DistantHorizonsSupportPumpkin());

export { handleCommand, handleTask } from '@pumpkin-plugins/plugin-kit/plugin';
export * from '@pumpkin-plugins/pumpkin-api';
