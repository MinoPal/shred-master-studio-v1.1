import { PlayerTone, PlayerView, PreviewMode, Selection, SourceMode, T3kPlayerProps, PlayerLayout } from '../../types';
import { AssetsStatus } from '../state/playerReducer';
import { LiveSetup } from './useLiveSetup';
export interface SelectOption {
    label: string;
    value: string;
}
/** Captions for the controls, resolved from `assets.labels` + `previewMode`. */
export interface ControlLabels {
    /** The select that is the tone (model, or IR for IR packs). */
    primary: string;
    /** The companion select (cab / reverb for models, amp for IRs and cabs). */
    secondary: string;
    input: string;
}
/** Which asset list a select is bound to. */
export type SlotField = 'model' | 'ir' | 'preModel';
/** A select over one asset slot: options, current value, setter. */
export interface SlotControl {
    field: SlotField;
    options: SelectOption[];
    value: string;
    set: (value: string) => Promise<void>;
}
/** Everything a layout needs. Layouts are pure renderers over this. */
export interface PlayerController {
    playerId: string;
    tones: PlayerTone[];
    activeToneId: string;
    activeIndex: number;
    activeTone: PlayerTone;
    activeAssets: AssetsStatus;
    selection: Selection | null;
    previewMode: PreviewMode;
    labels: ControlLabels;
    /** The select that is the tone. */
    primary: SlotControl;
    /** The one select shown beside it (see `PlayerAssets`). */
    companion: SlotControl;
    /** Wet/dry of the current IR, and whether it deserves a knob. */
    mix: {
        value: number;
        show: boolean;
        set: (mix: number) => void;
    };
    isActive: boolean;
    isTonePlaying: (toneId: string) => boolean;
    isBusy: boolean;
    busyToneId: string | null;
    currentTime: number;
    duration: number;
    error: string | null;
    expanded: boolean;
    view: PlayerView;
    bypassed: boolean;
    sourceMode: SourceMode;
    live: LiveSetup;
    modelOptions: SelectOption[];
    irOptions: SelectOption[];
    inputOptions: SelectOption[];
    preModelOptions: SelectOption[];
    togglePlay: (toneId?: string) => Promise<void>;
    activateTone: (toneId: string) => Promise<void>;
    step: (delta: 1 | -1) => Promise<void>;
    skipToStart: () => void;
    toggleBypass: () => void;
    setExpanded: (expanded: boolean) => void;
    setView: (view: PlayerView) => void;
    setModel: (url: string) => Promise<void>;
    setIr: (url: string) => Promise<void>;
    setInput: (url: string) => Promise<void>;
    setPreModel: (url: string) => Promise<void>;
    setSourceMode: (mode: SourceMode) => Promise<void>;
    prepareTone: (toneId: string) => Promise<void>;
    visualizerRef: React.RefObject<HTMLCanvasElement>;
    canvasWrapperRef: React.RefObject<HTMLDivElement>;
}
type Options = Pick<T3kPlayerProps, 'tones' | 'id' | 'defaultToneId' | 'defaultExpanded' | 'slimSize' | 'onEvent'> & {
    live: boolean;
    layout: PlayerLayout;
};
export declare function usePlayer(options: Options): PlayerController;
export {};
