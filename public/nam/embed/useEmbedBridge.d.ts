import type { PlayerEvent } from '../types';
export interface EmbedBridge {
    /** Pass to `T3kPlayer`'s `onEvent`. Forwards every event to the host. */
    onEvent: (event: PlayerEvent) => void;
    /**
     * `true` once the host script has said hello, `false` after the handshake
     * window closes without one (fixed-height host), `null` while waiting.
     * Use it to hide the expand toggle when the frame can't grow.
     */
    hostHasResizer: boolean | null;
}
/**
 * Iframe side of the embed protocol. Mount once on the page that renders the
 * embedded player and hand its `onEvent` to `T3kPlayer`.
 */
export declare function useEmbedBridge(options?: {
    /** Also receive the events locally (e.g. for analytics inside the frame). */
    onEvent?: (event: PlayerEvent) => void;
}): EmbedBridge;
