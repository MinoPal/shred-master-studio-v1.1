/**
 * Fetch-and-cache for the two kinds of assets the engine consumes: NAM model
 * files (JSON text) and impulse responses (decoded, with their gain staging
 * measured).
 *
 * Model text is cached per document; IRs per `BaseAudioContext` (a buffer
 * belongs to the context that decoded it). Failed fetches are evicted so a
 * retry re-fetches.
 */
export interface DecodedIr {
    buffer: AudioBuffer;
    /** Make-up gain for unity in-band response (see irGain.ts). */
    gainDb: number;
}
/** Contents of a `.nam` file. */
export declare function fetchModelJson(url: string): Promise<string>;
/** A decoded, gain-staged IR for `context`. */
export declare function fetchIr(context: BaseAudioContext, url: string): Promise<DecodedIr>;
/** Load a URL into an `<audio>` element and wait until it can play. */
export declare function loadAudioElement(element: HTMLAudioElement, url: string): Promise<void>;
