import React from 'react';
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    children: React.ReactNode;
    leftIcon?: React.ReactNode;
}
/**
 * Pill button. `primary` is filled with `--t3k-primary` (the TONE3000
 * blue), `secondary` outlined. `fullWidth` fills its container; callers
 * cap the container (or pass `max-w-*` in `className`) so a wide panel
 * doesn't get a panel-wide pill.
 */
export declare const Button: React.FC<ButtonProps>;
export {};
