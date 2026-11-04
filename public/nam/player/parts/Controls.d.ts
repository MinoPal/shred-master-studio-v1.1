import React from 'react';
import { PlayerController } from '../hooks/usePlayer';
interface ControlsProps {
    controller: PlayerController;
    disabled?: boolean;
}
/**
 * The tone controls: primary select + on/off toggle, then an inline line
 * with the source (Input select, or live gain) and the companion select.
 * A reverb-like IR gets a mix knob next to its select. Live stacks: gain
 * row + settings gear, device name, then the companion. One code path for
 * demo and live, single tones and playlists.
 */
export declare const Controls: React.FC<ControlsProps>;
export {};
