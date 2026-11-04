import { Dispatch } from 'react';
import { PlayerAssets, PlayerTone } from '../../types';
import { PlayerAction, PlayerState } from '../state/playerReducer';
/**
 * Resolves a tone's assets on demand. Eager assets return immediately; thunks
 * run once per tone (concurrent callers share the in-flight promise) and
 * their outcome is written to state.
 */
export declare function usePlayerAssets(tones: PlayerTone[], state: PlayerState, dispatch: Dispatch<PlayerAction>): {
    resolveAssets: (toneId: string) => Promise<PlayerAssets>;
};
