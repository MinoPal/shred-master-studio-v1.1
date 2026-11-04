export declare const isFirefox: boolean;
export declare const isSafari: boolean;
export declare const isEdge: boolean;
export declare const isChrome: boolean;
export declare const needsMediaStreamWorkaround: boolean;
/** Running inside an iframe (an embed). */
export declare const isFramed: boolean;
/** `<iframe allow="microphone">`: needed for live input. */
export declare function microphoneAllowedByPolicy(): boolean | null;
/**
 * `<iframe allow="speaker-selection">`: needed to route output to a chosen
 * device (`setSinkId`). Cross-origin frames don't get it by default, so an
 * embed without it keeps the system default output and hides the picker.
 */
export declare function speakerSelectionAllowedByPolicy(): boolean | null;
export type BrowserName = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other';
export declare function getBrowserName(): BrowserName;
