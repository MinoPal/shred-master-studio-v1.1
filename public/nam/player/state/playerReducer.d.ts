import { Input, IR, Model, PlayerAssets, PlayerTone, PlayerView, Selection } from '../../types';
export type AssetsStatus = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'ready';
    value: PlayerAssets;
} | {
    status: 'error';
    message: string;
};
/**
 * Everything about a player that is not owned by the audio engine. One
 * reducer serves every layout and both cardinalities (single tone, playlist).
 */
export interface PlayerState {
    activeToneId: string;
    /** `compact` layout only. `full` pins it to true; `mini` ignores it. */
    expanded: boolean;
    /**
     * Which body the panel shows; `settings` is Live-only. (The Sample / Plug
     * in and play tab itself is page-wide and lives in the context.)
     */
    view: PlayerView;
    bypassed: boolean;
    assets: Record<string, AssetsStatus>;
    /** Per tone, seeded from its assets' defaults the first time they resolve. */
    selection: Record<string, Selection>;
    /**
     * Tones the user has been on. The first time a tone becomes active its
     * IR/input are re-seeded from the previous tone (preference carry-over);
     * after that it keeps its own choices.
     */
    visited: Record<string, true>;
    /** The tone that was active before the current one (carry-over source). */
    previousToneId: string | null;
}
export type PlayerAction = {
    type: 'tones/sync';
    tones: PlayerTone[];
} | {
    type: 'assets/loading';
    toneId: string;
} | {
    type: 'assets/ready';
    toneId: string;
    assets: PlayerAssets;
} | {
    type: 'assets/error';
    toneId: string;
    message: string;
} | {
    type: 'tone/activate';
    toneId: string;
} | {
    type: 'selection/set';
    toneId: string;
    field: 'model';
    value: Model;
} | {
    type: 'selection/set';
    toneId: string;
    field: 'ir';
    value: IR;
} | {
    type: 'selection/set';
    toneId: string;
    field: 'input';
    value: Input;
} | {
    type: 'selection/set';
    toneId: string;
    field: 'preModel';
    value: Model;
} | {
    type: 'selection/set';
    toneId: string;
    field: 'mix';
    value: number;
} | {
    type: 'bypass/set';
    bypassed: boolean;
} | {
    type: 'expanded/set';
    expanded: boolean;
} | {
    type: 'view/set';
    view: PlayerView;
};
/**
 * Default selection for a set of assets. When `previous` is given (the
 * selection of the tone the user was just on), its IR, input and pre-model
 * carry over if the new assets contain the same URLs: those are user
 * preferences, the tone's own slot is the tone.
 */
export declare function seedSelection(assets: PlayerAssets, previous?: Selection): Selection;
export declare function createInitialState(tones: PlayerTone[], options: {
    defaultToneId?: string;
    defaultExpanded?: boolean;
}): PlayerState;
export declare function playerReducer(state: PlayerState, action: PlayerAction): PlayerState;
