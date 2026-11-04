import React from 'react';
import { LiveSetup } from '../hooks/useLiveSetup';
export declare const Privacy: () => React.JSX.Element;
interface MicPermissionProps {
    live: LiveSetup;
    disabled?: boolean;
    /** Tone page to open when the embedding site is the one saying no. */
    href?: string;
    linkTarget?: '_blank' | '_self';
}
/**
 * The "Microphone Access" step of the live wizard: what to click in the
 * browser prompt, the Allow button, and per-browser steps if it's blocked.
 */
export declare const MicPermission: React.FC<MicPermissionProps>;
export {};
