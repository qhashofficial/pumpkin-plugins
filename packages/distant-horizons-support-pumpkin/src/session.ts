import { ansi } from '@pumpkin-plugins/minecraft-colors';
import type { Logger } from '@pumpkin-plugins/plugin-kit/logger';
import type { Settings } from './config/schema.ts';
import { ByteCredit } from './flow/byte-credit.ts';
import { LodBuilder } from './lod/builder.ts';
import type { CachedLod, LodCache } from './lod/cache.ts';
import {
    ForcedLodGeneration,
    type ForcedLodPeer,
    type ForcedLodRecovery,
    type ForcedLodStart,
} from './lod/force-generation.ts';
import { sectionKey, sectionRegion } from './lod/generation.ts';
import { lodLocation } from './lod/location.ts';
import { PLUGIN_NAME } from './name.ts';
import { CHUNK_SIZE_BLOCKS, SECTION_DETAIL, SECTION_SIZE_BLOCKS } from './protocol/constants.ts';
import {
    closeSession,
    DH_VERSION,
    decode,
    levelInit,
    type Message,
    PROTOCOL,
    reject,
    type SessionConfiguration,
    sessionConfig,
} from './protocol/messages.ts';
import type { Peer, Peers } from './session/peer.ts';
import { refreshOne, scheduleRefresh } from './session/refresh.ts';
import { type Client, type Request, SessionState } from './session/state.ts';
import { describeStatus, type SessionPlaceholderSnapshot, sessionSnapshot } from './session/status.ts';
import { cancelQueuedResponse, queueResponse, sendQueuedPackets, setBandwidth } from './session/transfer.ts';

export type { Peer, Peers, PlayerTerrain } from './session/peer.ts';
export type { SessionPlaceholderSnapshot } from './session/status.ts';

const INITIAL_TERRAIN_RETRY_MS = 1000;
const MAX_TERRAIN_RETRY_MS = 30_000;
const TERRAIN_RETRY_RETENTION_MS = 60_000;

