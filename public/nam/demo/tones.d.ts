import { PlayerTone } from '../types';
export declare const demoTone: (modelIndex: number, options?: {
    lazy?: boolean;
    meta?: boolean;
    delayMs?: number;
    fail?: boolean;
}) => PlayerTone;
/**
 * tone3000's gear matrix, as the player sees it. An IR pack of a "space":
 * the tone's IRs are the primary select, pinned to 50 % wet so the mix knob
 * sits beside the toggle, and an amp (or none) runs in front.
 */
export declare const spaceTone: PlayerTone;
export declare const cabTone: PlayerTone;
/** The whole library as one tone, like the v2 default player. */
export declare const libraryTone: PlayerTone;
