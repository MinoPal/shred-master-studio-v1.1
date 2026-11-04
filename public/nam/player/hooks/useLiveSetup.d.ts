import { AudioInputDevice, AudioOutputDevice, ChannelSelection, LiveInputConfig, MicrophonePermissionStatus } from '../../types';
/**
 * Where the Live tab is in getting an instrument connected. One screen per
 * status; the panel renders them inline (no dialog).
 */
export type LiveStatus = 'connect' | 'pending' | 'blocked' | 'connecting' | 'no-device' | 'ready';
export interface LiveSetup {
    status: LiveStatus;
    permission: MicrophonePermissionStatus;
    /** Permission, enumeration or connection error for the current status. */
    error: string | null;
    config: LiveInputConfig | null;
    devices: AudioInputDevice[];
    outputDevices: AudioOutputDevice[];
    selectedOutputDeviceId: string | null;
    /** Ask for permission (if needed), find the interface, connect it. */
    connect: () => Promise<void>;
    refreshDevices: () => Promise<void>;
    selectDevice: (deviceId: string) => Promise<void>;
    selectChannel: (channel: ChannelSelection) => void;
    setOutputDevice: (deviceId: string | null) => Promise<void>;
}
interface Options {
    /** Run the flow (the Live tab is showing). */
    enabled: boolean;
    /**
     * Called after the user picks an interface, so the caller can start
     * monitoring. Not called for the first automatic connection: the browser
     * hands us whatever input it considers default — often the laptop mic —
     * and unmuting that into the speakers is a feedback loop. Choosing a
     * device is the signal that it's safe to hear it.
     */
    onConnected?: () => void | Promise<void>;
}
export declare function useLiveSetup({ enabled, onConnected }: Options): LiveSetup;
export {};