/** Runs bounded LOD work, keeping client state separate from short-lived Pumpkin handles. */
export class Sessions {
    private readonly state: SessionState;
    private readonly forcedGeneration: ForcedLodGeneration;
    constructor(settings: Settings, cache: LodCache, log: Logger, now = Date.now, measureNow = Date.now) {
        this.state = new SessionState(settings, cache, log, now, measureNow);
        this.forcedGeneration = new ForcedLodGeneration(cache, log, now, measureNow);
    }
    /** Starts a cache-refreshing capture that takes priority over ordinary DH work. */
    forceGenerate(peer: ForcedLodPeer, blockX: number, blockZ: number, radius = 0): ForcedLodStart {
        return this.forcedGeneration.start(peer, blockX, blockZ, radius);
    }
    /** Backs up and rebuilds one explicitly selected cached section from loaded terrain. */
    forceRecover(peer: ForcedLodPeer, blockX: number, blockZ: number): ForcedLodRecovery {
        return this.forcedGeneration.recover(peer, blockX, blockZ);
    }
    /** Returns scalar live counters without traversing per-client packet queues. */
    placeholderSnapshot(): SessionPlaceholderSnapshot {
        return sessionSnapshot(this.state);
    }
    /** Checks whether an exact current player name has an active DH session. */
    hasClient(name: string): boolean {
        return this.state.clients.has(name);
    }
    /** Accepts and validates a DH packet from a Java player. */
    receive(peer: Peer, bytes: Uint8Array): void {
        let message: Message;
        try {
            message = decode(bytes);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            const clientProtocol = bytes.length >= 2 ? (bytes[0] ?? 0) * 256 + (bytes[1] ?? 0) : PROTOCOL;
            if (clientProtocol !== PROTOCOL) {
                if (!this.state.protocolWarnings.has(peer.name)) {
                    this.state.protocolWarnings.add(peer.name);
                    this.state.log.warn(
                        `${ansi.named.name(peer.name)} uses DH protocol ${ansi.named.number(clientProtocol)}, but this plugin supports protocol ${ansi.named.number(PROTOCOL)} (Distant Horizons ${ansi.named.version(DH_VERSION)}); closed the DH session.`,
                    );
                }
            } else {
                this.state.log.debug(
                    `Closed DH session for ${ansi.named.name(peer.name)} after malformed message: ${reason}.`,
                );
            }
            peer.send(closeSession(`${PLUGIN_NAME}: ${reason}`));
            this.state.endSession(peer.name);
            return;
        }
        if (message.type === 'close') {
            this.state.endSession(peer.name);
            return;
        }
        if (message.type === 'init') {
            if (message.dimension !== peer.dimension) {
                this.state.log.debug(
                    'Ignored DH initialization for a dimension other than the current player dimension.',
                );
                return;
            }
            this.announce(peer);
            return;
        }
        const client = this.state.clients.get(peer.name);
        if (!client) return;
        if (message.type === 'config') {
            const config = this.negotiateConfiguration(message.config);
            client.config = config;
            setBandwidth(this.state, client, config.bandwidthKbps);
            if (config.generationPlan === 3) this.rejectPendingRequestClass(peer, false);
            if (!config.syncEnabled) this.rejectPendingRequestClass(peer, true);
            peer.send(sessionConfig(config));
            this.state.log.debug(
                `${ansi.named.name(peer.name)} configured DH requests: generation ${config.generationPlan === 3 ? 'disabled' : 'enabled'} (${ansi.named.number(config.generationDistance)} chunks, ${ansi.named.number(config.generationRate)}/s), sync ${config.syncEnabled ? 'enabled' : 'disabled'} (${ansi.named.number(config.syncDistance)} chunks, ${ansi.named.number(config.syncRate)}/s), bandwidth ${config.bandwidthKbps === 0 ? 'unlimited' : `${ansi.named.number(config.bandwidthKbps)} KB/s`}.`,
            );
            return;
        }
        if (message.type === 'cancel') {
            const index = this.state.requests.findIndex((r) => r.name === peer.name && r.tracker === message.tracker);
            const request = this.state.requests[index];
            if (request) {
                this.state.cancelled++;
                this.state.log.debug(
                    `Cancelled DH request ${ansi.named.number(request.tracker)} from ${ansi.named.name(peer.name)} for ${lodLocation(request.level, request.section.x, request.section.z)}.`,
                );
                this.state.drop(request);
            } else {
                const response = cancelQueuedResponse(client, message.tracker);
                if (response) {
                    this.state.cancelled++;
                    this.state.log.debug(
                        `Cancelled queued DH response ${ansi.named.number(message.tracker)} from ${ansi.named.name(peer.name)} for ${lodLocation(response.lod.level, response.lod.section.x, response.lod.section.z)}.`,
                    );
                }
            }
            return;
        }
        if (message.type !== 'request') return;
        if (
            this.state.requests.some((r) => r.name === peer.name && r.tracker === message.tracker) ||
            client.packets.some((response) => response.lod.tracker === message.tracker)
        ) {
            this.state.log.debug(
                `Ignored duplicate DH request ${ansi.named.number(message.tracker)} from ${ansi.named.name(peer.name)}.`,
            );
            return;
        }
        const failure = this.validate(peer, client, message);
        if (failure) {
            this.state.rejected++;
            this.state.lastFailure = failure.reason;
            this.state.log.debug(
                `Rejected DH request ${ansi.named.number(message.tracker)} from ${ansi.named.name(peer.name)} for ${lodLocation(peer.level, message.section.x, message.section.z)}: ${failure.reason}.`,
            );
            peer.send(reject(message.tracker, failure.reason, failure.kind));
            return;
        }
        const key = sectionKey(peer.level, message.section.x, message.section.z);
        this.state.log.debug(
            `Queued DH request ${ansi.named.number(message.tracker)} from ${ansi.named.name(peer.name)} for ${lodLocation(peer.level, message.section.x, message.section.z)}.`,
        );
        this.state.requests.push({
            name: peer.name,
            tracker: message.tracker,
            key,
            level: peer.level,
            section: message.section,
            timestamp: message.timestamp,
            revision: this.state.revisions.get(key) ?? 0,
        });
    }
    /** Advances sampling and transfers within global per-tick budgets. */
    tick(peers: Peers, serverMspt = 0): void {
        const handlerStarted = this.state.measureNow();
        this.state.ticks++;
        this.pruneTerrainRetries();
        const refreshesAtStart = [...this.state.refreshes.values()];
        for (const [name, client] of this.state.clients) {
            this.state.withSessionPeer(peers, name, (peer) => {
                if (peer.level !== client.level || peer.dimension !== client.dimension) this.announce(peer);
            });
        }
        const forcedWork = this.forcedGeneration.tick(
            { withPeer: (name, use) => peers.withTerrain(name, use) },
            serverMspt,
        );
        if (forcedWork) {
            this.state.lastBlocksBudget = 0;
            this.state.lastServerMspt = serverMspt;
        }
        let cacheChecks = 0;
        let availabilityChecks = 0;
        let builderStepped = false;
        const blocksBudget = forcedWork
            ? 0
            : this.state.workBudget.next(serverMspt, this.state.settings.blocks_per_tick);
        this.state.lastBlocksBudget = blocksBudget;
        if (!forcedWork) this.state.lastServerMspt = serverMspt;
        for (const request of this.orderedRequests()) {
            if (!this.state.requests.includes(request)) continue;
            const queuedClient = this.state.clients.get(request.name);
            if (!queuedClient) continue;
            this.state.withSessionPeer(peers, request.name, (peer) => {
                try {
                    const client = this.state.clients.get(peer.name);
                    if (!client) return;
                    const failure = this.validate(peer, client, { ...request, type: 'request' }, false);
                    if (failure) {
                        this.state.rejected++;
                        this.state.lastFailure = failure.reason;
                        this.state.log.debug(
                            `Rejected DH request ${ansi.named.number(request.tracker)} from ${ansi.named.name(peer.name)} for ${lodLocation(request.level, request.section.x, request.section.z)}: ${failure.reason}.`,
                        );
                        peer.send(reject(request.tracker, failure.reason, failure.kind));
                        this.state.drop(request);
                        return;
                    }
                    const revision = this.state.revisions.get(request.key) ?? 0;
                    if (revision !== request.revision) {
                        // A block changed in this section; start again from current terrain.
                        request.builder = undefined;
                        request.cacheChecked = false;
                        request.cached = undefined;
                        request.revision = revision;
                    }
                    if (!request.builder) {
                        if (!request.cacheChecked) {
                            if (cacheChecks >= this.state.settings.cached_requests_per_tick) return;
                            request.cached = this.state.cache.get(request.key) ?? null;
                            request.cacheChecked = true;
                            cacheChecks++;
                            this.state.log.debug(
                                `LOD cache ${request.cached ? 'hit' : 'miss'} for ${ansi.named.name(request.name)} at ${lodLocation(request.level, request.section.x, request.section.z)}.`,
                            );
                        }
                        const cached = request.cached ?? undefined;
                        if (cached) {
                            const clientHasNewerData =
                                request.timestamp !== undefined && cached.updated <= request.timestamp;
                            const fresh =
                                this.state.now() - cached.updated < this.state.settings.refresh_seconds * 1000;
                            if (clientHasNewerData || fresh) {
                                this.complete(request, cached, true);
                                return;
                            }
                            scheduleRefresh(this.state, request);
                            this.complete(request, cached, true);
                            return;
                        }
                    }
                    const region = sectionRegion(request.section, peer.terrain);
                    const retry = this.state.terrainRetries.get(request.key);
                    if (retry && this.state.now() < retry.retryAt) return;
                    if (availabilityChecks >= this.state.settings.cached_requests_per_tick) return;
                    availabilityChecks++;
                    let prepared: ReturnType<NonNullable<typeof peer.terrain.prepare>> | undefined;
                    try {
                        prepared = peer.terrain.prepare?.(region);
                    } catch (err) {
                        this.deferTerrain(request, String(err));
                        return;
                    }
                    if (prepared && prepared.status !== 'ready') {
                        this.deferTerrain(
                            request,
                            prepared.status === 'unavailable' ? prepared.reason : 'Terrain preparation is pending',
                        );
                        return;
                    }
                    this.state.terrainRetries.delete(request.key);
                    if (
                        !request.builder &&
                        this.captureRequestCount(request.name, request) >= this.state.settings.requests_per_player
                    ) {
                        request.cacheChecked = false;
                        return;
                    }
                    if (builderStepped || blocksBudget === 0) {
                        if (!request.builder && !request.cached) request.cacheChecked = false;
                        return;
                    }
                    builderStepped = true;
                    request.builder ??= new LodBuilder(request.section, peer.terrain.minY, peer.terrain.height);
                    const sampledBefore = request.builder.samples();
                    const started = this.state.measureNow();
                    const complete = request.builder.step(peer.terrain, blocksBudget);
                    // Charge only sampling to the cost estimate, not the terrain recheck or cache write.
                    this.state.workBudget.observe(
                        request.builder.samples() - sampledBefore,
                        this.state.measureNow() - started,
                    );
                    if (complete) {
                        let stillLoaded: ReturnType<NonNullable<typeof peer.terrain.prepare>> | undefined;
                        try {
                            stillLoaded = peer.terrain.prepare?.(region);
                        } catch (err) {
                            this.deferTerrain(request, String(err));
                            return;
                        }
                        if (stillLoaded && stillLoaded.status !== 'ready') {
                            this.deferTerrain(
                                request,
                                stillLoaded.status === 'unavailable'
                                    ? stillLoaded.reason
                                    : 'Terrain preparation is pending',
                            );
                            return;
                        }
                        const captured = { updated: this.state.now(), data: request.builder.finish(this.state.now()) };
                        this.state.cache.put(request.key, captured);
                        this.state.log.debug(
                            `Captured LOD for ${ansi.named.name(request.name)} at ${lodLocation(request.level, request.section.x, request.section.z)} (${ansi.named.number(captured.data.length)} bytes).`,
                        );
                        this.complete(request, captured);
                    }
                } catch (err) {
                    const reason = String(err);
                    this.state.log.debug(
                        `DH request ${ansi.named.number(request.tracker)} for ${lodLocation(request.level, request.section.x, request.section.z)} failed: ${reason}.`,
                    );
                    this.state.rejected++;
                    this.state.lastFailure = reason;
                    peer.send(
                        reject(
                            request.tracker,
                            'Terrain unavailable or changed; only loaded chunks and cached LODs can be served',
                        ),
                    );
                    this.state.drop(request);
                }
            });
        }
        if (!forcedWork && !builderStepped && blocksBudget > 0)
            builderStepped = refreshOne(this.state, peers, refreshesAtStart, blocksBudget);
        sendQueuedPackets(this.state, peers);
        this.state.lastHandlerMs = Math.max(0, this.state.measureNow() - handlerStarted);
    }
    /** Ends a player's DH protocol session and drops its requests and queued responses; operator captures continue. */
    endSession(name: string): void {
        this.state.endSession(name);
    }
    /** Removes a leaving player and cancels their operator capture. */
    playerLeft(name: string): void {
        this.forcedGeneration.left(name);
        this.state.protocolWarnings.delete(name);
        this.state.removeClient(name);
    }
    /** Invalidates a known changed section so pending captures of it start again. */
    changed(level: string, x: number, z: number): void {
        const key = sectionKey(level, Math.floor(x / SECTION_SIZE_BLOCKS), Math.floor(z / SECTION_SIZE_BLOCKS));
        this.state.cache.remove(key);
        this.forcedGeneration.changed(level, x, z);
        // Running requests and background refreshes share revisions to prevent stale writes.
        if (this.state.requests.some((request) => request.key === key) || this.state.refreshes.has(key))
            this.state.revisions.set(key, (this.state.revisions.get(key) ?? 0) + 1);
    }
    /** Invalidates each affected LOD section once for a bulk world mutation. */
    changedMany(level: string, positions: readonly { x: number; z: number }[]): void {
        const changedSections = new Set<string>();
        for (const position of positions) {
            const key = sectionKey(
                level,
                Math.floor(position.x / SECTION_SIZE_BLOCKS),
                Math.floor(position.z / SECTION_SIZE_BLOCKS),
            );
            if (changedSections.has(key)) continue;
            changedSections.add(key);
            this.changed(level, position.x, position.z);
        }
    }
    /** Describes current queues for the operator command. */
    status(): string {
        return describeStatus(this.state, this.forcedGeneration.status());
    }
    private announce(peer: Peer): void {
        if (peer.terrain.height <= 0) {
            if (!this.state.heightWarnings.has(peer.level)) {
                this.state.heightWarnings.add(peer.level);
                this.state.log.warn(
                    `World ${ansi.named.identifier(peer.level)} (${ansi.named.identifier(peer.dimension)}) has no known height, so DH sessions there are closed. Set height under [worlds."${peer.level}"] in config.toml.`,
                );
            }
            peer.send(closeSession(`${PLUGIN_NAME}: no world height is configured for ${peer.level}.`));
            this.state.removeClient(peer.name);
            return;
        }
        const existing = this.state.clients.get(peer.name);
        if (existing?.level === peer.level && existing.dimension === peer.dimension) {
            peer.send(levelInit(peer.dimension, this.state.settings.server_key, peer.level, this.state.now()));
            peer.send(sessionConfig(existing.config));
            return;
        }
        if (existing) {
            peer.send(closeSession('World changed; restarting the Distant Horizons session.'));
            this.state.removeClient(peer.name);
        }
        const config = this.serverConfiguration();
        this.state.clients.set(peer.name, {
            level: peer.level,
            dimension: peer.dimension,
            config,
            byteCredit: new ByteCredit(config.bandwidthKbps, this.state.now()),
            packets: [],
        });
        peer.send(levelInit(peer.dimension, this.state.settings.server_key, peer.level, this.state.now()));
        peer.send(sessionConfig(config));
        this.state.log.debug(
            `Established DH session with ${ansi.named.name(peer.name)} in ${ansi.named.identifier(peer.dimension)} / ${ansi.named.identifier(peer.level)} (generation distance ${ansi.named.number(config.generationDistance)} chunks at ${ansi.named.number(config.generationRate)}/s, sync distance ${ansi.named.number(config.syncDistance)} chunks at ${ansi.named.number(config.syncRate)}/s).`,
        );
    }
    private complete(request: Request, value: CachedLod, cached = false): void {
        this.state.terrainRetries.delete(request.key);
        const client = this.state.clients.get(request.name);
        if (client) queueResponse(this.state, client, request, value, cached);
        this.state.drop(request);
    }
    private deferTerrain(request: Request, reason: string): void {
        const now = this.state.now();
        const previous = this.state.terrainRetries.get(request.key);
        const attempts = Math.min((previous?.attempts ?? 0) + 1, 32);
        const delay = Math.min(INITIAL_TERRAIN_RETRY_MS * 2 ** Math.min(attempts - 1, 10), MAX_TERRAIN_RETRY_MS);
        request.builder = undefined;
        this.state.terrainRetries.delete(request.key);
        this.state.terrainRetries.set(request.key, { attempts, retryAt: now + delay, updatedAt: now });
        const maximumEntries = Math.max(64, this.state.settings.pending_requests * 4);
        while (this.state.terrainRetries.size > maximumEntries) {
            const oldestKey = this.state.terrainRetries.keys().next().value;
            if (oldestKey === undefined) break;
            this.state.terrainRetries.delete(oldestKey);
        }
        this.state.log.debug(
            `Deferred DH request ${ansi.named.number(request.tracker)} from ${ansi.named.name(request.name)} for ${lodLocation(request.level, request.section.x, request.section.z)}: ${reason}; retrying in ${ansi.named.number(delay)} ms.`,
        );
    }
    private pruneTerrainRetries(): void {
        const now = this.state.now();
        const activeKeys = new Set(this.state.requests.map((request) => request.key));
        for (const [key, retry] of this.state.terrainRetries) {
            if (!activeKeys.has(key) && now - retry.updatedAt >= TERRAIN_RETRY_RETENTION_MS)
                this.state.terrainRetries.delete(key);
        }
    }
    private rejectPendingRequestClass(peer: Peer, sync: boolean): void {
        for (let i = this.state.requests.length - 1; i >= 0; i--) {
            const request = this.state.requests[i];
            if (!request || request.name !== peer.name || (request.timestamp !== undefined) !== sync) continue;
            this.state.rejected++;
            this.state.lastFailure = 'LOD requests disabled by client';
            peer.send(reject(request.tracker, this.state.lastFailure, 2));
            this.state.drop(request);
        }
        for (const key of this.state.revisions.keys()) this.state.clearRevisionIfUnused(key);
    }
    private orderedRequests(): Request[] {
        const requests = [...this.state.requests];
        if (requests.length === 0) return requests;
        const offset = this.state.requestCursor % requests.length;
        this.state.requestCursor = (offset + 1) % requests.length;
        return [...requests.slice(offset), ...requests.slice(0, offset)];
    }
    private pendingWorkCount(): number {
        return (
            this.state.requests.length +
            [...this.state.clients.values()].reduce((count, client) => count + client.packets.length, 0)
        );
    }
    private captureRequestCount(name: string, except: Request): number {
        return this.state.requests.filter(
            (request) =>
                request !== except &&
                request.name === name &&
                (request.builder !== undefined || (request.cacheChecked === true && request.cached === null)),
        ).length;
    }
    private serverConfiguration(): SessionConfiguration {
        return {
            generationPlan: 2,
            generationDistance: this.state.settings.render_distance,
            generationRate: Math.min(
                this.state.settings.generation_requests_per_second,
                this.state.settings.pending_requests,
            ),
            realTimeUpdates: false,
            realTimeDistance: 0,
            syncEnabled: true,
            syncDistance: this.state.settings.render_distance,
            syncRate: Math.min(this.state.settings.sync_requests_per_second, this.state.settings.pending_requests),
            bandwidthKbps: 0,
        };
    }
    private negotiateConfiguration(request: SessionConfiguration): SessionConfiguration {
        const server = this.serverConfiguration();
        return {
            generationPlan: request.generationPlan,
            generationDistance: Math.min(request.generationDistance, server.generationDistance),
            generationRate: Math.min(request.generationRate, server.generationRate),
            realTimeUpdates: false,
            realTimeDistance: 0,
            syncEnabled: request.syncEnabled && server.syncEnabled,
            syncDistance: Math.min(request.syncDistance, server.syncDistance),
            syncRate: Math.min(request.syncRate, server.syncRate),
            bandwidthKbps: request.bandwidthKbps,
        };
    }
    private validate(
        peer: Peer,
        client: Client,
        request: Extract<Message, { type: 'request' }>,
        capacity = true,
    ): { reason: string; kind: number } | undefined {
        if (request.level !== peer.level || client.level !== peer.level) return { reason: 'Wrong world', kind: 2 };
        const sync = request.timestamp !== undefined;
        const enabled = sync ? client.config.syncEnabled : client.config.generationPlan !== 3;
        if (!enabled) return { reason: 'LOD requests disabled by client', kind: 2 };
        if (request.section.detail !== SECTION_DETAIL) return { reason: 'Request block-detail sections', kind: 3 };
        const x = request.section.x * SECTION_SIZE_BLOCKS,
            z = request.section.z * SECTION_SIZE_BLOCKS,
            playerX = Math.floor(peer.x),
            playerZ = Math.floor(peer.z),
            distance = sync ? client.config.syncDistance : client.config.generationDistance,
            rate = sync ? client.config.syncRate : client.config.generationRate,
            range = distance * CHUNK_SIZE_BLOCKS,
            signedEdgeDistance =
                Math.max(
                    Math.abs(x + SECTION_SIZE_BLOCKS / 2 - playerX),
                    Math.abs(z + SECTION_SIZE_BLOCKS / 2 - playerZ),
                ) -
                SECTION_SIZE_BLOCKS / 2;
        if (
            signedEdgeDistance > range ||
            !peer.insideBorder(x, z) ||
            !peer.insideBorder(x + SECTION_SIZE_BLOCKS - 1, z + SECTION_SIZE_BLOCKS - 1)
        )
            return { reason: 'Section outside request range or world border', kind: 1 };
        // Wire rates shape client demand; this queue is the server's combined backpressure bound.
        if (capacity && (rate === 0 || this.pendingWorkCount() >= this.state.settings.pending_requests))
            return { reason: 'LOD request limit reached', kind: 0 };
        return undefined;
    }
}

export { sectionKey } from './lod/generation.ts';
