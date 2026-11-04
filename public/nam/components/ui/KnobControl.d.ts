import React from 'react';
interface KnobControlProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    size?: number;
    labelSize?: number;
    labelBottom?: boolean;
    /** Keep the label for assistive tech only. */
    hideLabel?: boolean;
    isDisabled?: boolean;
    /**
     * Formatted value (`+2.0 dB`, `50%`) shown in a tip above the knob while
     * it's being dragged, and briefly after a wheel/keyboard change.
     */
    tip?: string;
}
export declare const KnobControl: React.FC<KnobControlProps>;
export {};
