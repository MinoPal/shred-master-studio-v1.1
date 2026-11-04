/**
 * One thing plays at a time, across every player on the page.
 *
 * Inside one `T3kPlayerProvider` that is already true (one engine, one
 * `activePlayerId`). This extends it across providers and across same-origin
 * iframes (a blog post with five embeds): each engine announces when it
 * starts and stops itself when another one announces. Browsers without
 * BroadcastChannel simply don't coordinate.
 */
/** Tell other engines this one is about to play. */
export declare function announcePlayback(): void;
/** Run `fn` when another engine starts playing. Returns an unsubscribe. */
export declare function onOtherPlayback(fn: () => void): () => void;
