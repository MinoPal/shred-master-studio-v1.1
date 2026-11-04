import React from 'react';
import { PlayerController } from '../hooks/usePlayer';
interface AudioSettingsProps {
    controller: PlayerController;
    onClose: () => void;
    disabled?: boolean;
    href?: string;
    linkTarget?: '_blank' | '_self';
}
/**
 * The inline live-setup wizard: microphone permission, then the audio
 * interface (device, input channel, output, monitoring) with a Done button.
 * Lives where the controls do, so it works inside an iframe without a modal.
 */
export declare const AudioSettings: React.FC<AudioSettingsProps>;
export {};
