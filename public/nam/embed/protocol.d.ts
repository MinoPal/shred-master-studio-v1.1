import type { PlayerEvent } from '../types';
/**
 * postMessage protocol between an embedded player (inside an iframe) and the
 * page hosting it. Shared by `useEmbedBridge` (iframe side) and the host
 * script (`embed.js`). Versioned so either side can evolve independently.
 */
export declare const EMBED_PROTOCOL_VERSION: 1;
export declare const EMBED_SOURCE: "t3k-embed";
export declare const EMBED_HOST_SOURCE: "t3k-embed-host";
/** iframe → host */
export type EmbedMessage = {
    source: typeof EMBED_SOURCE;
    v: 1;
    type: 'ready';
    height: number;
} | {
    source: typeof EMBED_SOURCE;
    v: 1;
    type: 'resize';
    height: number;
} | {
    source: typeof EMBED_SOURCE;
    v: 1;
    type: 'event';
    event: PlayerEvent;
};
/** host → iframe */
export type EmbedHostMessage = {
    source: typeof EMBED_HOST_SOURCE;
    v: 1;
    type: 'hello';
};
export declare function isEmbedMessage(data: unknown): data is EmbedMessage;
export declare function isEmbedHostMessage(data: unknown): data is EmbedHostMessage;
