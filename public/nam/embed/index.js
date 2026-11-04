import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * postMessage protocol between an embedded player (inside an iframe) and the
 * page hosting it. Shared by `useEmbedBridge` (iframe side) and the host
 * script (`embed.js`). Versioned so either side can evolve independently.
 */
const EMBED_PROTOCOL_VERSION = 1;
const EMBED_SOURCE = 't3k-embed';
const EMBED_HOST_SOURCE = 't3k-embed-host';
function isEmbedMessage(data) {
    return (typeof data === 'object' &&
        data !== null &&
        data.source === EMBED_SOURCE &&
        data.v === EMBED_PROTOCOL_VERSION);
}
function isEmbedHostMessage(data) {
    return (typeof data === 'object' &&
        data !== null &&
        data.source === EMBED_HOST_SOURCE &&
        data.v === EMBED_PROTOCOL_VERSION);
}

const HANDSHAKE_TIMEOUT_MS = 750;
/**
 * Iframe side of the embed protocol. Mount once on the page that renders the
 * embedded player and hand its `onEvent` to `T3kPlayer`.
 */
function useEmbedBridge(options) {
    const localRef = useRef(options?.onEvent);
    localRef.current = options?.onEvent;
    const [hostHasResizer, setHostHasResizer] = useState(null);
    const readySent = useRef(false);
    const post = useCallback((message) => {
        if (typeof window === 'undefined' || window.parent === window)
            return;
        // '*' is deliberate: embeds are public and the host origin is unknown.
        // The host script authenticates us by `event.source`.
        window.parent.postMessage(message, '*');
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined' || window.parent === window)
            return;
        const timer = window.setTimeout(() => setHostHasResizer(prev => (prev === null ? false : prev)), HANDSHAKE_TIMEOUT_MS);
        const onMessage = (e) => {
            if (e.source !== window.parent)
                return;
            if (isEmbedHostMessage(e.data) && e.data.type === 'hello') {
                setHostHasResizer(true);
            }
        };
        window.addEventListener('message', onMessage);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('message', onMessage);
        };
    }, []);
    const onEvent = useCallback((event) => {
        localRef.current?.(event);
        // The player's `ready` has no height; the bridge's own `ready` (sent
        // with the first measured height, below) supersedes it for hosts.
        if (event.type === 'ready')
            return;
        if (event.type === 'resize') {
            if (!readySent.current) {
                readySent.current = true;
                post({
                    source: EMBED_SOURCE,
                    v: EMBED_PROTOCOL_VERSION,
                    type: 'ready',
                    height: event.height,
                });
            }
            else {
                post({
                    source: EMBED_SOURCE,
                    v: EMBED_PROTOCOL_VERSION,
                    type: 'resize',
                    height: event.height,
                });
            }
            return;
        }
        post({
            source: EMBED_SOURCE,
            v: EMBED_PROTOCOL_VERSION,
            type: 'event',
            event,
        });
    }, [post]);
    return { onEvent, hostHasResizer };
}

export { EMBED_HOST_SOURCE, EMBED_PROTOCOL_VERSION, EMBED_SOURCE, isEmbedHostMessage, isEmbedMessage, useEmbedBridge };
//# sourceMappingURL=index.js.map
