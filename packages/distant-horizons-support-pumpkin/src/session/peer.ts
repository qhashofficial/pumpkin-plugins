import type { ForcedLodPeer } from '../lod/force-generation.ts';

/** A player snapshot and terrain access, valid only during an adapter callback. */
export interface PlayerTerrain extends ForcedLodPeer {
    dimension: string;
    x: number;
    z: number;
}
/** A Java player that can exchange DH messages, valid only during an adapter callback. */
export interface Peer extends PlayerTerrain {
    send(bytes: Uint8Array): void;
}
/** Obtains fresh host handles for one player, releasing them after the callback. */
export interface Peers {
    /** Returns false when the player is offline or has no Java handle for DH messages. */
    withPeer(name: string, use: (peer: Peer) => void): boolean;
    /** Returns false when the player is offline; Bedrock players get terrain access too. */
    withTerrain(name: string, use: (peer: PlayerTerrain) => void): boolean;
}
