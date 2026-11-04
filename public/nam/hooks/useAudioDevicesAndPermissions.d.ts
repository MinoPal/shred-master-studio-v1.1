import { AudioInputDevice, AudioInputDeviceState, AudioOutputDeviceState, LiveInputConfig, MicrophonePermissionState } from '../types';
type LiveInputUnavailableReason = 'device-disconnected' | 'permission-revoked';
interface UseAudioDevicesAndPermissionsParams {
    /** Apply output routing when the output device changes. */
    applyOutputRouting: (deviceId: string | null) => Promise<void>;
    /** Live input was lost (device unplugged, permission revoked): tear it down. */
    onLiveInputLost: () => void;
    /** Current live input config from audio state (for disconnect detection). */
    liveInputConfig: LiveInputConfig | null;
}
interface UseAudioDevicesAndPermissionsReturn {
    microphonePermission: MicrophonePermissionState;
    audioInputDevices: AudioInputDeviceState;
    audioOutputDevices: AudioOutputDeviceState;
    requestMicrophonePermission: () => Promise<string | null>;
    refreshAudioInputDevices: () => Promise<{
        inputDevices: AudioInputDevice[];
        preferredDeviceId: string | null;
    }>;
    refreshAudioOutputDevices: () => Promise<void>;
    setOutputDevice: (deviceId: string | null) => Promise<void>;
    handleLiveInputUnavailable: (reason: LiveInputUnavailableReason) => void;
}
/**
 * Manages audio device enumeration, output device selection, microphone permissions,
 * and hot-plug detection. Owns all device and permission state.
 *
 * Audio graph side effects are delegated to the caller via narrow callbacks.
 */
export declare function useAudioDevicesAndPermissions({ applyOutputRouting, onLiveInputLost, liveInputConfig, }: UseAudioDevicesAndPermissionsParams): UseAudioDevicesAndPermissionsReturn;
export {};
