import React, { ReactNode } from 'react';
import { AudioGraph } from '../audio/AudioGraph';
import type { NamEngineAssets } from '../engine';
import { AudioInputDevice, AudioInputDeviceState, AudioOutputDeviceState, AudioState, ChannelSelection, IR, MicrophonePermissionState, SourceMode } from '../types';
/**
 * One engine per provider, shared by every player beneath it.
 *
 * Nothing is created until `init()` runs from a user gesture: no
 * AudioContext, no wasm fetch, no model or IR download. Players call
 * `init()` then `sync()` with what they want to hear; the context diffs the
 * request against the graph and only loads what changed.
 */
export interface EngineSettings {
    modelUrl: string | null;
    /** Second NAM ahead of the model. Omit / `null` for pass-through. */
    preModelUrl?: string | null;
    slimSize?: number;
    ir: IR;
    /** Overrides `ir.mix` (and the length rule) when set. */
    mix?: number;
    bypassed: boolean;
}
export interface T3kPlayerContextType {
    audioState: AudioState;
    microphonePermission: MicrophonePermissionState;
    audioInputDevices: AudioInputDeviceState;
    audioOutputDevices: AudioOutputDeviceState;
    /**
     * Sample vs live, shared by every player under the provider: switching one
     * player to "Plug in and play" switches the page. `owner` is the player
     * that made the switch — the one that runs the connect flow.
     */
    source: {
        mode: SourceMode;
        owner: string | null;
    };
    setSourceMode: (mode: SourceMode, playerId: string) => void;
    /** The graph once `init()` has resolved. For meter and visualizer taps. */
    getGraph: () => AudioGraph | null;
    /** Create the engine (idempotent). Call from a user gesture. */
    init: () => Promise<AudioGraph>;
    /** Make the engine match `settings`, loading only what differs. */
    sync: (settings: EngineSettings) => Promise<void>;
    loadAudio: (url: string) => Promise<void>;
    setBypass: (bypassed: boolean) => void;
    /** Wet/dry of the loaded IR, live. */
    setIrMix: (mix: number) => void;
    /** Start (claiming the engine for `playerId`) or stop. */
    setPlaying: {
        (playing: true, playerId: string): void;
        (playing: false): void;
    };
    /** Stop and rewind. Called by a player that unmounts while it owns playback. */
    release: () => void;
    connectVisualizer: (analyser: AnalyserNode) => () => void;
    startLiveInput: (deviceId?: string) => Promise<void>;
    reconnectLiveInput: () => Promise<void>;
    stopLiveInput: () => void;
    selectLiveInputChannel: (channel: ChannelSelection) => void;
    setLiveInputGain: (gainDb: number) => void;
    requestMicrophonePermission: () => Promise<string | null>;
    refreshAudioInputDevices: () => Promise<{
        inputDevices: AudioInputDevice[];
        preferredDeviceId: string | null;
    }>;
    refreshAudioOutputDevices: () => Promise<void>;
    setOutputDevice: (deviceId: string | null) => Promise<void>;
}
export declare function T3kPlayerContextProvider({ children, engineAssets, }: {
    children: ReactNode;
    /**
     * Where to load the engine assets (nam-worklet.js, nam-engine.wasm) from.
     * Defaults to URLs relative to this package's module.
     */
    engineAssets?: NamEngineAssets;
}): React.JSX.Element;
export declare function useT3kPlayerContext(): T3kPlayerContextType;
