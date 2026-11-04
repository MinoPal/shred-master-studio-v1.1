import React from 'react';
export interface SelectOption {
    value: string;
    label: string;
}
interface NativeSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void | Promise<void>;
    /** Small caption above the control (`field`) or before it (`inline`). */
    label?: string;
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
    disabled?: boolean;
    /**
     * `field`: a full-width bordered control.
     * `inline`: link-styled, sized to its current option, for "Cab: Mesa ▾"
     * lines. Both are the same native `<select>` underneath.
     */
    variant?: 'field' | 'inline';
    className?: string;
}
/**
 * A styled native `<select>`. The popup is drawn by the OS, so it escapes
 * iframe bounds and needs no outside-click, keyboard, or portal handling.
 */
export declare const NativeSelect: React.FC<NativeSelectProps>;
export {};
