/**
 * The player's Web Audio graph, framework-free. One per `AudioContext`.
 *
 * The topology is fixed at construction and never rewired at runtime; every
 * state change (bypass, IR on/off, mix, source) is a gain ramp or a buffer
 * swap, which keeps switching click-free and the code free of connect /
 * disconnect bookkeeping:
 *
 *   element ──┐
 *   live ─────┴→ inputMeter ─┬→ preNam → nam ─┬→ convolver → irGain → wet ─┐
 *                            │                │   (irGain: unity in-band, measured on load)
 *                            │                └→ dry ───────────────────────┼→ processed ─┐
 *                            └→ bypass ─────────────────────────────────────────────────┼→ outputGain → outputMeter → sink
 *
 * `preNam` is a second NAM slot ahead of the tone's model (an amp driving a
 * cabinet capture). Both NAM nodes pass audio through while empty.
 *
 * Nothing here touches React. The context wraps this with state.
 */
import { NamEngineAssets, NamModelInfo, NamNode } from '../engine';
import { ChannelSelection, LiveInputConfig } from '../types';
export interface IrSettings {
    /** `null` = no cabinet (dry). */
    url: string | null;
    /**
     * Wet/dry mix in [0, 1]. Omit for the length rule: IRs over
     * `REVERB_SECONDS` long start at 0.5, shorter ones at 1.
     */
    mix?: number;
}
/** What the graph knows about the loaded IR. */
export interface IrStatus {
    url: string | null;
    mix: number;
    /**
     * Not meant to be fully wet: an explicit `mix` below 1, or no explicit mix
     * and a tail longer than `REVERB_SECONDS`. Drives the mix knob.
     */
    reverbLike: boolean;
}
/** The TONE3000 plugin's cab/reverb threshold. */
export declare const REVERB_SECONDS = 1;
export type ModelSlot = 'main' | 'pre';
export declare const dbToLinear: (db: number) => number;
export declare class AudioGraph {
    readonly context: AudioContext;
    readonly nam: NamNode;
    readonly preNam: NamNode;
    readonly inputMeter: AnalyserNode;
    readonly outputMeter: AnalyserNode;
    /** `<audio>` driving demo playback. Not attached to the DOM. */
    readonly element: HTMLAudioElement;
    private readonly elementSource;
    private readonly bypassGain;
    private readonly processedGain;
    private readonly convolver;
    private readonly irGain;
    private readonly wetGain;
    private readonly dryGain;
    private readonly outputGain;
    private sinkDestination;
    private sinkElement;
    private _live;
    private outputEnabled;
    private disposed;
    modelUrl: string | null;
    preModelUrl: string | null;
    ir: IrStatus;
    audioUrl: string | null;
    bypassed: boolean;
    get irUrl(): string | null;
    private constructor();
    /**
     * Create the context, load the wasm engine and build the graph. Call from
     * a user gesture: nothing is fetched before this.
     */
    static create(assets?: NamEngineAssets): Promise<AudioGraph>;
    get live(): LiveInputConfig | null;
    /** Per-channel live meters (post-gain), or `null` when not live. */
    get liveMeters(): AnalyserNode[] | null;
    /**
     * Fetch and load a NAM A2 model into a slot, or empty the slot (`null`)
     * so it passes through. Rendering through the node pauses while it parses
     * (100-300 ms); the output is dipped around the swap so the cut is
     * click-free.
     */
    loadModel(url: string | null, slimSize?: number, slot?: ModelSlot): Promise<NamModelInfo | null>;
    setIr(ir: IrSettings): Promise<void>;
    /** Wet/dry of the loaded IR. No-op without one (dry is already 1). */
    setIrMix(mix: number): void;
    private applyMix;
    setBypass(bypassed: boolean): void;
    /** Open or close the output. Playback transport is separate (see `element`). */
    setOutputEnabled(enabled: boolean): void;
    /** Dip the output for a model swap; returns the restore function. */
    private dipOutput;
    loadAudio(url: string): Promise<void>;
    /**
     * Replace the demo source with a live input. Resolves with the actual
     * device/channel configuration (the browser may clamp the request).
     */
    startLive(deviceId: string | undefined, restore: Partial<Pick<LiveInputConfig, 'channel' | 'gainsDb'>>, onEnded: () => void): Promise<LiveInputConfig>;
    /** Tear down the live input and restore the demo source. */
    stopLive(): void;
    selectLiveChannel(channel: ChannelSelection): void;
    /** Gain for the selected live channel, remembered per channel. */
    setLiveGainDb(gainDb: number): void;
    private sinkId;
    /**
     * Route the output to a device (`null` = system default). Chromium uses
     * `AudioContext.setSinkId`; Firefox/Safari go through a
     * MediaStreamDestination + `<audio>` element.
     */
    setSink(deviceId: string | null): Promise<void>;
    /** Tap the output (pre-meter) for a visualizer. Returns a disconnect. */
    connectVisualizer(analyser: AnalyserNode): () => void;
    dispose(): Promise<void>;
}
