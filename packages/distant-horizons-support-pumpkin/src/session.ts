import { ansi } from '@pumpkin-plugins/minecraft-colors';
import type { Logger } from '@pumpkin-plugins/plugin-kit/logger';
import type { Settings } from './config/schema.ts';
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
import { SECTION_SIZE_BLOCKS } from './protocol/constants.ts';
import { reject } from './protocol/messages.ts';
import type { Peer, Peers } from './session/peer.ts';
import { announce, receiveMessage, validate } from './session/protocol.ts';
import { refreshOne, scheduleRefresh } from './session/refresh.ts';
import { type Request, SessionState } from './session/state.ts';
import { describeStatus, type SessionPlaceholderSnapshot, sessionSnapshot } from './session/status.ts';
import { queueResponse, sendQueuedPackets } from './session/transfer.ts';

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
        receiveMessage(this.state, peer, bytes);
    }
    /** Advances sampling and transfers within global per-tick budgets. */
    tick(peers: Peers, serverMspt = 0): void {
        const handlerStarted = this.state.measureNow();
        this.state.ticks++;
        this.pruneTerrainRetries();
        const refreshesAtStart = [...this.state.refreshes.values()];
        for (const [name, client] of this.state.clients) {
            this.state.withSessionPeer(peers, name, (peer) => {
                if (peer.level !== client.level || peer.dimension !== client.dimension) announce(this.state, peer);
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
                    const failure = validate(this.state, peer, client, { ...request, type: 'request' }, false);
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
    private orderedRequests(): Request[] {
        const requests = [...this.state.requests];
        if (requests.length === 0) return requests;
        const offset = this.state.requestCursor % requests.length;
        this.state.requestCursor = (offset + 1) % requests.length;
        return [...requests.slice(offset), ...requests.slice(0, offset)];
    }
    private captureRequestCount(name: string, except: Request): number {
        return this.state.requests.filter(
            (request) =>
                request !== except &&
                request.name === name &&
                (request.builder !== undefined || (request.cacheChecked === true && request.cached === null)),
        ).length;
    }
}

export { sectionKey } from './lod/generation.ts';
