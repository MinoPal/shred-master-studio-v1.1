import React, { useState, useCallback, useEffect, createContext, useRef, useMemo, useContext, useId, useReducer, forwardRef, createElement } from 'react';
import { NamEngine } from './engine/index.js';
export { NamNode, NamNodePool } from './engine/index.js';
export { EMBED_PROTOCOL_VERSION, isEmbedHostMessage, isEmbedMessage, useEmbedBridge } from './embed/index.js';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
const isFirefox = ua.includes('firefox');
const isSafari = ua.includes('safari') &&
    !ua.includes('chrome') &&
    !ua.includes('firefox') &&
    !ua.includes('edg');
const isEdge = ua.includes('edg');
const isChrome = (ua.includes('chrome') || ua.includes('crios')) && !ua.includes('edg');
const needsMediaStreamWorkaround = isFirefox || isSafari;
/** Running inside an iframe (an embed). */
const isFramed = typeof window !== 'undefined' && window.self !== window.top;
/**
 * Whether the page embedding us grants this frame a permissions-policy
 * feature (`<iframe allow="…">`). `null` when the browser doesn't expose the
 * policy (Firefox, Safari) or doesn't know the feature name — `allowsFeature`
 * answers `false` for names it has never heard of, which must not read as a
 * denial. A real denial surfaces as a `NotAllowedError` from the API itself.
 */
function featureAllowedByPolicy(feature) {
    if (typeof document === 'undefined')
        return null;
    const doc = document;
    const policy = doc.permissionsPolicy ?? doc.featurePolicy;
    if (!policy?.allowsFeature)
        return null;
    try {
        if (policy.features && !policy.features().includes(feature))
            return null;
        return policy.allowsFeature(feature);
    }
    catch {
        return null;
    }
}
/** `<iframe allow="microphone">`: needed for live input. */
function microphoneAllowedByPolicy() {
    return featureAllowedByPolicy('microphone');
}
/**
 * `<iframe allow="speaker-selection">`: needed to route output to a chosen
 * device (`setSinkId`). Cross-origin frames don't get it by default, so an
 * embed without it keeps the system default output and hides the picker.
 */
function speakerSelectionAllowedByPolicy() {
    return featureAllowedByPolicy('speaker-selection');
}
function getBrowserName() {
    if (isEdge)
        return 'edge';
    if (isFirefox)
        return 'firefox';
    if (isSafari)
        return 'safari';
    if (isChrome)
        return 'chrome';
    return 'other';
}

/**
 * Cabinet IR gain staging: unity in-band gain.
 *
 * An IR file's absolute level is an accident of capture and export, so the
 * kernel is scaled so its mean power response over the guitar band
 * (100 Hz – 5 kHz, log-spaced, i.e. pink-weighted) is 0 dB. A cab then
 * leaves the loudness of the normalized NAM model essentially unchanged:
 * model-only and model → IR sit at the same level, and the engine's -18 dB
 * loudness target holds through the whole chain. Same convention as the
 * TONE3000 pedal; the ConvolverNode's own `normalize` is switched off.
 *
 * Measured directly: a 64-point DFT of the kernel at log-spaced frequencies.
 * For a 4096-tap cab that is ~256K MACs, a few ms once per IR load. Stereo
 * IRs are measured on their left channel.
 */
const BAND_LO_HZ = 100;
const BAND_HI_HZ = 5000;
const BAND_POINTS = 64;
/**
 * Sanity clamps. Boosting a quiet IR more than +24 dB is a broken file; a
 * dense multi-second reverb peaked at 0 dBFS legitimately needs -30 to
 * -40 dB, so the floor is -48 dB rather than symmetric.
 */
const MAX_BOOST_DB = 24;
const MAX_CUT_DB = 48;
function irInBandGainDb(buffer) {
    const taps = buffer.getChannelData(0);
    const n = taps.length;
    const sampleRate = buffer.sampleRate;
    let acc = 0;
    for (let k = 0; k < BAND_POINTS; k++) {
        const f = BAND_LO_HZ * Math.pow(BAND_HI_HZ / BAND_LO_HZ, k / (BAND_POINTS - 1));
        const w = (2 * Math.PI * f) / sampleRate;
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        // Recurrence for cos(w·i), sin(w·i): no per-tap transcendental.
        let c = 1;
        let s = 0;
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
            const x = taps[i];
            re += x * c;
            im += x * s;
            const c2 = c * cw - s * sw;
            s = s * cw + c * sw;
            c = c2;
        }
        acc += re * re + im * im;
    }
    const meanH2 = acc / BAND_POINTS;
    if (!(meanH2 > 0) || !Number.isFinite(meanH2))
        return 0;
    const db = -10 * Math.log10(meanH2);
    return Math.max(-MAX_CUT_DB, Math.min(MAX_BOOST_DB, db));
}

const modelText = new Map();
const irs$1 = new WeakMap();
async function fetchOk(url, what) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${what} (${response.status}): ${url}`);
    }
    return response;
}
/** Contents of a `.nam` file. */
function fetchModelJson(url) {
    let promise = modelText.get(url);
    if (!promise) {
        promise = fetchOk(url, 'model').then(r => r.text());
        modelText.set(url, promise);
        promise.catch(() => modelText.delete(url));
    }
    return promise;
}
/** A decoded, gain-staged IR for `context`. */
function fetchIr(context, url) {
    let byUrl = irs$1.get(context);
    if (!byUrl) {
        byUrl = new Map();
        irs$1.set(context, byUrl);
    }
    let promise = byUrl.get(url);
    if (!promise) {
        promise = fetchOk(url, 'IR')
            .then(r => r.arrayBuffer())
            .then(bytes => context.decodeAudioData(bytes))
            .then(buffer => ({ buffer, gainDb: irInBandGainDb(buffer) }));
        byUrl.set(url, promise);
        promise.catch(() => byUrl.delete(url));
    }
    return promise;
}
/** Load a URL into an `<audio>` element and wait until it can play. */
function loadAudioElement(element, url) {
    return new Promise((resolve, reject) => {
        const done = () => {
            element.removeEventListener('loadeddata', done);
            element.removeEventListener('error', fail);
            resolve();
        };
        const fail = () => {
            element.removeEventListener('loadeddata', done);
            element.removeEventListener('error', fail);
            reject(new Error(`Failed to load audio: ${url}`));
        };
        element.addEventListener('loadeddata', done);
        element.addEventListener('error', fail);
        element.src = url;
        element.load();
    });
}

/**
 * The player's Web Audio graph, framework-free. One per `AudioContext`.
 *
 * The topology is fixed at construction and never rewired at runtime; every
 * state change (bypass, IR on/off, mix, source) is a gain ramp or a buffer
 * swap, which keeps switching click-free and the code free of connect /
 * disconnect bookkeeping:
 *
 *   element ──┐
 *   live ─────┴→ inputMeter ─┬→ preNam → nam ─┬→ convolver → irGain → wet ─┐
 *                            │                │   (irGain: unity in-band, measured on load)
 *                            │                └→ dry ───────────────────────┼→ processed ─┐
 *                            └→ bypass ─────────────────────────────────────────────────┼→ outputGain → outputMeter → sink
 *
 * `preNam` is a second NAM slot ahead of the tone's model (an amp driving a
 * cabinet capture). Both NAM nodes pass audio through while empty.
 *
 * Nothing here touches React. The context wraps this with state.
 */
/** The TONE3000 plugin's cab/reverb threshold. */
const REVERB_SECONDS = 1;
const REVERB_DEFAULT_MIX = 0.5;
const METER_FFT = 2048;
const RAMP_FAST = 0.005;
const RAMP = 0.01;
const RAMP_SLOW = 0.02;
const dbToLinear = (db) => Math.pow(10, db / 20);
/** Most channels we ask the browser for on a live input. */
const MAX_LIVE_CHANNELS = 32;
class AudioGraph {
    get irUrl() {
        return this.ir.url;
    }
    constructor(context, nam, preNam) {
        this.context = context;
        this.nam = nam;
        this.preNam = preNam;
        this.sinkDestination = null;
        this.sinkElement = null;
        this._live = null;
        this.outputEnabled = false;
        this.disposed = false;
        this.modelUrl = null;
        this.preModelUrl = null;
        this.ir = { url: null, mix: 1, reverbLike: false };
        this.audioUrl = null;
        this.bypassed = false;
        // ---- Output device -------------------------------------------------------
        this.sinkId = null;
        const c = context;
        this.element = new Audio();
        this.element.crossOrigin = 'anonymous';
        this.elementSource = c.createMediaElementSource(this.element);
        this.inputMeter = new AnalyserNode(c, { fftSize: METER_FFT });
        this.outputMeter = new AnalyserNode(c, { fftSize: METER_FFT });
        this.bypassGain = new GainNode(c, { gain: 0 });
        this.processedGain = new GainNode(c, { gain: 1 });
        // Gain staging is ours (unity in-band, see irGain.ts), not the browser's.
        this.convolver = new ConvolverNode(c, { disableNormalization: true });
        this.irGain = new GainNode(c, { gain: 1 });
        this.wetGain = new GainNode(c, { gain: 0 });
        this.dryGain = new GainNode(c, { gain: 1 });
        this.outputGain = new GainNode(c, { gain: 0 });
        this.elementSource.connect(this.inputMeter);
        this.inputMeter.connect(preNam);
        preNam.connect(nam);
        this.inputMeter.connect(this.bypassGain);
        nam.connect(this.convolver);
        this.convolver.connect(this.irGain);
        this.irGain.connect(this.wetGain);
        this.wetGain.connect(this.processedGain);
        nam.connect(this.dryGain);
        this.dryGain.connect(this.processedGain);
        this.processedGain.connect(this.outputGain);
        this.bypassGain.connect(this.outputGain);
        this.outputGain.connect(this.outputMeter);
        this.outputMeter.connect(c.destination);
    }
    /**
     * Create the context, load the wasm engine and build the graph. Call from
     * a user gesture: nothing is fetched before this.
     */
    static async create(assets) {
        const context = new AudioContext({ latencyHint: 'interactive' });
        try {
            const engine = await NamEngine.attach(context, assets);
            const [nam, preNam] = await Promise.all([
                engine.createNode(),
                engine.createNode(),
            ]);
            return new AudioGraph(context, nam, preNam);
        }
        catch (error) {
            void context.close();
            throw error;
        }
    }
    get live() {
        return this._live?.state ?? null;
    }
    /** Per-channel live meters (post-gain), or `null` when not live. */
    get liveMeters() {
        return this._live?.meters ?? null;
    }
    // ---- Models --------------------------------------------------------------
    /**
     * Fetch and load a NAM A2 model into a slot, or empty the slot (`null`)
     * so it passes through. Rendering through the node pauses while it parses
     * (100-300 ms); the output is dipped around the swap so the cut is
     * click-free.
     */
    async loadModel(url, slimSize, slot = 'main') {
        const node = slot === 'pre' ? this.preNam : this.nam;
        const setUrl = (value) => {
            if (slot === 'pre')
                this.preModelUrl = value;
            else
                this.modelUrl = value;
        };
        if (url === null) {
            const restore = this.dipOutput();
            try {
                await node.unloadModel();
                setUrl(null);
                return null;
            }
            finally {
                restore();
            }
        }
        const json = await fetchModelJson(url);
        const restore = this.dipOutput();
        try {
            const info = await node.loadModel(json, { slimSize });
            if (!info.slimmable) {
                await node.unloadModel();
                setUrl(null);
                throw new Error(`Not a NAM A2 model: ${url}. The player only loads SlimmableContainer (A2) files.`);
            }
            setUrl(url);
            return info;
        }
        finally {
            restore();
        }
    }
    // ---- IR ------------------------------------------------------------------
    async setIr(ir) {
        if (ir.url === null) {
            this.applyMix(0);
            this.convolver.buffer = null;
            this.ir = { url: null, mix: 1, reverbLike: false };
            return;
        }
        const { buffer, gainDb } = await fetchIr(this.context, ir.url);
        if (this.disposed)
            return;
        const reverbLike = ir.mix !== undefined ? ir.mix < 1 : buffer.duration > REVERB_SECONDS;
        const mix = ir.mix ?? (reverbLike ? REVERB_DEFAULT_MIX : 1);
        this.convolver.buffer = buffer;
        this.irGain.gain.setTargetAtTime(dbToLinear(gainDb), this.context.currentTime, RAMP);
        this.applyMix(mix);
        this.ir = { url: ir.url, mix, reverbLike };
    }
    /** Wet/dry of the loaded IR. No-op without one (dry is already 1). */
    setIrMix(mix) {
        if (this.ir.url === null)
            return;
        const clamped = Math.max(0, Math.min(1, mix));
        this.applyMix(clamped);
        this.ir = { ...this.ir, mix: clamped };
    }
    applyMix(mix) {
        const t = this.context.currentTime;
        this.wetGain.gain.setTargetAtTime(mix, t, RAMP);
        this.dryGain.gain.setTargetAtTime(1 - mix, t, RAMP);
    }
    // ---- Bypass / output -----------------------------------------------------
    setBypass(bypassed) {
        if (this.bypassed === bypassed)
            return;
        this.bypassed = bypassed;
        const t = this.context.currentTime;
        this.bypassGain.gain.setTargetAtTime(bypassed ? 1 : 0, t, RAMP_FAST);
        this.processedGain.gain.setTargetAtTime(bypassed ? 0 : 1, t, RAMP_FAST);
    }
    /** Open or close the output. Playback transport is separate (see `element`). */
    setOutputEnabled(enabled) {
        this.outputEnabled = enabled;
        this.outputGain.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, RAMP);
    }
    /** Dip the output for a model swap; returns the restore function. */
    dipOutput() {
        if (!this.outputEnabled || this.context.state !== 'running') {
            return () => { };
        }
        this.outputGain.gain.setTargetAtTime(0, this.context.currentTime, RAMP_FAST);
        return () => {
            if (this.outputEnabled) {
                this.outputGain.gain.setTargetAtTime(1, this.context.currentTime, RAMP);
            }
        };
    }
    // ---- Demo source ---------------------------------------------------------
    async loadAudio(url) {
        if (this.audioUrl === url)
            return;
        await loadAudioElement(this.element, url);
        this.audioUrl = url;
    }
    // ---- Live source ---------------------------------------------------------
    /**
     * Replace the demo source with a live input. Resolves with the actual
     * device/channel configuration (the browser may clamp the request).
     */
    async startLive(deviceId, restore, onEnded) {
        this.stopLive();
        // Ask for every channel the interface has; the browser clamps to what it
        // supports (Chrome and Safari usually stop at 2, Firefox hands over the
        // device's channels) and `getSettings()` says what we got.
        const constraints = {
            channelCount: { ideal: MAX_LIVE_CHANNELS },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        };
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    ...constraints,
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                },
            });
        }
        catch (error) {
            if (deviceId &&
                error instanceof DOMException &&
                error.name === 'OverconstrainedError') {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: constraints,
                });
            }
            else {
                throw error;
            }
        }
        if (this.disposed) {
            stream.getTracks().forEach(t => t.stop());
            throw new Error('AudioGraph disposed');
        }
        const track = stream.getAudioTracks()[0];
        const settings = track.getSettings();
        const channelCount = settings.channelCount ?? 1;
        const gainsDb = Array.from({ length: channelCount }, (_, i) => restore.gainsDb?.[i] ?? 0);
        const channel = restore.channel !== undefined && restore.channel < channelCount
            ? restore.channel
            : 0;
        // Only a device that goes away is "ended"; our own stopLive() detaches
        // this before stopping the track.
        const handleEnded = () => {
            if (this._live?.stream === stream)
                onEnded();
        };
        track.addEventListener('ended', handleEnded);
        const c = this.context;
        const source = c.createMediaStreamSource(stream);
        const gain = new GainNode(c, { gain: dbToLinear(gainsDb[channel]) });
        const splitter = c.createChannelSplitter(channelCount);
        const merger = c.createChannelMerger(1);
        const meters = Array.from({ length: channelCount }, () => new AnalyserNode(c, { fftSize: METER_FFT }));
        source.connect(gain);
        gain.connect(splitter);
        meters.forEach((meter, i) => splitter.connect(meter, i));
        splitter.connect(merger, channel, 0);
        merger.connect(this.inputMeter);
        this.elementSource.disconnect(this.inputMeter);
        this._live = {
            stream,
            handleEnded,
            source,
            gain,
            splitter,
            merger,
            meters,
            state: {
                deviceId: settings.deviceId ?? deviceId ?? '',
                channelCount,
                channel,
                gainsDb,
            },
        };
        if (c.state === 'suspended')
            await c.resume();
        // Re-apply the sink: changing sources resets the workaround element.
        // Routing is a nicety; if it fails, live still runs on the default output.
        try {
            await this.setSink(this.sinkId);
        }
        catch (error) {
            console.warn('[Audio] Could not re-apply output device:', error);
        }
        return this._live.state;
    }
    /** Tear down the live input and restore the demo source. */
    stopLive() {
        const live = this._live;
        if (!live)
            return;
        this._live = null;
        live.stream.getTracks().forEach(t => {
            t.removeEventListener('ended', live.handleEnded);
            t.stop();
        });
        live.source.disconnect();
        live.gain.disconnect();
        live.splitter.disconnect();
        live.merger.disconnect();
        live.meters.forEach(m => m.disconnect());
        this.elementSource.connect(this.inputMeter);
    }
    selectLiveChannel(channel) {
        const live = this._live;
        if (!live || channel < 0 || channel >= live.state.channelCount)
            return;
        live.splitter.disconnect(live.merger);
        live.splitter.connect(live.merger, channel, 0);
        live.state = { ...live.state, channel };
        live.gain.gain.setTargetAtTime(dbToLinear(live.state.gainsDb[channel]), this.context.currentTime, RAMP_SLOW);
    }
    /** Gain for the selected live channel, remembered per channel. */
    setLiveGainDb(gainDb) {
        const live = this._live;
        if (!live)
            return;
        const gainsDb = [...live.state.gainsDb];
        gainsDb[live.state.channel] = gainDb;
        live.state = { ...live.state, gainsDb };
        live.gain.gain.setTargetAtTime(dbToLinear(gainDb), this.context.currentTime, RAMP_SLOW);
    }
    /**
     * Route the output to a device (`null` = system default). Chromium uses
     * `AudioContext.setSinkId`; Firefox/Safari go through a
     * MediaStreamDestination + `<audio>` element.
     */
    async setSink(deviceId) {
        const previous = this.sinkId;
        this.sinkId = deviceId;
        if (!needsMediaStreamWorkaround) {
            // Default → default is a no-op. Skipping it matters inside a
            // cross-origin frame: `setSinkId('')` still needs the
            // `speaker-selection` permissions policy there and would reject,
            // which used to take live mode down with it on every start.
            if (!deviceId && !previous)
                return;
            const ctx = this.context;
            if (typeof ctx.setSinkId === 'function') {
                await ctx.setSinkId(deviceId ?? '');
            }
            return;
        }
        if (this.sinkElement) {
            this.sinkElement.pause();
            this.sinkElement.srcObject = null;
            this.sinkElement = null;
        }
        if (this.sinkDestination) {
            this.sinkDestination.disconnect();
            this.sinkDestination = null;
        }
        this.outputMeter.disconnect();
        if (!deviceId) {
            this.outputMeter.connect(this.context.destination);
            return;
        }
        const destination = this.context.createMediaStreamDestination();
        this.outputMeter.connect(destination);
        const element = new Audio();
        element.srcObject = destination.stream;
        const sinkable = element;
        if (typeof sinkable.setSinkId === 'function') {
            await sinkable.setSinkId(deviceId);
        }
        this.sinkDestination = destination;
        this.sinkElement = element;
        await element.play();
    }
    // ---- Taps ----------------------------------------------------------------
    /** Tap the output (pre-meter) for a visualizer. Returns a disconnect. */
    connectVisualizer(analyser) {
        this.outputGain.connect(analyser);
        return () => {
            try {
                this.outputGain.disconnect(analyser);
            }
            catch {
                // already disconnected
            }
        };
    }
    // ---- Lifecycle -----------------------------------------------------------
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.stopLive();
        this.element.pause();
        this.element.removeAttribute('src');
        this.sinkElement?.pause();
        await Promise.all([this.nam.dispose(), this.preNam.dispose()]);
        if (this.context.state !== 'closed')
            await this.context.close();
    }
}

/**
 * One thing plays at a time, across every player on the page.
 *
 * Inside one `T3kPlayerProvider` that is already true (one engine, one
 * `activePlayerId`). This extends it across providers and across same-origin
 * iframes (a blog post with five embeds): each engine announces when it
 * starts and stops itself when another one announces. Browsers without
 * BroadcastChannel simply don't coordinate.
 */
const CHANNEL = 't3k-player:playback';
const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
let channel = null;
const listeners = new Set();
function getChannel() {
    if (channel)
        return channel;
    if (typeof BroadcastChannel === 'undefined')
        return null;
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
        const data = event.data;
        if (data?.type !== 'playing' || data.from === instanceId)
            return;
        listeners.forEach(fn => fn());
    };
    return channel;
}
/** Tell other engines this one is about to play. */
function announcePlayback() {
    getChannel()?.postMessage({ type: 'playing', from: instanceId });
}
/** Run `fn` when another engine starts playing. Returns an unsubscribe. */
function onOtherPlayback(fn) {
    getChannel();
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/**
 * Map raw MediaDeviceInfo to simplified { deviceId, label } objects.
 * Provides a fallback label when the browser doesn't expose one.
 */
function mapDevices(allDevices, kind) {
    const prefix = kind === 'audioinput' ? 'Input' : 'Output';
    return allDevices
        .filter(device => device.kind === kind)
        .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `${prefix} ${device.deviceId.slice(0, 8)}`,
    }));
}

/**
 * Manages audio device enumeration, output device selection, microphone permissions,
 * and hot-plug detection. Owns all device and permission state.
 *
 * Audio graph side effects are delegated to the caller via narrow callbacks.
 */
function useAudioDevicesAndPermissions({ applyOutputRouting, onLiveInputLost, liveInputConfig, }) {
    // State
    const [microphonePermission, setMicrophonePermission] = useState({
        status: 'idle',
        error: null,
    });
    const [audioInputDevices, setAudioInputDevices] = useState({
        devices: [],
        isLoading: false,
        error: null,
        preferredDeviceId: null,
    });
    const [audioOutputDevices, setAudioOutputDevices] = useState({
        devices: [],
        selectedDeviceId: null,
    });
    // Permission logic
    const queryBrowserPermission = useCallback(async () => {
        try {
            const result = await navigator.permissions.query({
                name: 'microphone',
            });
            if (result.state === 'granted')
                return 'granted';
            if (result.state === 'denied')
                return 'blocked';
            return 'idle';
        }
        catch {
            // Permissions API not supported for microphone (e.g., Firefox)
            return 'idle';
        }
    }, []);
    // Query permission state on mount and listen for changes
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        let mounted = true;
        const checkPermission = async () => {
            const status = await queryBrowserPermission();
            if (mounted) {
                setMicrophonePermission(prev => ({
                    ...prev,
                    status,
                    error: status === 'granted' ? null : prev.error,
                }));
            }
        };
        checkPermission();
        const setupPermissionListener = async () => {
            try {
                const result = await navigator.permissions.query({
                    name: 'microphone',
                });
                const handleChange = () => {
                    if (!mounted)
                        return;
                    if (result.state === 'granted') {
                        setMicrophonePermission(prev => ({
                            ...prev,
                            status: 'granted',
                            error: null,
                        }));
                    }
                    else if (result.state === 'denied') {
                        setMicrophonePermission(prev => ({
                            ...prev,
                            status: 'blocked',
                            error: 'Microphone access is blocked. Please enable it in your browser settings.',
                        }));
                    }
                    else {
                        setMicrophonePermission(prev => ({ ...prev, status: 'idle' }));
                    }
                };
                result.addEventListener('change', handleChange);
                return () => result.removeEventListener('change', handleChange);
            }
            catch {
                return undefined;
            }
        };
        let cleanupListener;
        setupPermissionListener().then(cleanup => {
            cleanupListener = cleanup;
        });
        return () => {
            mounted = false;
            cleanupListener?.();
        };
    }, [queryBrowserPermission]);
    // Request microphone permission.
    // Only handles the permission prompt; device enumeration is the caller's responsibility.
    // Returns the device ID the user selected in the browser's permission dialog, or null.
    const requestMicrophonePermission = useCallback(async () => {
        // Capture previous status via functional updater (avoids needing a ref)
        let previousStatus = 'idle';
        setMicrophonePermission(prev => {
            previousStatus = prev.status;
            return { status: 'pending', error: null };
        });
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];
            const selectedDeviceId = track?.getSettings()?.deviceId ?? null;
            stream.getTracks().forEach(t => t.stop());
            setMicrophonePermission({ status: 'granted', error: null });
            setAudioInputDevices(prev => ({
                ...prev,
                preferredDeviceId: selectedDeviceId,
            }));
            return selectedDeviceId;
        }
        catch (error) {
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError' ||
                    error.name === 'PermissionDeniedError') {
                    const permissionState = await queryBrowserPermission();
                    // Firefox doesn't support Permissions API for microphone, so queryBrowserPermission
                    // returns 'idle'. If we already tried once (status is 'denied') and get denied again,
                    // Firefox won't re-prompt, treat as blocked.
                    const alreadyDenied = previousStatus === 'denied';
                    if (permissionState === 'blocked' ||
                        (permissionState === 'idle' && alreadyDenied)) {
                        setMicrophonePermission({
                            status: 'blocked',
                            error: 'Microphone access is blocked. Please enable it in your browser settings.',
                        });
                    }
                    else {
                        setMicrophonePermission({
                            status: 'denied',
                            error: 'Microphone access was denied. Please try again.',
                        });
                    }
                }
                else if (error.name === 'NotFoundError') {
                    setMicrophonePermission({
                        status: 'error',
                        error: 'No microphone or audio input device was found.',
                    });
                }
                else if (error.name === 'NotReadableError') {
                    setMicrophonePermission({
                        status: 'error',
                        error: 'Your microphone is being used by another application.',
                    });
                }
                else {
                    setMicrophonePermission({ status: 'error', error: error.message });
                }
            }
            else {
                setMicrophonePermission({
                    status: 'error',
                    error: 'An unexpected error occurred. Please try again.',
                });
            }
            throw error;
        }
    }, [queryBrowserPermission]);
    // Device enumeration
    /**
     * Enumerate audio input devices and update state. Self-healing: if the browser
     * returns devices without labels (Firefox/Safari require a getUserMedia call per
     * session to unlock labels), this function automatically calls getUserMedia and
     * re-enumerates while the stream is still active. This is safe because we only
     * call this function when permission is believed to be granted, so getUserMedia
     * will succeed silently without prompting.
     */
    const refreshAudioInputDevices = useCallback(async () => {
        const permApiStatus = await queryBrowserPermission();
        if (permApiStatus === 'granted' || permApiStatus === 'blocked') {
            setMicrophonePermission(prev => ({
                ...prev,
                status: permApiStatus,
                error: permApiStatus === 'granted' ? null : prev.error,
            }));
            if (permApiStatus === 'blocked') {
                return { inputDevices: [], preferredDeviceId: null };
            }
        }
        setAudioInputDevices(prev => ({ ...prev, isLoading: true, error: null }));
        try {
            let allDevices = await navigator.mediaDevices.enumerateDevices();
            const hasLabels = allDevices.some(d => d.kind === 'audioinput' && d.label);
            // Firefox/Safari workaround: getUserMedia unlocks device labels for the session.
            // Enumerate while the stream is still active to guarantee labels are available.
            if (!hasLabels) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                    });
                    allDevices = await navigator.mediaDevices.enumerateDevices();
                    stream.getTracks().forEach(t => t.stop());
                    setMicrophonePermission({ status: 'granted', error: null });
                }
                catch {
                    // getUserMedia failed, use the unlabeled devices we already have
                }
            }
            const mappedInputDevices = mapDevices(allDevices, 'audioinput');
            setAudioInputDevices(prev => ({
                ...prev,
                devices: mappedInputDevices,
                isLoading: false,
                error: mappedInputDevices.length === 0
                    ? 'No audio input devices found.'
                    : null,
            }));
            return {
                inputDevices: mappedInputDevices,
                preferredDeviceId: audioInputDevices.preferredDeviceId,
            };
        }
        catch {
            setAudioInputDevices(prev => ({
                ...prev,
                isLoading: false,
                error: 'Failed to enumerate audio devices.',
            }));
            return { inputDevices: [], preferredDeviceId: null };
        }
    }, [queryBrowserPermission, audioInputDevices.preferredDeviceId]);
    const refreshAudioOutputDevices = useCallback(async () => {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const mappedOutputDevices = mapDevices(allDevices, 'audiooutput');
            setAudioOutputDevices(prev => ({
                ...prev,
                devices: mappedOutputDevices,
            }));
        }
        catch (error) {
            console.error('Error enumerating output devices:', error);
        }
    }, []);
    // Output device selection
    const setOutputDevice = useCallback(async (deviceId) => {
        // Capture previous for rollback via functional updater
        let previousDeviceId = null;
        setAudioOutputDevices(prev => {
            previousDeviceId = prev.selectedDeviceId;
            return { ...prev, selectedDeviceId: deviceId };
        });
        try {
            await applyOutputRouting(deviceId);
        }
        catch (error) {
            console.warn('[Audio] Failed to set output device, reverting:', error);
            setAudioOutputDevices(prev => ({
                ...prev,
                selectedDeviceId: previousDeviceId,
            }));
        }
    }, [applyOutputRouting]);
    // Live input unavailable handler
    const handleLiveInputUnavailable = useCallback((reason) => {
        onLiveInputLost();
        const errorMessages = {
            'device-disconnected': 'Audio input device was disconnected.',
            'permission-revoked': 'Microphone permission was revoked. Please re-enable access in your browser settings.',
        };
        setAudioInputDevices(prev => ({ ...prev, error: errorMessages[reason] }));
    }, [onLiveInputLost]);
    // Hot-plug detection
    useEffect(() => {
        if (typeof window === 'undefined' || !navigator.mediaDevices)
            return;
        const handleDeviceChange = async () => {
            if (microphonePermission.status === 'granted') {
                try {
                    const allDevices = await navigator.mediaDevices.enumerateDevices();
                    const audioInputs = mapDevices(allDevices, 'audioinput');
                    // Check if configured input device was disconnected
                    const configuredDeviceId = liveInputConfig?.deviceId;
                    if (configuredDeviceId) {
                        const configuredDeviceStillExists = audioInputs.some(d => d.deviceId === configuredDeviceId);
                        if (!configuredDeviceStillExists) {
                            console.warn('Configured audio input device was disconnected');
                            handleLiveInputUnavailable('device-disconnected');
                            setAudioInputDevices(prev => ({ ...prev, devices: audioInputs }));
                            return;
                        }
                    }
                    setAudioInputDevices(prev => ({
                        ...prev,
                        devices: audioInputs,
                        error: audioInputs.length === 0
                            ? 'All audio devices have been disconnected.'
                            : null,
                    }));
                    // Check if selected output device was disconnected
                    const audioOutputs = mapDevices(allDevices, 'audiooutput');
                    const selectedStillExists = audioOutputDevices.selectedDeviceId === null ||
                        audioOutputs.some(d => d.deviceId === audioOutputDevices.selectedDeviceId);
                    setAudioOutputDevices(prev => ({
                        ...prev,
                        devices: audioOutputs,
                        selectedDeviceId: selectedStillExists
                            ? prev.selectedDeviceId
                            : null,
                    }));
                    if (!selectedStillExists) {
                        console.warn('Selected audio output device was disconnected, falling back to system default');
                        applyOutputRouting(null).catch(e => console.warn('[Audio] Failed to reset output routing:', e));
                    }
                }
                catch {
                    setAudioInputDevices(prev => ({
                        ...prev,
                        error: 'Failed to refresh device list.',
                    }));
                }
            }
        };
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        };
    }, [
        microphonePermission.status,
        liveInputConfig,
        handleLiveInputUnavailable,
        applyOutputRouting,
        audioOutputDevices.selectedDeviceId,
    ]);
    return {
        microphonePermission,
        audioInputDevices,
        audioOutputDevices,
        requestMicrophonePermission,
        refreshAudioInputDevices,
        refreshAudioOutputDevices,
        setOutputDevice,
        handleLiveInputUnavailable,
    };
}

const INITIAL_AUDIO_STATE = {
    initState: 'uninitialized',
    isPlaying: false,
    activePlayerId: null,
    isBypassed: false,
    modelUrl: null,
    preModelUrl: null,
    irUrl: null,
    irMix: 1,
    irReverbLike: false,
    audioUrl: null,
    inputMode: { type: 'demo' },
    liveInputConfig: null,
};
const T3kPlayerContext = createContext(null);
function T3kPlayerContextProvider({ children, engineAssets, }) {
    const [audioState, setAudioState] = useState(INITIAL_AUDIO_STATE);
    const [source, setSource] = useState({
        mode: 'demo',
        owner: null,
    });
    const setSourceMode = useCallback((mode, playerId) => {
        setSource(prev => (prev.mode === mode ? prev : { mode, owner: playerId }));
    }, []);
    /** Last configured device, readable from callbacks without a stale closure. */
    const liveConfigRef = useRef(audioState.liveInputConfig);
    liveConfigRef.current = audioState.liveInputConfig;
    const graphRef = useRef(null);
    const initPromiseRef = useRef(null);
    const engineAssetsRef = useRef(engineAssets);
    engineAssetsRef.current = engineAssets;
    const getGraph = useCallback(() => graphRef.current, []);
    const stopped = useCallback(() => {
        setAudioState(prev => prev.isPlaying || prev.activePlayerId
            ? { ...prev, isPlaying: false, activePlayerId: null }
            : prev);
    }, []);
    // ---- Playback ------------------------------------------------------------
    const setPlaying = useCallback((playing, playerId) => {
        const graph = graphRef.current;
        if (!graph) {
            if (playing)
                console.warn('[T3kPlayer] setPlaying before init()');
            return;
        }
        if (playing) {
            announcePlayback();
            void graph.context.resume();
            if (!graph.live) {
                graph.element.play().catch(error => {
                    console.error('[T3kPlayer] playback failed:', error);
                    graph.setOutputEnabled(false);
                    stopped();
                });
            }
            graph.setOutputEnabled(true);
            setAudioState(prev => ({
                ...prev,
                isPlaying: true,
                activePlayerId: playerId ?? prev.activePlayerId,
            }));
        }
        else {
            graph.setOutputEnabled(false);
            if (!graph.live)
                graph.element.pause();
            stopped();
        }
    }, [stopped]);
    // Another engine on the page (other provider or same-origin iframe) started.
    useEffect(() => onOtherPlayback(() => setPlaying(false)), [setPlaying]);
    const release = useCallback(() => {
        setPlaying(false);
        const graph = graphRef.current;
        if (graph)
            graph.element.currentTime = 0;
    }, [setPlaying]);
    // ---- Live input lifecycle hooks for the devices hook --------------------
    const dropLiveInput = useCallback(() => {
        graphRef.current?.stopLive();
        setAudioState(prev => ({
            ...prev,
            inputMode: { type: 'demo' },
            liveInputConfig: null,
            isPlaying: false,
            activePlayerId: null,
        }));
    }, []);
    const { microphonePermission, audioInputDevices, audioOutputDevices, requestMicrophonePermission, refreshAudioInputDevices, refreshAudioOutputDevices, setOutputDevice, handleLiveInputUnavailable, } = useAudioDevicesAndPermissions({
        applyOutputRouting: useCallback(async (deviceId) => {
            await graphRef.current?.setSink(deviceId);
        }, []),
        onLiveInputLost: dropLiveInput,
        liveInputConfig: audioState.liveInputConfig,
    });
    // ---- Init ----------------------------------------------------------------
    const init = useCallback(() => {
        if (graphRef.current)
            return Promise.resolve(graphRef.current);
        if (initPromiseRef.current)
            return initPromiseRef.current;
        setAudioState(prev => ({ ...prev, initState: 'initializing' }));
        const promise = AudioGraph.create(engineAssetsRef.current)
            .then(graph => {
            // Natural end of the demo clip: close the output and free the engine.
            graph.element.addEventListener('ended', () => {
                graph.setOutputEnabled(false);
                stopped();
            });
            graphRef.current = graph;
            setAudioState(prev => ({ ...prev, initState: 'ready' }));
            return graph;
        })
            .catch(error => {
            initPromiseRef.current = null;
            setAudioState(prev => ({ ...prev, initState: 'uninitialized' }));
            throw error;
        });
        initPromiseRef.current = promise;
        return promise;
    }, [stopped]);
    const requireGraph = useCallback(() => {
        const graph = graphRef.current;
        if (!graph)
            throw new Error('Audio engine not initialized. Call init().');
        return graph;
    }, []);
    // ---- Engine settings -----------------------------------------------------
    const sync = useCallback(async (settings) => {
        const graph = requireGraph();
        const preModelUrl = settings.preModelUrl ?? null;
        if (graph.preModelUrl !== preModelUrl) {
            await graph.loadModel(preModelUrl, settings.slimSize, 'pre');
        }
        if (graph.modelUrl !== settings.modelUrl) {
            await graph.loadModel(settings.modelUrl, settings.slimSize);
        }
        if (graph.irUrl !== settings.ir.url) {
            await graph.setIr({
                url: settings.ir.url,
                mix: settings.mix ?? settings.ir.mix,
            });
        }
        else if (settings.mix !== undefined && graph.ir.mix !== settings.mix) {
            graph.setIrMix(settings.mix);
        }
        graph.setBypass(settings.bypassed);
        setAudioState(prev => ({
            ...prev,
            modelUrl: graph.modelUrl,
            preModelUrl: graph.preModelUrl,
            irUrl: graph.irUrl,
            irMix: graph.ir.mix,
            irReverbLike: graph.ir.reverbLike,
            isBypassed: graph.bypassed,
        }));
    }, [requireGraph]);
    const setIrMix = useCallback((mix) => {
        const graph = graphRef.current;
        if (!graph)
            return;
        graph.setIrMix(mix);
        setAudioState(prev => ({ ...prev, irMix: graph.ir.mix }));
    }, []);
    const loadAudio = useCallback(async (url) => {
        const graph = requireGraph();
        await graph.loadAudio(url);
        setAudioState(prev => ({ ...prev, audioUrl: graph.audioUrl }));
    }, [requireGraph]);
    const setBypass = useCallback((bypassed) => {
        const graph = graphRef.current;
        if (!graph)
            return;
        graph.setBypass(bypassed);
        setAudioState(prev => ({ ...prev, isBypassed: bypassed }));
    }, []);
    const connectVisualizer = useCallback((analyser) => graphRef.current?.connectVisualizer(analyser) ?? (() => { }), []);
    // ---- Live input ----------------------------------------------------------
    const startLiveInput = useCallback(async (deviceId) => {
        const graph = requireGraph();
        // Taking the engine: whoever was playing stops.
        graph.element.pause();
        graph.setOutputEnabled(false);
        setAudioState(prev => ({
            ...prev,
            inputMode: { type: 'connecting' },
            isPlaying: false,
            activePlayerId: null,
        }));
        try {
            const previous = graph.live ?? liveConfigRef.current;
            const config = await graph.startLive(deviceId, previous
                ? { channel: previous.channel, gainsDb: previous.gainsDb }
                : {}, () => handleLiveInputUnavailable('device-disconnected'));
            setAudioState(prev => ({
                ...prev,
                inputMode: { type: 'live' },
                liveInputConfig: config,
            }));
        }
        catch (error) {
            setAudioState(prev => ({ ...prev, inputMode: { type: 'demo' } }));
            throw error;
        }
    }, [requireGraph, handleLiveInputUnavailable]);
    // The graph, not React state, says whether the input is live: this runs
    // right after startLiveInput() in the same tick, before state has settled.
    const reconnectLiveInput = useCallback(async () => {
        const graph = graphRef.current;
        if (graph?.live)
            return;
        const config = liveConfigRef.current;
        if (!config)
            return;
        await startLiveInput(config.deviceId);
    }, [startLiveInput]);
    const stopLiveInput = useCallback(() => {
        const graph = graphRef.current;
        if (!graph?.live)
            return;
        graph.stopLive();
        graph.setOutputEnabled(false);
        setAudioState(prev => ({
            ...prev,
            inputMode: { type: 'demo' },
            isPlaying: false,
            activePlayerId: null,
        }));
    }, []);
    const selectLiveInputChannel = useCallback((channel) => {
        const graph = graphRef.current;
        if (!graph?.live)
            return;
        graph.selectLiveChannel(channel);
        setAudioState(prev => ({ ...prev, liveInputConfig: graph.live }));
    }, []);
    const setLiveInputGain = useCallback((gainDb) => {
        const graph = graphRef.current;
        if (!graph?.live)
            return;
        graph.setLiveGainDb(gainDb);
        setAudioState(prev => ({ ...prev, liveInputConfig: graph.live }));
    }, []);
    // ---- Teardown ------------------------------------------------------------
    useEffect(() => {
        return () => {
            void graphRef.current?.dispose();
            graphRef.current = null;
            initPromiseRef.current = null;
        };
    }, []);
    const value = useMemo(() => ({
        audioState,
        microphonePermission,
        audioInputDevices,
        audioOutputDevices,
        source,
        setSourceMode,
        getGraph,
        init,
        sync,
        loadAudio,
        setBypass,
        setIrMix,
        setPlaying,
        release,
        connectVisualizer,
        startLiveInput,
        reconnectLiveInput,
        stopLiveInput,
        selectLiveInputChannel,
        setLiveInputGain,
        requestMicrophonePermission,
        refreshAudioInputDevices,
        refreshAudioOutputDevices,
        setOutputDevice,
    }), [
        audioState,
        microphonePermission,
        audioInputDevices,
        audioOutputDevices,
        source,
        setSourceMode,
        getGraph,
        init,
        sync,
        loadAudio,
        setBypass,
        setIrMix,
        setPlaying,
        release,
        connectVisualizer,
        startLiveInput,
        reconnectLiveInput,
        stopLiveInput,
        selectLiveInputChannel,
        setLiveInputGain,
        requestMicrophonePermission,
        refreshAudioInputDevices,
        refreshAudioOutputDevices,
        setOutputDevice,
    ]);
    return (React.createElement(T3kPlayerContext.Provider, { value: value }, children));
}
// SSR: a no-op context so server renders don't need a provider.
function createNoopContext() {
    const noop = () => { };
    const resolve = async () => { };
    return {
        audioState: INITIAL_AUDIO_STATE,
        microphonePermission: { status: 'idle', error: null },
        audioInputDevices: {
            devices: [],
            isLoading: false,
            error: null,
            preferredDeviceId: null,
        },
        audioOutputDevices: { devices: [], selectedDeviceId: null },
        source: { mode: 'demo', owner: null },
        setSourceMode: noop,
        getGraph: () => null,
        init: () => Promise.reject(new Error('No audio on the server')),
        sync: resolve,
        loadAudio: resolve,
        setBypass: noop,
        setIrMix: noop,
        setPlaying: noop,
        release: noop,
        connectVisualizer: () => noop,
        startLiveInput: resolve,
        reconnectLiveInput: resolve,
        stopLiveInput: noop,
        selectLiveInputChannel: noop,
        setLiveInputGain: noop,
        requestMicrophonePermission: async () => null,
        refreshAudioInputDevices: async () => ({
            inputDevices: [],
            preferredDeviceId: null,
        }),
        refreshAudioOutputDevices: resolve,
        setOutputDevice: resolve,
    };
}
function useT3kPlayerContext() {
    const context = useContext(T3kPlayerContext);
    if (typeof window === 'undefined')
        return createNoopContext();
    if (!context) {
        throw new Error('useT3kPlayerContext must be used within a T3kPlayerProvider');
    }
    return context;
}

const FFT_SIZE = 256;
const rafIter$1 = () => {
    let id;
    return {
        async next() {
            const promise = new Promise(resolve => {
                id = requestAnimationFrame(resolve);
            });
            await promise;
            return { value: undefined, done: false };
        },
        async return() {
            cancelAnimationFrame(id);
            return { value: undefined, done: true };
        },
        [Symbol.asyncIterator]() {
            return this;
        },
    };
};
/**
 * The waveform background is the player's surface token, read from the canvas
 * so the visualizer follows the active theme without being told about it.
 */
const resolveBackground = (canvas) => {
    const value = getComputedStyle(canvas).getPropertyValue('--t3k-surface');
    return value.trim() || '#18181b';
};
const makeGradient = (ctx, width, useGradient) => {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    if (useGradient) {
        gradient.addColorStop(0, 'red');
        gradient.addColorStop(0.5, 'yellow');
        gradient.addColorStop(1, 'blue');
    }
    else {
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(1, 'white');
    }
    return gradient;
};
const setupVisualizer = (canvas, audioCtx, useGradient = true) => {
    const canvasCtx = canvas.getContext('2d');
    if (canvasCtx === null) {
        throw new Error('canvasCtx was null');
    }
    const analyzer = audioCtx.createAnalyser();
    analyzer.fftSize = FFT_SIZE;
    const analyzeResultArray = new Uint8Array(analyzer.fftSize);
    const bg = resolveBackground(canvas);
    let running = true;
    (async () => {
        const { height, width } = canvas;
        const gap = width / analyzeResultArray.length;
        const gradient = makeGradient(canvasCtx, width, useGradient);
        for await (const _ of rafIter$1()) {
            if (!running)
                break;
            analyzer.getByteTimeDomainData(analyzeResultArray);
            canvasCtx.fillStyle = bg;
            canvasCtx.fillRect(0, 0, width, height);
            canvasCtx.beginPath();
            canvasCtx.lineWidth = 2;
            for (let i = 0; i < analyzeResultArray.length; i++) {
                const data = analyzeResultArray[i];
                const x = gap * i;
                const y = height * (data / 256);
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                }
                else {
                    canvasCtx.lineTo(x, y);
                }
            }
            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineTo(width, height / 2);
            canvasCtx.stroke();
        }
    })();
    return {
        analyser: analyzer,
        stop: () => {
            running = false;
        },
    };
};
const initVisualizer = ({ canvas, useGradient = true, }) => {
    if (!canvas)
        return;
    // draw a line across the canvas as default state using the gradient
    const canvasCtx = canvas.getContext('2d');
    if (canvasCtx === null) {
        throw new Error('canvasCtx was null');
    }
    const { height, width } = canvas;
    const gradient = makeGradient(canvasCtx, width, useGradient);
    canvasCtx.fillStyle = resolveBackground(canvas);
    canvasCtx.lineWidth = 2;
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = gradient;
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
};

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
function getDefault(items) {
    return items.find(item => item.default) || items[0];
}

/** Selection to carry preferences from when seeding `toneId`. */
function carryFrom(state, toneId) {
    if (state.activeToneId !== toneId)
        return state.selection[state.activeToneId];
    if (state.previousToneId && state.previousToneId !== toneId) {
        return state.selection[state.previousToneId];
    }
    return undefined;
}
const statusFor = (tone) => typeof tone.assets === 'function'
    ? { status: 'idle' }
    : { status: 'ready', value: tone.assets };
/**
 * Default selection for a set of assets. When `previous` is given (the
 * selection of the tone the user was just on), its IR, input and pre-model
 * carry over if the new assets contain the same URLs: those are user
 * preferences, the tone's own slot is the tone.
 */
function seedSelection(assets, previous) {
    const ir = (previous && assets.irs.find(i => i.url === previous.ir.url)) ||
        getDefault(assets.irs);
    const input = (previous && assets.inputs.find(i => i.url === previous.input.url)) ||
        getDefault(assets.inputs);
    const selection = { model: getDefault(assets.models), ir, input };
    if (assets.preModels) {
        selection.preModel =
            (previous?.preModel &&
                assets.preModels.find(m => m.url === previous.preModel.url)) ||
                getDefault(assets.preModels);
    }
    return selection;
}
function createInitialState(tones, options) {
    const assets = {};
    const selection = {};
    for (const tone of tones) {
        const status = statusFor(tone);
        assets[tone.id] = status;
        if (status.status === 'ready') {
            selection[tone.id] = seedSelection(status.value);
        }
    }
    const activeToneId = options.defaultToneId && tones.some(t => t.id === options.defaultToneId)
        ? options.defaultToneId
        : tones[0].id;
    return {
        activeToneId,
        expanded: options.defaultExpanded ?? false,
        view: 'controls',
        bypassed: false,
        assets,
        selection,
        visited: { [activeToneId]: true },
        previousToneId: null,
    };
}
function playerReducer(state, action) {
    switch (action.type) {
        case 'tones/sync': {
            // Add tones that appeared, drop tones that left, keep everything else.
            const ids = new Set(action.tones.map(t => t.id));
            const assets = {};
            const selection = {};
            for (const tone of action.tones) {
                const existing = state.assets[tone.id];
                const status = existing ?? statusFor(tone);
                assets[tone.id] = status;
                if (state.selection[tone.id]) {
                    selection[tone.id] = state.selection[tone.id];
                }
                else if (status.status === 'ready') {
                    selection[tone.id] = seedSelection(status.value);
                }
            }
            const activeToneId = ids.has(state.activeToneId)
                ? state.activeToneId
                : action.tones[0].id;
            const previousToneId = state.previousToneId && ids.has(state.previousToneId)
                ? state.previousToneId
                : null;
            return {
                ...state,
                assets,
                selection,
                activeToneId,
                previousToneId,
                visited: { ...state.visited, [activeToneId]: true },
            };
        }
        case 'assets/loading':
            return {
                ...state,
                assets: { ...state.assets, [action.toneId]: { status: 'loading' } },
            };
        case 'assets/ready': {
            const previous = carryFrom(state, action.toneId);
            return {
                ...state,
                assets: {
                    ...state.assets,
                    [action.toneId]: { status: 'ready', value: action.assets },
                },
                selection: {
                    ...state.selection,
                    [action.toneId]: state.selection[action.toneId] ??
                        seedSelection(action.assets, previous),
                },
            };
        }
        case 'assets/error':
            return {
                ...state,
                assets: {
                    ...state.assets,
                    [action.toneId]: { status: 'error', message: action.message },
                },
            };
        case 'tone/activate': {
            if (action.toneId === state.activeToneId)
                return state;
            const previous = state.selection[state.activeToneId];
            const next = state.assets[action.toneId];
            const selection = { ...state.selection };
            // First visit: re-seed with carry-over (eager tones were seeded with
            // plain defaults at init). Revisits keep the tone's own choices.
            if (next?.status === 'ready' && !state.visited[action.toneId]) {
                selection[action.toneId] = seedSelection(next.value, previous);
            }
            return {
                ...state,
                activeToneId: action.toneId,
                previousToneId: state.activeToneId,
                selection,
                visited: { ...state.visited, [action.toneId]: true },
            };
        }
        case 'selection/set': {
            const current = state.selection[action.toneId];
            if (!current)
                return state;
            const next = { ...current, [action.field]: action.value };
            // A user-set mix belongs to the IR it was set on.
            if (action.field === 'ir')
                delete next.mix;
            return {
                ...state,
                selection: { ...state.selection, [action.toneId]: next },
            };
        }
        case 'bypass/set':
            return state.bypassed === action.bypassed
                ? state
                : { ...state, bypassed: action.bypassed };
        case 'expanded/set':
            return state.expanded === action.expanded
                ? state
                : { ...state, expanded: action.expanded };
        case 'view/set':
            return state.view === action.view
                ? state
                : { ...state, view: action.view };
    }
}

// Several players share one engine; only one of them should run the
// permission → devices → connect sequence at a time.
let inFlight = null;
function useLiveSetup({ enabled, onConnected }) {
    const { audioState, microphonePermission, audioInputDevices, audioOutputDevices, init, requestMicrophonePermission, refreshAudioInputDevices, refreshAudioOutputDevices, startLiveInput, selectLiveInputChannel, setOutputDevice, } = useT3kPlayerContext();
    const [busy, setBusy] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const enumeratedRef = useRef(false);
    const autoTriedRef = useRef(false);
    const onConnectedRef = useRef(onConnected);
    onConnectedRef.current = onConnected;
    const config = audioState.liveInputConfig;
    const permission = microphonePermission.status;
    /**
     * Enumerate, then start `deviceId` (or the preferred / first interface).
     * Always enumerates: right after the permission prompt the device list is
     * still empty, and the settings panel needs it populated. `chosen` means
     * the user picked this device, which is what starts monitoring.
     */
    const connectDevice = useCallback(async (deviceId, chosen = false) => {
        setConnectionError(null);
        setBusy(true);
        try {
            await init();
            const [{ inputDevices, preferredDeviceId }] = await Promise.all([
                refreshAudioInputDevices(),
                refreshAudioOutputDevices(),
            ]);
            enumeratedRef.current = true;
            if (inputDevices.length === 0)
                return;
            const known = (id) => id && inputDevices.some(d => d.deviceId === id) ? id : null;
            const id = known(deviceId) ??
                known(preferredDeviceId) ??
                inputDevices[0].deviceId;
            await startLiveInput(id);
            if (chosen)
                await onConnectedRef.current?.();
        }
        catch (error) {
            setConnectionError(error instanceof DOMException
                ? error.message
                : 'Could not connect to the audio interface. Try again.');
        }
        finally {
            setBusy(false);
        }
    }, [init, refreshAudioInputDevices, refreshAudioOutputDevices, startLiveInput]);
    const runOnce = useCallback((task) => {
        if (inFlight)
            return inFlight;
        inFlight = task().finally(() => {
            inFlight = null;
        });
        return inFlight;
    }, []);
    const connect = useCallback(() => runOnce(async () => {
        // Busy for the whole sequence. Permission flips to 'granted' a tick
        // before connectDevice runs; without this the panel renders that
        // tick as "granted, idle, no devices" — a flash of "No audio
        // interface found" right after the prompt.
        setBusy(true);
        try {
            if (permission !== 'granted') {
                let preferred;
                try {
                    preferred = await requestMicrophonePermission();
                }
                catch {
                    return; // status/error are in microphonePermission
                }
                await connectDevice(preferred ?? undefined);
            }
            else {
                await connectDevice();
            }
        }
        finally {
            setBusy(false);
        }
    }), [runOnce, permission, requestMicrophonePermission, connectDevice]);
    // Permission already granted and no interface yet: connect without asking.
    useEffect(() => {
        if (!enabled || permission !== 'granted' || config || busy)
            return;
        if (autoTriedRef.current)
            return;
        autoTriedRef.current = true;
        void runOnce(connectDevice);
    }, [enabled, permission, config, busy, runOnce, connectDevice]);
    const refreshDevices = useCallback(async () => {
        await Promise.all([
            refreshAudioInputDevices(),
            refreshAudioOutputDevices(),
        ]);
        enumeratedRef.current = true;
        autoTriedRef.current = false; // let the auto-connect retry with new devices
    }, [refreshAudioInputDevices, refreshAudioOutputDevices]);
    const selectDevice = useCallback((deviceId) => runOnce(() => connectDevice(deviceId, true)), [runOnce, connectDevice]);
    const devices = audioInputDevices.devices;
    const connecting = busy ||
        audioInputDevices.isLoading ||
        audioState.inputMode.type === 'connecting';
    let status;
    if (permission === 'pending')
        status = 'pending';
    else if (permission === 'blocked')
        status = 'blocked';
    else if (connecting)
        status = 'connecting';
    else if (config)
        status = 'ready';
    else if (permission === 'granted' && enumeratedRef.current && !devices.length)
        status = 'no-device';
    else
        status = 'connect';
    const error = connectionError ??
        (status === 'connect' || status === 'blocked'
            ? microphonePermission.error
            : null) ??
        audioInputDevices.error;
    return {
        status,
        permission,
        error,
        config,
        devices,
        outputDevices: audioOutputDevices.devices,
        selectedOutputDeviceId: audioOutputDevices.selectedDeviceId,
        connect,
        refreshDevices,
        selectDevice,
        selectChannel: selectLiveInputChannel,
        setOutputDevice,
    };
}

/**
 * Resolves a tone's assets on demand. Eager assets return immediately; thunks
 * run once per tone (concurrent callers share the in-flight promise) and
 * their outcome is written to state.
 */
function usePlayerAssets(tones, state, dispatch) {
    const tonesRef = useRef(tones);
    tonesRef.current = tones;
    const stateRef = useRef(state);
    stateRef.current = state;
    const inflight = useRef(new Map());
    // Keep the reducer's tone table in step with the prop.
    const idsKey = tones.map(t => t.id).join('\u0000');
    useEffect(() => {
        dispatch({ type: 'tones/sync', tones: tonesRef.current });
    }, [idsKey, dispatch]);
    const resolveAssets = useCallback((toneId) => {
        const current = stateRef.current.assets[toneId];
        if (current?.status === 'ready')
            return Promise.resolve(current.value);
        const pending = inflight.current.get(toneId);
        if (pending)
            return pending;
        const tone = tonesRef.current.find(t => t.id === toneId);
        if (!tone) {
            return Promise.reject(new Error(`Unknown tone "${toneId}"`));
        }
        if (typeof tone.assets !== 'function') {
            dispatch({ type: 'assets/ready', toneId, assets: tone.assets });
            return Promise.resolve(tone.assets);
        }
        dispatch({ type: 'assets/loading', toneId });
        const promise = tone
            .assets()
            .then(assets => {
            validateAssets(assets);
            dispatch({ type: 'assets/ready', toneId, assets });
            return assets;
        })
            .catch((error) => {
            const message = error instanceof Error ? error.message : 'Failed to load tone';
            dispatch({ type: 'assets/error', toneId, message });
            throw error;
        })
            .finally(() => {
            inflight.current.delete(toneId);
        });
        inflight.current.set(toneId, promise);
        return promise;
    }, [dispatch]);
    return { resolveAssets };
}
function validateAssets(assets) {
    if (!assets?.models?.length ||
        !assets?.irs?.length ||
        !assets?.inputs?.length) {
        throw new Error('Tone has no playable models, IRs, or inputs');
    }
}

// Caption for a slot when it is the tone, and when it is the companion.
const DEFAULT_LABELS = {
    model: { primary: 'NAM Capture', companion: 'Amp' },
    ir: { primary: 'Impulse Response (IR)', companion: 'Cab' },
    preModel: { primary: 'Amp', companion: 'Amp' },
    input: 'Input',
};
/** Select option value: a `null` url is the "None" entry. */
const optionValue = (url) => url ?? '';
function usePlayer(options) {
    const { tones, slimSize, onEvent } = options;
    const generatedId = useId();
    const playerId = options.id ?? generatedId;
    const compositeId = useCallback((toneId) => `${playerId}:${toneId}`, [playerId]);
    // ---- Events --------------------------------------------------------------
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const emit = useCallback((event) => {
        onEventRef.current?.(event);
    }, []);
    // ---- State ---------------------------------------------------------------
    const [state, dispatch] = useReducer(playerReducer, undefined, () => createInitialState(tones, {
        defaultToneId: options.defaultToneId,
        defaultExpanded: options.defaultExpanded,
    }));
    const stateRef = useRef(state);
    stateRef.current = state;
    const { resolveAssets } = usePlayerAssets(tones, state, dispatch);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [busyToneId, setBusyToneId] = useState(null);
    const [error, setError] = useState(null);
    // ---- Context -------------------------------------------------------------
    const { audioState, audioInputDevices, getGraph, init, sync, loadAudio, setBypass, setIrMix, setPlaying, release, connectVisualizer, reconnectLiveInput, stopLiveInput, source, setSourceMode: setSharedSourceMode, } = useT3kPlayerContext();
    // Sample vs live is page-wide (see the context): every player under the
    // provider shows the same tab, like the v2 player did.
    const sourceMode = options.live ? source.mode : 'demo';
    // ---- Derived -------------------------------------------------------------
    const activeIndex = Math.max(0, tones.findIndex(t => t.id === state.activeToneId));
    const activeTone = tones[activeIndex];
    const activeToneId = activeTone.id;
    const activeAssets = state.assets[activeToneId] ?? {
        status: 'idle',
    };
    const selection = state.selection[activeToneId] ?? null;
    const assets = activeAssets.status === 'ready' ? activeAssets.value : null;
    const previewMode = assets?.previewMode ?? 'model';
    // The chain is pre → model → ir. The tone is `previewMode`'s slot; the
    // companion is `preModels` when provided, else the other of model / ir.
    const primaryField = previewMode;
    const companionField = assets?.preModels
        ? 'preModel'
        : previewMode === 'ir'
            ? 'model'
            : 'ir';
    const labels = useMemo(() => {
        const l = assets?.labels ?? {};
        return {
            primary: l[primaryField] ?? DEFAULT_LABELS[primaryField].primary,
            secondary: l[companionField] ?? DEFAULT_LABELS[companionField].companion,
            input: l.input ?? DEFAULT_LABELS.input,
        };
    }, [assets, primaryField, companionField]);
    const isTonePlaying = useCallback((toneId) => audioState.activePlayerId === compositeId(toneId), [audioState.activePlayerId, compositeId]);
    const isActive = isTonePlaying(activeToneId);
    const isAnyTonePlaying = audioState.activePlayerId?.startsWith(`${playerId}:`) ?? false;
    const toOptions = (items) => items?.map(i => ({ label: i.name, value: optionValue(i.url) })) ?? [];
    const modelOptions = useMemo(() => toOptions(assets?.models), [assets]);
    const irOptions = useMemo(() => toOptions(assets?.irs), [assets]);
    const inputOptions = useMemo(() => toOptions(assets?.inputs), [assets]);
    const preModelOptions = useMemo(() => toOptions(assets?.preModels), [assets]);
    // ---- Refs ----------------------------------------------------------------
    const visualizerRef = useRef(null);
    const canvasWrapperRef = useRef(null);
    const activePlayerIdRef = useRef(audioState.activePlayerId);
    activePlayerIdRef.current = audioState.activePlayerId;
    // ---- Helpers -------------------------------------------------------------
    /** Assets + selection for a tone, resolving lazily. */
    const ensureTone = useCallback(async (toneId) => {
        const resolved = await resolveAssets(toneId);
        // The reducer seeds selection on `assets/ready`, but that dispatch may
        // not have rendered yet. Mirror its logic so callers never see null.
        const current = stateRef.current;
        const sel = current.selection[toneId] ??
            seedSelection(resolved, current.activeToneId !== toneId
                ? current.selection[current.activeToneId]
                : undefined);
        return { assets: resolved, selection: sel };
    }, [resolveAssets]);
    const syncToEngine = useCallback((sel) => sync({
        modelUrl: sel.model.url,
        preModelUrl: sel.preModel?.url ?? null,
        slimSize,
        ir: sel.ir,
        mix: sel.mix,
        bypassed: stateRef.current.bypassed,
    }), [sync, slimSize]);
    const fail = useCallback((code, err, toneId) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[T3kPlayer] ${code}:`, err);
        setError(message);
        emit({ type: 'error', code, toneId, message });
    }, [emit]);
    // ---- Effects -------------------------------------------------------------
    useEffect(() => {
        emit({ type: 'ready' });
    }, [emit]);
    // Only tear down playback if this player owns it; another player on the
    // page may be mid-song when a card scrolls out and unmounts.
    useEffect(() => {
        return () => {
            if (activePlayerIdRef.current?.startsWith(`${playerId}:`))
                release();
        };
    }, [release, playerId]);
    // Keep the waveform canvas sized to its wrapper.
    const resizeCanvas = useCallback(() => {
        if (canvasWrapperRef.current && visualizerRef.current) {
            visualizerRef.current.width = canvasWrapperRef.current.clientWidth;
            initVisualizer({ canvas: visualizerRef.current });
        }
    }, []);
    useEffect(() => {
        resizeCanvas();
        const wrapper = canvasWrapperRef.current;
        if (!wrapper || typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', resizeCanvas);
            return () => window.removeEventListener('resize', resizeCanvas);
        }
        const ro = new ResizeObserver(resizeCanvas);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, [resizeCanvas, sourceMode, state.expanded, state.view]);
    // Sync local bypass from the engine while this player drives it.
    useEffect(() => {
        if (isActive)
            dispatch({ type: 'bypass/set', bypassed: audioState.isBypassed });
    }, [isActive, audioState.isBypassed]);
    // Single source of `pause` / `ended`: whenever one of this player's tones
    // stops owning the engine — user pause, track end, another player or tone
    // taking over, source switch — emit exactly one event for it. Hosts and
    // embeds rely on play/pause pairing.
    const ownedToneRef = useRef(null);
    const endedToneRef = useRef(null);
    useEffect(() => {
        const owned = audioState.activePlayerId?.startsWith(`${playerId}:`)
            ? audioState.activePlayerId.slice(playerId.length + 1)
            : null;
        const previous = ownedToneRef.current;
        ownedToneRef.current = owned;
        if (previous && previous !== owned) {
            const ended = endedToneRef.current === previous;
            endedToneRef.current = null;
            emit({ type: ended ? 'ended' : 'pause', toneId: previous });
        }
    }, [audioState.activePlayerId, playerId, emit]);
    // Audio element listeners, only while this player's tone is active.
    useEffect(() => {
        if (!isActive)
            return;
        const element = getGraph()?.element;
        if (!element)
            return;
        const onTime = () => setCurrentTime(element.currentTime);
        const onEnded = () => {
            endedToneRef.current = activeToneId; // the ownership effect emits `ended`
        };
        const onMeta = () => setDuration(element.duration);
        if (element.duration)
            setDuration(element.duration);
        element.addEventListener('timeupdate', onTime);
        element.addEventListener('ended', onEnded);
        element.addEventListener('loadedmetadata', onMeta);
        return () => {
            element.removeEventListener('timeupdate', onTime);
            element.removeEventListener('ended', onEnded);
            element.removeEventListener('loadedmetadata', onMeta);
        };
    }, [getGraph, isActive, activeToneId]);
    // Waveform, only while active and the engine is ready.
    useEffect(() => {
        if (!isActive || audioState.initState !== 'ready')
            return;
        const graph = getGraph();
        if (!graph || !visualizerRef.current)
            return;
        const { analyser, stop } = setupVisualizer(visualizerRef.current, graph.context);
        const disconnect = connectVisualizer(analyser);
        return () => {
            stop();
            disconnect();
        };
    }, [
        audioState.initState,
        getGraph,
        connectVisualizer,
        isActive,
        sourceMode,
        state.expanded,
        state.view,
    ]);
    // ---- Playback ------------------------------------------------------------
    const startLive = useCallback(async (toneId, sel) => {
        await init();
        await reconnectLiveInput();
        await syncToEngine(sel);
        setPlaying(true, compositeId(toneId));
        const deviceId = getGraph()?.live?.deviceId;
        emit({
            type: 'play',
            mode: 'live',
            toneId,
            selection: sel,
            device: audioInputDevices.devices.find(d => d.deviceId === deviceId)?.label ??
                null,
        });
    }, [
        init,
        reconnectLiveInput,
        syncToEngine,
        setPlaying,
        compositeId,
        getGraph,
        emit,
        audioInputDevices.devices,
    ]);
    const startDemo = useCallback(async (toneId, sel) => {
        await init();
        stopLiveInput();
        await loadAudio(sel.input.url);
        await syncToEngine(sel);
        setPlaying(true, compositeId(toneId));
        emit({ type: 'play', mode: 'demo', toneId, selection: sel });
    }, [
        init,
        stopLiveInput,
        loadAudio,
        syncToEngine,
        setPlaying,
        compositeId,
        emit,
    ]);
    const togglePlay = useCallback(async (toneIdArg) => {
        const toneId = toneIdArg ?? stateRef.current.activeToneId;
        if (isTonePlaying(toneId)) {
            setPlaying(false); // `pause` is emitted by the ownership effect
            return;
        }
        if (toneId !== stateRef.current.activeToneId) {
            dispatch({ type: 'tone/activate', toneId });
            emit({ type: 'tone_change', toneId });
        }
        setBusyToneId(toneId);
        setError(null);
        try {
            const { selection: sel } = await ensureTone(toneId);
            if (sourceMode === 'live')
                await startLive(toneId, sel);
            else
                await startDemo(toneId, sel);
        }
        catch (err) {
            setPlaying(false);
            fail('audio', err, toneId);
        }
        finally {
            setBusyToneId(null);
        }
    }, [
        isTonePlaying,
        setPlaying,
        emit,
        ensureTone,
        sourceMode,
        startLive,
        startDemo,
        fail,
    ]);
    /** Make a tone active; if this player is mid-playback, switch audibly. */
    const activateTone = useCallback(async (toneId) => {
        if (toneId === stateRef.current.activeToneId)
            return;
        if (isAnyTonePlaying) {
            await togglePlay(toneId);
            return;
        }
        dispatch({ type: 'tone/activate', toneId });
        emit({ type: 'tone_change', toneId });
        try {
            await ensureTone(toneId);
        }
        catch (err) {
            fail('assets', err, toneId);
        }
    }, [isAnyTonePlaying, togglePlay, emit, ensureTone, fail]);
    const step = useCallback(async (delta) => {
        const index = tones.findIndex(t => t.id === stateRef.current.activeToneId);
        const next = tones[index + delta];
        if (next)
            await activateTone(next.id);
    }, [tones, activateTone]);
    const prepareTone = useCallback(async (toneId) => {
        try {
            await ensureTone(toneId);
        }
        catch (err) {
            fail('assets', err, toneId);
        }
    }, [ensureTone, fail]);
    const skipToStart = useCallback(() => {
        const element = getGraph()?.element;
        if (element) {
            element.currentTime = 0;
            setCurrentTime(0);
        }
    }, [getGraph]);
    // ---- Panel ---------------------------------------------------------------
    const toggleBypass = useCallback(() => {
        const bypassed = !stateRef.current.bypassed;
        dispatch({ type: 'bypass/set', bypassed });
        if (isActive)
            setBypass(bypassed);
        emit({ type: 'bypass_change', bypassed });
    }, [isActive, setBypass, emit]);
    const userToggledExpand = useRef(false);
    const setExpanded = useCallback((expanded) => {
        userToggledExpand.current = true;
        if (expanded === stateRef.current.expanded)
            return;
        dispatch({ type: 'expanded/set', expanded });
        emit({ type: expanded ? 'expand' : 'collapse' });
    }, [emit]);
    // `defaultExpanded` seeds the initial state, but an embed only learns
    // whether its host can resize the frame after a short handshake, so honour
    // a late flip to `true` as long as the user hasn't touched the toggle.
    useEffect(() => {
        if (options.defaultExpanded &&
            !userToggledExpand.current &&
            !stateRef.current.expanded) {
            dispatch({ type: 'expanded/set', expanded: true });
        }
    }, [options.defaultExpanded]);
    // Whenever the controls are visible (always in `full`, when expanded in
    // `compact`) a lazy tone resolves so the selects aren't empty before play.
    const controlsVisible = options.layout === 'full' || state.expanded;
    useEffect(() => {
        if (controlsVisible && activeAssets.status === 'idle') {
            void prepareTone(activeToneId);
        }
    }, [controlsVisible, activeAssets.status, activeToneId, prepareTone]);
    const setView = useCallback((view) => {
        if (view === stateRef.current.view)
            return;
        dispatch({ type: 'view/set', view });
        emit({ type: 'view_change', view });
    }, [emit]);
    // ---- Selection -----------------------------------------------------------
    /** Apply a selection change: store it, announce it, and sync if we're live. */
    const select = useCallback(async (next, field) => {
        const toneId = activeToneId;
        const value = next[field];
        dispatch({ type: 'selection/set', toneId, field, value });
        emit({ type: 'selection_change', toneId, field, value });
        if (!isActive)
            return;
        try {
            if (field === 'input') {
                await loadAudio(next.input.url);
                setPlaying(true, compositeId(toneId));
            }
            else {
                await syncToEngine(next);
            }
        }
        catch (err) {
            const code = field === 'input' ? 'audio' : field === 'ir' ? 'ir' : 'model';
            fail(code, err, toneId);
        }
    }, [
        activeToneId,
        emit,
        isActive,
        loadAudio,
        setPlaying,
        compositeId,
        syncToEngine,
        fail,
    ]);
    const setModel = useCallback(async (url) => {
        const model = assets?.models.find(m => optionValue(m.url) === url);
        if (!model || !selection)
            return;
        await select({ ...selection, model }, 'model');
    }, [assets, selection, select]);
    const setIr = useCallback(async (url) => {
        const ir = assets?.irs.find(i => optionValue(i.url) === url);
        if (!ir || !selection)
            return;
        // The reducer drops `mix` with the IR; mirror it for the sync below.
        const { mix: _mix, ...rest } = selection;
        await select({ ...rest, ir }, 'ir');
    }, [assets, selection, select]);
    const setInput = useCallback(async (url) => {
        const input = assets?.inputs.find(i => i.url === url);
        if (!input || !selection)
            return;
        await select({ ...selection, input }, 'input');
    }, [assets, selection, select]);
    const setPreModel = useCallback(async (url) => {
        const preModel = assets?.preModels?.find(m => optionValue(m.url) === url);
        if (!preModel || !selection)
            return;
        await select({ ...selection, preModel }, 'preModel');
    }, [assets, selection, select]);
    // ---- Mix -----------------------------------------------------------------
    const setMix = useCallback((mix) => {
        if (!selection)
            return;
        const toneId = activeToneId;
        dispatch({ type: 'selection/set', toneId, field: 'mix', value: mix });
        emit({ type: 'selection_change', toneId, field: 'mix', value: mix });
        if (isActive)
            setIrMix(mix);
    }, [selection, activeToneId, emit, isActive, setIrMix]);
    // The engine knows the loaded IR's nature; before that, trust an explicit
    // `mix` and otherwise assume a cab (no knob) until it decodes.
    const engineHasIr = isActive && audioState.irUrl === selection?.ir.url;
    const mix = useMemo(() => {
        const ir = selection?.ir;
        const explicit = ir?.mix;
        const show = !!ir &&
            ir.url !== null &&
            (engineHasIr
                ? audioState.irReverbLike
                : explicit !== undefined && explicit < 1);
        const value = selection?.mix ??
            (engineHasIr ? audioState.irMix : (explicit ?? (show ? 0.5 : 1)));
        return { value, show, set: setMix };
    }, [
        selection,
        engineHasIr,
        audioState.irReverbLike,
        audioState.irMix,
        setMix,
    ]);
    const slotControl = useCallback((field) => {
        switch (field) {
            case 'model':
                return {
                    field,
                    options: modelOptions,
                    value: optionValue(selection?.model.url ?? null),
                    set: setModel,
                };
            case 'ir':
                return {
                    field,
                    options: irOptions,
                    value: optionValue(selection?.ir.url ?? null),
                    set: setIr,
                };
            case 'preModel':
                return {
                    field,
                    options: preModelOptions,
                    value: optionValue(selection?.preModel?.url ?? null),
                    set: setPreModel,
                };
        }
    }, [
        modelOptions,
        irOptions,
        preModelOptions,
        selection,
        setModel,
        setIr,
        setPreModel,
    ]);
    const primary = useMemo(() => slotControl(primaryField), [slotControl, primaryField]);
    const companion = useMemo(() => slotControl(companionField), [slotControl, companionField]);
    // ---- Source mode ---------------------------------------------------------
    const setSourceMode = useCallback(async (mode) => {
        if (mode === sourceMode)
            return;
        // The whole page changes source, so whatever is playing (a demo or
        // live monitoring, in any player) stops; its owner emits the `pause`.
        if (audioState.activePlayerId)
            setPlaying(false);
        setSharedSourceMode(mode, playerId);
        if (mode === 'live' && getGraph()) {
            try {
                await reconnectLiveInput();
            }
            catch (err) {
                fail('audio', err);
            }
        }
    }, [
        sourceMode,
        audioState.activePlayerId,
        setPlaying,
        setSharedSourceMode,
        playerId,
        getGraph,
        reconnectLiveInput,
        fail,
    ]);
    // Every player reports the page-wide switch and drops back to its controls
    // (a settings view open in one player shouldn't survive a tab change).
    const prevSourceModeRef = useRef(sourceMode);
    useEffect(() => {
        if (prevSourceModeRef.current === sourceMode)
            return;
        prevSourceModeRef.current = sourceMode;
        dispatch({ type: 'view/set', view: 'controls' });
        emit({ type: 'source_change', mode: sourceMode });
    }, [sourceMode, emit]);
    // Live setup (permission → interface). Monitoring starts when the user
    // picks an interface, not on the first automatic connection (see
    // useLiveSetup.onConnected): until then the input stays muted.
    const startMonitoring = useCallback(async () => {
        const toneId = stateRef.current.activeToneId;
        try {
            const { selection: sel } = await ensureTone(toneId);
            await startLive(toneId, sel);
        }
        catch (err) {
            fail('audio', err, toneId);
        }
    }, [ensureTone, startLive, fail]);
    // Only the player that switched the page to live auto-connects; the others
    // pick up the shared interface config.
    const live = useLiveSetup({
        enabled: sourceMode === 'live' && source.owner === playerId,
        onConnected: startMonitoring,
    });
    return {
        playerId,
        tones,
        activeToneId,
        activeIndex,
        activeTone,
        activeAssets,
        selection,
        previewMode,
        labels,
        primary,
        companion,
        mix,
        isActive,
        isTonePlaying,
        isBusy: busyToneId !== null,
        busyToneId,
        currentTime,
        duration,
        error,
        expanded: state.expanded,
        view: state.view,
        bypassed: state.bypassed,
        sourceMode,
        live,
        modelOptions,
        irOptions,
        inputOptions,
        preModelOptions,
        togglePlay,
        activateTone,
        step,
        skipToStart,
        toggleBypass,
        setExpanded,
        setView,
        setModel,
        setIr,
        setInput,
        setPreModel,
        setSourceMode,
        prepareTone,
        visualizerRef,
        canvasWrapperRef,
    };
}

/**
 * Reports the root element's rendered height whenever it changes. Integer px,
 * deduped. This is what the embed bridge forwards to a host page so an iframe
 * can follow the player.
 *
 * No requestAnimationFrame here on purpose: ResizeObserver already batches
 * per layout pass, and browsers pause rAF in offscreen iframes, which would
 * hold back the height of an embed until it scrolled into view.
 */
function useRootResize(ref, onResize) {
    useEffect(() => {
        const el = ref.current;
        if (!el || !onResize || typeof ResizeObserver === 'undefined')
            return;
        let last = -1;
        const report = () => {
            const height = Math.ceil(el.getBoundingClientRect().height);
            if (height !== last) {
                last = height;
                onResize(height);
            }
        };
        const ro = new ResizeObserver(report);
        ro.observe(el);
        report();
        return () => ro.disconnect();
    }, [ref, onResize]);
}

const Play = ({ size = 48 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M24 48C20.7216 48 17.6314 47.3726 14.7294 46.1176C11.8431 44.8627 9.29412 43.1294 7.08235 40.9176C4.87059 38.7059 3.13725 36.1569 1.88235 33.2706C0.627451 30.3686 0 27.2784 0 24C0 20.7216 0.627451 17.6392 1.88235 14.7529C3.13725 11.851 4.86275 9.29412 7.05882 7.08235C9.27059 4.87059 11.8196 3.13725 14.7059 1.88235C17.6078 0.627451 20.698 0 23.9765 0C27.2549 0 30.3451 0.627451 33.2471 1.88235C36.149 3.13725 38.7059 4.87059 40.9176 7.08235C43.1294 9.29412 44.8627 11.851 46.1176 14.7529C47.3726 17.6392 48 20.7216 48 24C48 27.2784 47.3726 30.3686 46.1176 33.2706C44.8627 36.1569 43.1294 38.7059 40.9176 40.9176C38.7059 43.1294 36.149 44.8627 33.2471 46.1176C30.3608 47.3726 27.2784 48 24 48ZM19.5294 33.4824L33.3647 25.3412C33.6941 25.1373 33.9137 24.8706 34.0235 24.5412C34.1333 24.1961 34.1333 23.8588 34.0235 23.5294C33.9137 23.1843 33.6941 22.9176 33.3647 22.7294L19.5294 14.5412C19.1843 14.3373 18.8235 14.251 18.4471 14.2824C18.0706 14.3137 17.749 14.4392 17.4824 14.6588C17.2314 14.8784 17.1059 15.1843 17.1059 15.5765V32.4471C17.1059 32.8392 17.2314 33.1529 17.4824 33.3882C17.7333 33.6235 18.0392 33.7569 18.4 33.7882C18.7765 33.8196 19.1529 33.7176 19.5294 33.4824Z', fill: 'var(--t3k-accent)' })));

const Pause = ({ size = 48 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M24 48C20.7216 48 17.6314 47.3726 14.7294 46.1176C11.8431 44.8627 9.29412 43.1294 7.08235 40.9176C4.87059 38.7059 3.13725 36.1569 1.88235 33.2706C0.627451 30.3686 0 27.2784 0 24C0 20.7216 0.627451 17.6392 1.88235 14.7529C3.13725 11.851 4.86275 9.29412 7.05882 7.08235C9.27059 4.87059 11.8196 3.13725 14.7059 1.88235C17.6078 0.627451 20.698 0 23.9765 0C27.2549 0 30.3451 0.627451 33.2471 1.88235C36.149 3.13725 38.7059 4.87059 40.9176 7.08235C43.1294 9.29412 44.8627 11.851 46.1176 14.7529C47.3726 17.6392 48 20.7216 48 24C48 27.2784 47.3726 30.3686 46.1176 33.2706C44.8627 36.1569 43.1294 38.7059 40.9176 40.9176C38.7059 43.1294 36.149 44.8627 33.2471 46.1176C30.3608 47.3726 27.2784 48 24 48ZM17.1529 33.4353H19.5529C20.149 33.4353 20.5882 33.2863 20.8706 32.9882C21.1529 32.6902 21.2941 32.3137 21.2941 31.8588V16.0941C21.2941 15.6235 21.1529 15.2392 20.8706 14.9412C20.5882 14.6431 20.149 14.4941 19.5529 14.4941H17.1529C16.5569 14.4941 16.1176 14.6431 15.8353 14.9412C15.5529 15.2392 15.4118 15.6235 15.4118 16.0941V31.8588C15.4118 32.3137 15.5529 32.6902 15.8353 32.9882C16.1176 33.2863 16.5569 33.4353 17.1529 33.4353ZM28.5176 33.4353H30.8941C31.4902 33.4353 31.9294 33.2863 32.2118 32.9882C32.4941 32.6902 32.6353 32.3137 32.6353 31.8588V16.0941C32.6353 15.6235 32.4941 15.2392 32.2118 14.9412C31.9294 14.6431 31.4902 14.4941 30.8941 14.4941H28.5176C27.9216 14.4941 27.4745 14.6431 27.1765 14.9412C26.8941 15.2392 26.7529 15.6235 26.7529 16.0941V31.8588C26.7529 32.3137 26.8941 32.6902 27.1765 32.9882C27.4745 33.2863 27.9216 33.4353 28.5176 33.4353Z', fill: 'var(--t3k-accent)' })));

const CircularLoader = ({ size = 40, color = 'var(--t3k-on-accent)', }) => {
    const circleSize = size - 20;
    const strokeWidth = 3;
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    return (React.createElement("div", { className: 'flex items-center justify-center animate-spin bg-accent rounded-full', style: { width: size, height: size } },
        React.createElement("svg", { width: circleSize, height: circleSize, viewBox: `0 0 ${circleSize} ${circleSize}`, style: { transform: 'rotate(-90deg)' } },
            React.createElement("circle", { cx: circleSize / 2, cy: circleSize / 2, r: radius, fill: 'none', stroke: color, strokeWidth: strokeWidth, strokeLinecap: 'round', strokeDasharray: circumference, strokeDashoffset: circumference * 0.75 }))));
};

/** The one play/pause/loading affordance used by every layout and row. */
const PlayButton = ({ isPlaying, isBusy = false, disabled = false, size = 48, onClick, label, }) => (React.createElement("button", { type: 'button', onClick: onClick, disabled: disabled, className: 'p-0 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg rounded-full disabled:cursor-not-allowed disabled:opacity-50', "aria-label": isPlaying
        ? `Pause${label ? ` ${label}` : ''}`
        : `Play${label ? ` ${label}` : ''}`, "aria-pressed": isPlaying, style: { width: size, height: size } }, isPlaying ? (React.createElement(Pause, { size: size })) : isBusy ? (React.createElement(CircularLoader, { size: size })) : (React.createElement(Play, { size: size }))));

/** A play/pause button and nothing else. Title (if any) is the aria label. */
const MiniLayout = ({ controller: c, status, size = 40, }) => (React.createElement(PlayButton, { size: size, isPlaying: c.isActive, isBusy: c.isBusy, disabled: status !== 'ready', onClick: () => void c.togglePlay(), label: c.activeTone.meta?.title }));

const Tabs = ({ tabs, activeTab, setActiveTab, disabled = false, fill = true, }) => {
    return (React.createElement("div", { className: `flex ${fill ? 'w-full' : 'gap-2 sm:gap-4'}`, role: 'tablist' }, tabs.map((tab, index) => {
        const active = index === activeTab;
        return (React.createElement("button", { key: index, type: 'button', role: 'tab', "aria-selected": active, disabled: disabled, className: `flex justify-center py-2 font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 disabled:cursor-not-allowed ${fill ? 'flex-1 px-4' : 'px-1'} ${active
                ? 'text-fg border-fg'
                : 'text-muted border-transparent hover:text-fg'}`, onClick: () => setActiveTab(index) }, tab));
    })));
};

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
const toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
const mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
const hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => createElement(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef(
    ({ className, ...props }, ref) => createElement(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$b = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
const ChevronDown = createLucideIcon("chevron-down", __iconNode$b);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$a = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]];
const ChevronLeft = createLucideIcon("chevron-left", __iconNode$a);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$9 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
const ChevronRight = createLucideIcon("chevron-right", __iconNode$9);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$8 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
const ChevronUp = createLucideIcon("chevron-up", __iconNode$8);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$7 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "1pkeuh" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "4dfq90" }]
];
const CircleAlert = createLucideIcon("circle-alert", __iconNode$7);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$6 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
];
const Info = createLucideIcon("info", __iconNode$6);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$5 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
const LoaderCircle = createLucideIcon("loader-circle", __iconNode$5);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$4 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
];
const Lock = createLucideIcon("lock", __iconNode$4);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$3 = [
  ["path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", key: "131961" }],
  ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", key: "1vc78b" }],
  ["line", { x1: "12", x2: "12", y1: "19", y2: "22", key: "x3vr5v" }]
];
const Mic = createLucideIcon("mic", __iconNode$3);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$2 = [
  [
    "path",
    {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      key: "1qme2f"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
];
const Settings = createLucideIcon("settings", __iconNode$2);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode$1 = [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
];
const TriangleAlert = createLucideIcon("triangle-alert", __iconNode$1);

/**
 * @license lucide-react v0.513.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */


const __iconNode = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
const X = createLucideIcon("x", __iconNode);

const variantStyles$1 = {
    error: { text: 'text-danger', Icon: TriangleAlert },
    warning: { text: 'text-warning', Icon: CircleAlert },
    info: { text: 'text-muted', Icon: Info },
};
/** One-line status message with a leading icon. Colors come from the tokens. */
const Alert = ({ variant, children, className = '', }) => {
    const { text, Icon } = variantStyles$1[variant];
    return (React.createElement("div", { role: variant === 'error' ? 'alert' : 'status', className: `flex items-start gap-2 text-sm ${text} ${className}` },
        React.createElement(Icon, { size: 18, className: 'flex-shrink-0 mt-0.5', "aria-hidden": 'true' }),
        React.createElement("div", { className: 'flex flex-col gap-1 min-w-0' }, children)));
};

const variantStyles = {
    primary: 't3k-btn-primary border border-transparent',
    secondary: 'bg-transparent text-fg border border-fg',
    ghost: 'bg-transparent text-link border border-transparent hover:underline',
};
const sizeStyles = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-5 text-sm',
};
/**
 * Pill button. `primary` is filled with `--t3k-primary` (the TONE3000
 * blue), `secondary` outlined. `fullWidth` fills its container; callers
 * cap the container (or pass `max-w-*` in `className`) so a wide panel
 * doesn't get a panel-wide pill.
 */
const Button = ({ variant = 'primary', size = 'md', fullWidth = false, children, leftIcon, className = '', type = 'button', ...props }) => (React.createElement("button", { type: type, className: `items-center justify-center gap-2 font-semibold rounded-full whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-link disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? 'flex w-full' : 'inline-flex'} ${className}`, ...props },
    leftIcon && (React.createElement("span", { className: 'flex-shrink-0', "aria-hidden": 'true' }, leftIcon)),
    children));

/**
 * Audio metering utilities for real-time level calculation
 */
/** Threshold for clip detection (slightly below 1.0 to catch near-clips) */
const CLIP_THRESHOLD = 0.99;
/**
 * Calculate peak and RMS levels from an AnalyserNode
 *
 * @param analyser - The AnalyserNode to read from
 * @param buffer - A reusable Float32Array buffer (should be analyser.fftSize length)
 * @returns Peak and RMS levels
 */
function calculateLevels(analyser, buffer) {
    analyser.getFloatTimeDomainData(buffer);
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
        const absSample = Math.abs(buffer[i]);
        if (absSample > peak)
            peak = absSample;
        sumSquares += buffer[i] * buffer[i];
    }
    return {
        peak,
        rms: Math.sqrt(sumSquares / buffer.length),
    };
}
/**
 * Convert linear amplitude to decibels
 *
 * @param linear - Linear amplitude (0.0 to 1.0+)
 * @returns Decibel value (-Infinity for silence)
 */
function linearToDb(linear) {
    if (linear <= 0)
        return -Infinity;
    return 20 * Math.log10(linear);
}
/**
 * Check if the given levels indicate clipping
 *
 * @param levels - Meter levels to check
 * @returns True if peak exceeds clip threshold
 */
function isClipping(levels) {
    return levels.peak >= CLIP_THRESHOLD;
}
/**
 * Clamp a value between min and max
 */
function clamp$1(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Map a linear level (0-1) to a display value with pseudo-logarithmic scaling
 * This makes the meter more visually responsive across the dynamic range
 *
 * @param level - Linear level (0.0 to 1.0)
 * @returns Scaled display value (0.0 to 1.0)
 */
function scaleForDisplay(level) {
    // Simple power curve - makes quiet signals more visible
    // Adjust exponent for different response curves (0.5 = square root, more responsive to quiet)
    return Math.pow(clamp$1(level, 0, 1), 0.5);
}
/** dB floor for log-scaled meters (-40 dB ≈ 0.01 linear) */
const LOG_METER_DB_MIN = -40;
/**
 * Map a linear level (0-1) to a pseudo-log display value (0-1) for block meters.
 * Uses dB scaling so blocks fill left-to-right in a log-like manner:
 * quiet levels fill fewer blocks, loud levels fill more, clipping = full bar.
 *
 * @param level - Linear level (0.0 to 1.0+)
 * @returns Display value 0.0 to 1.0
 */
function levelToLogDisplay(level) {
    if (level <= 0)
        return 0;
    const db = linearToDb(level);
    const normalized = (db - LOG_METER_DB_MIN) / (0 - LOG_METER_DB_MIN);
    return clamp$1(normalized, 0, 1);
}

const BLOCK_SIZE = 6;
const BLOCK_GAP = 3;
const INACTIVE_COLOR = 'var(--t3k-line)';
// As many square blocks as fit the width, so they never stretch.
function getBlockCountForWidth(width) {
    return Math.max(4, Math.floor((width + BLOCK_GAP) / (BLOCK_SIZE + BLOCK_GAP)));
}
// Interpolate color along gradient: blue (left) → yellow (middle) → red (right)
const getGradientColor = (position) => {
    let r, g, b;
    if (position <= 0.5) {
        const t = position * 2;
        r = Math.round(255 * t);
        g = Math.round(255 * t);
        b = Math.round(255 * (1 - t));
    }
    else {
        const t = (position - 0.5) * 2;
        r = 255;
        g = Math.round(255 * (1 - t));
        b = 0;
    }
    return `rgb(${r}, ${g}, ${b})`;
};
// Grayscale gradient for inactive state: dark (left) → light (right)
const getGrayscaleColor = (position) => {
    const v = Math.round(90 + position * 100); // ~90 to ~190
    return `rgb(${v}, ${v}, ${v})`;
};
/**
 * A horizontal block-style audio level meter.
 *
 * Like DbMeter but horizontal: each block is active or inactive based on level.
 * Level 1 = full bar (all blocks active), level 0 = empty (all blocks inactive).
 *
 * Usage:
 * ```tsx
 * <InputMeter analyser={nodes.inputMeterNode} inactive={!isReady} />
 * ```
 */
const InputMeter = ({ analyser, blockCount: blockCountProp, className = '', label = 'Input level', inactive = false, }) => {
    const [level, setLevel] = useState(0);
    const [blockCount, setBlockCount] = useState(12);
    const containerRef = useRef(null);
    const animationFrameRef = useRef(undefined);
    const isRunningRef = useRef(false);
    const bufferRef = useRef(new Float32Array(2048));
    // Responsive block count from container width
    useEffect(() => {
        const el = containerRef.current;
        if (!el || blockCountProp !== undefined)
            return;
        const updateBlockCount = (width) => setBlockCount(getBlockCountForWidth(width));
        updateBlockCount(el.getBoundingClientRect().width);
        const ro = new ResizeObserver(entries => {
            const { width } = entries[0]?.contentRect ?? { width: 0 };
            updateBlockCount(width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [blockCountProp]);
    const effectiveBlockCount = blockCountProp ?? blockCount;
    // Convert level (0-1) to last active block index; index <= activeBlockIndex means active
    // Use pseudo-log display so blocks fill left-to-right in a log-like manner
    const activeBlockIndex = useMemo(() => {
        const display = levelToLogDisplay(level);
        if (display <= 0)
            return -1;
        const idx = Math.floor(display * effectiveBlockCount) - 1;
        return Math.max(-1, Math.min(effectiveBlockCount - 1, idx));
    }, [level, effectiveBlockCount]);
    useEffect(() => {
        if (!analyser) {
            setLevel(0);
            return;
        }
        if (isRunningRef.current)
            return;
        isRunningRef.current = true;
        const updateMeter = () => {
            if (!isRunningRef.current)
                return;
            try {
                const levels = calculateLevels(analyser, bufferRef.current);
                // Use peak so block fill matches clip indicator (both use peak; RMS would show ~half when clipping)
                setLevel(clamp$1(levels.peak, 0, 1));
            }
            catch {
                // Silently handle errors
            }
            if (isRunningRef.current) {
                animationFrameRef.current = requestAnimationFrame(updateMeter);
            }
        };
        updateMeter();
        return () => {
            isRunningRef.current = false;
            if (animationFrameRef.current !== undefined) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
        };
    }, [analyser]);
    const blocks = useMemo(() => {
        return Array.from({ length: effectiveBlockCount }, (_, i) => i);
    }, [effectiveBlockCount]);
    return (React.createElement("div", { ref: containerRef, className: `flex items-center flex-1 min-w-0 ${className}`, role: 'meter', "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(level * 100) },
        React.createElement("div", { className: 'flex flex-1 min-w-0', style: {
                gap: BLOCK_GAP,
                justifyContent: blockCountProp !== undefined ? 'space-between' : 'flex-start',
            } }, blocks.map(index => {
            const isActive = index <= activeBlockIndex;
            const position = effectiveBlockCount > 1 ? index / (effectiveBlockCount - 1) : 0;
            const color = isActive
                ? inactive
                    ? getGrayscaleColor(position)
                    : getGradientColor(position)
                : INACTIVE_COLOR;
            return (React.createElement("div", { key: index, style: {
                    width: BLOCK_SIZE,
                    height: BLOCK_SIZE,
                    backgroundColor: color,
                    flexShrink: 0,
                } }));
        }))));
};
InputMeter.displayName = 'InputMeter';

const InterfaceIcon = ({ size = 20 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M8.3335 13.3333H8.34183', stroke: 'currentColor', strokeWidth: '1.66667', strokeLinecap: 'round', strokeLinejoin: 'round' }),
    React.createElement("path", { d: 'M1.84341 9.64749C1.72726 9.87926 1.66677 10.1349 1.66675 10.3942V15C1.66675 15.442 1.84234 15.8659 2.1549 16.1785C2.46746 16.4911 2.89139 16.6667 3.33341 16.6667H16.6667C17.1088 16.6667 17.5327 16.4911 17.8453 16.1785C18.1578 15.8659 18.3334 15.442 18.3334 15V10.3942C18.3334 10.1349 18.2729 9.87926 18.1567 9.64749L15.4584 4.25833C15.3204 3.98065 15.1077 3.74697 14.8442 3.58356C14.5807 3.42015 14.2768 3.33349 13.9667 3.33333H6.03341C5.72334 3.33349 5.41947 3.42015 5.15595 3.58356C4.89244 3.74697 4.67973 3.98065 4.54175 4.25833L1.84341 9.64749Z', stroke: 'currentColor', strokeWidth: '1.66667', strokeLinecap: 'round', strokeLinejoin: 'round' }),
    React.createElement("path", { d: 'M18.2886 10.0108H1.71191', stroke: 'currentColor', strokeWidth: '1.66667', strokeLinecap: 'round', strokeLinejoin: 'round' }),
    React.createElement("path", { d: 'M5 13.3333H5.00833', stroke: 'currentColor', strokeWidth: '1.66667', strokeLinecap: 'round', strokeLinejoin: 'round' })));

/**
 * A styled native `<select>`. The popup is drawn by the OS, so it escapes
 * iframe bounds and needs no outside-click, keyboard, or portal handling.
 */
const NativeSelect = ({ options, value, onChange, label, ariaLabel, disabled = false, variant = 'field', className = '', }) => {
    const id = useId();
    const hasValue = options.some(o => o.value === value);
    const current = hasValue ? value : (options[0]?.value ?? '');
    const currentLabel = options.find(o => o.value === current)?.label ?? '';
    const select = (extra) => (React.createElement("select", { id: id, className: extra, value: current, onChange: e => void onChange(e.target.value), disabled: disabled, "aria-label": !label ? ariaLabel : undefined }, options.map(option => (React.createElement("option", { key: option.value, value: option.value }, option.label)))));
    if (variant === 'inline') {
        // The visible text sizes the control; the real <select> sits on top of
        // it, transparent, so clicks and keyboard focus land on the native one.
        return (React.createElement("span", { className: `inline-flex items-baseline gap-1 min-w-0 max-w-full ${className}` },
            label && (React.createElement("label", { htmlFor: id, className: 'text-muted flex-shrink-0' }, label)),
            React.createElement("span", { className: `relative inline-flex items-center gap-0.5 min-w-0 rounded-sm focus-within:ring-2 focus-within:ring-fg ${disabled
                    ? 'text-muted cursor-not-allowed'
                    : 'text-link cursor-pointer'}` },
                React.createElement("span", { className: 'truncate font-medium' }, currentLabel),
                React.createElement(ChevronDown, { size: 14, "aria-hidden": 'true', className: 'flex-shrink-0' }),
                select('t3k-select absolute inset-0 w-full h-full opacity-0 cursor-[inherit]'))));
    }
    return (React.createElement("div", { className: `flex flex-col w-full ${className}` },
        label && (React.createElement("label", { htmlFor: id, className: 'text-sm text-muted pb-1' }, label)),
        React.createElement("div", { className: 'relative' },
            select(`t3k-select w-full px-4 py-3 pr-11 text-md text-fg border border-line rounded-md focus:outline-none focus-visible:border-fg truncate ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`),
            React.createElement(ChevronDown, { size: 24, "aria-hidden": 'true', className: 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg' }))));
};

/**
 * A radio button matching the design: selected = white inner dot with dark grey
 * ring; unselected = thin light grey outline, transparent interior.
 */
const Radio = ({ checked, onChange, value, name, label, className = '', disabled, ...props }) => {
    const content = (React.createElement(React.Fragment, null,
        React.createElement("span", { className: `
          flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0
          transition-colors duration-150
          ${checked
                ? 'border border-fg bg-transparent'
                : 'border border-line-strong bg-transparent'}
          ${disabled ? 'opacity-50' : ''}
        `, "aria-hidden": true }, checked && React.createElement("span", { className: 'w-3 h-3 rounded-full bg-accent' })),
        React.createElement("input", { type: 'radio', name: name, value: value, checked: checked, onChange: onChange, disabled: disabled, className: 'sr-only', ...props }),
        label != null && React.createElement("span", { className: 'text-sm text-muted-2' }, label)));
    if (label != null) {
        return (React.createElement("label", { className: `flex items-center gap-3 cursor-pointer ${disabled ? 'cursor-not-allowed' : ''} ${className}` }, content));
    }
    return React.createElement("div", { className: `flex items-center ${className}` }, content);
};
Radio.displayName = 'Radio';

const ToggleSimple = ({ isChecked, onChange, disabled = false, label, ariaLabel, }) => {
    const handleToggle = () => {
        const newValue = !isChecked;
        onChange(newValue);
    };
    return (React.createElement("label", { className: `flex flex-col gap-1 ${disabled ? 'touch-none cursor-not-allowed' : 'cursor-pointer'}` },
        label && React.createElement("span", { className: `text-sm text-muted` }, label),
        React.createElement("div", { className: 'relative' },
            React.createElement("input", { type: 'checkbox', className: 'sr-only', checked: isChecked, onChange: handleToggle, disabled: disabled, "aria-label": ariaLabel }),
            React.createElement("div", { className: `w-10 h-6 ${isChecked ? 'bg-toggle-on' : 'bg-toggle-off'} rounded-full shadow-inner transition-colors duration-300 ease-in-out` }),
            React.createElement("div", { className: `absolute w-4 h-4 bg-toggle-knob rounded-full shadow top-1 left-1 transition-transform duration-300 ease-in-out ${isChecked ? 'transform translate-x-full' : ''}` }))));
};

const Privacy = () => (React.createElement("p", { className: 'flex items-start gap-2 text-sm text-muted' },
    React.createElement(Lock, { size: 16, "aria-hidden": 'true', className: 'flex-shrink-0 mt-0.5' }),
    "Audio is processed locally and never leaves your device."));
function BlockedSteps({ browser }) {
    const steps = {
        chrome: [
            'Chrome',
            [
                'Click the site controls icon to the left of the address bar',
                'Set Microphone to Allow',
                'Refresh the page',
            ],
        ],
        edge: [
            'Edge',
            [
                'Click the icon to the left of the address bar',
                'Open Permissions for this site and set Microphone to Allow',
                'Refresh the page',
            ],
        ],
        firefox: [
            'Firefox',
            [
                'Click the icon to the left of the address bar',
                'Under Permissions, set Use the Microphone to Allow',
                'Refresh the page',
            ],
        ],
        safari: [
            'Safari',
            [
                'In the menu bar choose Safari → Settings for This Website…',
                'Set Microphone to Allow',
                'Refresh the page',
            ],
        ],
        other: [
            'your browser',
            [
                'Open the site settings next to the address bar',
                'Set Microphone to Allow',
                'Refresh the page',
            ],
        ],
    };
    const [name, list] = steps[browser];
    return (React.createElement(React.Fragment, null,
        React.createElement("p", null,
            "To turn it back on in ",
            name,
            ":"),
        React.createElement("ol", { className: 'list-decimal list-inside space-y-1 text-fg' }, list.map(step => (React.createElement("li", { key: step }, step))))));
}
/**
 * The "Microphone Access" step of the live wizard: what to click in the
 * browser prompt, the Allow button, and per-browser steps if it's blocked.
 */
const MicPermission = ({ live, disabled = false, href, linkTarget = '_blank', }) => {
    const pending = live.permission === 'pending';
    const blocked = live.permission === 'blocked';
    const retryable = live.permission === 'denied' || live.permission === 'error';
    return (
    // One left-aligned column, as wide as the Allow button: steps, alerts,
    // button and privacy note line up instead of the text running panel-wide.
    React.createElement("div", { className: 'flex flex-col gap-4 w-full max-w-md' },
        React.createElement("div", { className: 'text-muted-2' },
            "Allow microphone access to connect your interface:",
            React.createElement("ol", { className: 'list-decimal list-inside mt-2 space-y-1 text-fg' },
                React.createElement("li", null, "\"Allow Microphone\""),
                React.createElement("li", null, "\"Allow while visiting the site\""))),
        blocked && (React.createElement(Alert, { variant: 'error' },
            React.createElement("span", { className: 'font-semibold' }, "Microphone is blocked for this site"),
            React.createElement(BlockedSteps, { browser: getBrowserName() }),
            isFramed && (
            // Firefox/Safari can't tell us whether it's the user or the
            // embedding page that said no.
            React.createElement("p", { className: 'pt-1' },
                "If this player is embedded in another site, that site also has to allow microphone access",
                href ? (React.createElement(React.Fragment, null,
                    ' ',
                    "\u2014 or",
                    ' ',
                    React.createElement("a", { href: href, target: linkTarget, rel: 'noopener noreferrer', className: 'underline text-fg' }, "open the tone on TONE3000"))) : null,
                ".")))),
        retryable && (React.createElement(Alert, { variant: 'error' }, live.error ??
            'Microphone access was denied. Try again and choose "Allow".')),
        blocked ? (React.createElement(Button, { variant: 'secondary', fullWidth: true, onClick: () => window.location.reload(), disabled: disabled }, "Refresh page")) : (React.createElement(Button, { variant: 'primary', fullWidth: true, leftIcon: pending ? (React.createElement(LoaderCircle, { size: 18, className: 'animate-spin' })) : (React.createElement(Mic, { size: 18 })), onClick: () => void live.connect(), disabled: disabled || pending }, pending ? 'Asking for permission…' : 'Allow Microphone')),
        React.createElement(Privacy, null)));
};

/** Bold heading + muted helper line above a control. */
const Field = ({ heading, helper, children, }) => (React.createElement("div", { className: 'flex flex-col gap-2' },
    React.createElement("div", { className: 'flex flex-col' },
        React.createElement("span", { className: 'font-semibold text-fg' }, heading),
        React.createElement("span", { className: 'text-sm text-muted-2' }, helper)),
    children));
/** Stand-in for a select while the engine / interface is coming up. */
const Initializing = () => (React.createElement("div", { className: 'flex items-center justify-between w-full px-4 py-3 text-md border border-line rounded-md opacity-50 cursor-wait', role: 'status' },
    React.createElement("span", { className: 'truncate' }, "Initializing audio\u2026"),
    React.createElement(LoaderCircle, { size: 20, className: 'text-muted flex-shrink-0 animate-spin', "aria-hidden": 'true' })));
/**
 * The inline live-setup wizard: microphone permission, then the audio
 * interface (device, input channel, output, monitoring) with a Done button.
 * Lives where the controls do, so it works inside an iframe without a modal.
 */
const AudioSettings = ({ controller: c, onClose, disabled = false, href, linkTarget, }) => {
    const { getGraph } = useT3kPlayerContext();
    const { live } = c;
    const permissionStep = live.permission !== 'granted';
    const config = live.config;
    const connecting = live.status === 'connecting';
    const channelCount = config?.channelCount ?? 0;
    const multi = channelCount >= 2;
    const meters = getGraph()?.liveMeters ?? null;
    const hearing = c.isActive;
    const setHearing = (on) => {
        if (on !== hearing)
            void c.togglePlay();
    };
    const header = (React.createElement("div", { className: 'flex items-center justify-between' },
        React.createElement("div", { className: 'flex items-center gap-3' },
            permissionStep ? React.createElement(Info, { size: 22 }) : React.createElement(Settings, { size: 22 }),
            React.createElement("h3", { className: 'text-lg font-semibold text-fg' }, permissionStep ? 'Microphone Access' : 'Settings')),
        React.createElement("button", { type: 'button', onClick: onClose, disabled: live.permission === 'pending', className: 'text-muted hover:text-fg p-1 -m-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:cursor-not-allowed', "aria-label": 'Close settings' },
            React.createElement(X, { size: 22 }))));
    if (permissionStep) {
        return (React.createElement("div", { className: 'flex flex-col gap-5' },
            header,
            React.createElement(MicPermission, { live: live, disabled: disabled, href: href, linkTarget: linkTarget })));
    }
    // Only after an enumeration came back empty — not merely "list still
    // empty", which is also true for a tick after the permission prompt.
    const noDevices = live.status === 'no-device';
    return (React.createElement("div", { className: 'flex flex-col gap-5' },
        header,
        noDevices ? (React.createElement("div", { className: 'flex flex-col gap-4' },
            React.createElement(Alert, { variant: 'error' }, "No audio interface found. Plug one in, then try again."),
            React.createElement("div", null,
                React.createElement(Button, { variant: 'secondary', onClick: () => void live.refreshDevices().then(live.connect), disabled: disabled }, "Refresh devices")))) : (React.createElement("div", { className: 'flex flex-col gap-4 w-full border border-line rounded-lg p-4' },
            React.createElement("div", { className: 'flex items-center gap-3 text-fg' },
                React.createElement(InterfaceIcon, { size: 20 }),
                React.createElement("h4", { className: 'font-mono font-semibold' }, "AUDIO INTERFACE")),
            React.createElement(Field, { heading: 'Select Interface', helper: 'Plug your instrument into Input 1 or 2 of your interface.' }, connecting ? (React.createElement(Initializing, null)) : (React.createElement(NativeSelect, { ariaLabel: 'Audio interface', options: live.devices.map(d => ({
                    label: d.label,
                    value: d.deviceId,
                })), value: config?.deviceId ?? '', 
                // Picking an interface connects it and unmutes (see
                // useLiveSetup.onConnected) so you hear it right away.
                onChange: live.selectDevice, disabled: disabled }))),
            !multi && config && isSafari && (React.createElement(Alert, { variant: 'warning' }, "Safari hears Input 1 only. Chrome and Firefox can use more inputs.")),
            live.error && React.createElement(Alert, { variant: 'error' }, live.error),
            multi && (React.createElement(Field, { heading: 'Input Channel', helper: 'Play your instrument and select the channel with signal.' },
                React.createElement("div", { className: 'flex flex-col gap-2 mt-1' }, Array.from({ length: channelCount }, (_, i) => {
                    const selected = config?.channel === i;
                    return (React.createElement("label", { key: i, className: 'flex items-center gap-3 min-w-0 cursor-pointer' },
                        React.createElement(Radio, { name: `t3k-input-channel-${c.playerId}`, value: String(i), checked: selected, onChange: () => live.selectChannel(i), disabled: disabled }),
                        React.createElement("span", { className: 'text-sm text-fg w-4 tabular-nums' }, i + 1),
                        React.createElement(InputMeter, { analyser: meters?.[i] ?? null, label: `Input ${i + 1} level`, inactive: !selected, className: 'flex-1 min-w-0' })));
                })))))),
        speakerSelectionAllowedByPolicy() !== false && (React.createElement(Field, { heading: 'Output Device', helper: 'Select where you want to hear the sound.' }, connecting ? (React.createElement(Initializing, null)) : (React.createElement(NativeSelect, { ariaLabel: 'Output device', options: [
                { label: 'System Default', value: '' },
                ...live.outputDevices.map(d => ({
                    label: d.label,
                    value: d.deviceId,
                })),
            ], value: live.selectedOutputDeviceId ?? '', onChange: value => live.setOutputDevice(value === '' ? null : value), disabled: disabled })))),
        React.createElement(Field, { heading: 'Input Monitoring', helper: 'Hear your instrument while playing.' },
            React.createElement("div", { className: 'flex items-center justify-between w-full px-4 py-3 border border-line rounded-lg' },
                React.createElement("span", { className: 'text-fg' }, "Hear Yourself"),
                React.createElement(ToggleSimple, { label: '', isChecked: hearing, onChange: setHearing, ariaLabel: 'Hear yourself', disabled: disabled || connecting || !config }))),
        React.createElement(Button, { variant: 'primary', fullWidth: true, className: 'max-w-sm mx-auto', onClick: onClose, disabled: disabled || !config }, "Done")));
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}
const V = {
  toVector(v, fallback) {
    if (v === undefined) v = fallback;
    return Array.isArray(v) ? v : [v, v];
  },
  add(v1, v2) {
    return [v1[0] + v2[0], v1[1] + v2[1]];
  },
  sub(v1, v2) {
    return [v1[0] - v2[0], v1[1] - v2[1]];
  },
  addTo(v1, v2) {
    v1[0] += v2[0];
    v1[1] += v2[1];
  },
  subTo(v1, v2) {
    v1[0] -= v2[0];
    v1[1] -= v2[1];
  }
};
function rubberband(distance, dimension, constant) {
  if (dimension === 0 || Math.abs(dimension) === Infinity) return Math.pow(distance, constant * 5);
  return distance * dimension * constant / (dimension + constant * distance);
}
function rubberbandIfOutOfBounds(position, min, max, constant = 0.15) {
  if (constant === 0) return clamp(position, min, max);
  if (position < min) return -rubberband(min - position, max - min, constant) + min;
  if (position > max) return +rubberband(position - max, max - min, constant) + max;
  return position;
}
function computeRubberband(bounds, [Vx, Vy], [Rx, Ry]) {
  const [[X0, X1], [Y0, Y1]] = bounds;
  return [rubberbandIfOutOfBounds(Vx, X0, X1, Rx), rubberbandIfOutOfBounds(Vy, Y0, Y1, Ry)];
}

function _toPrimitive(input, hint) {
  if (typeof input !== "object" || input === null) return input;
  var prim = input[Symbol.toPrimitive];
  if (prim !== undefined) {
    var res = prim.call(input, hint || "default");
    if (typeof res !== "object") return res;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (hint === "string" ? String : Number)(input);
}

function _toPropertyKey(arg) {
  var key = _toPrimitive(arg, "string");
  return typeof key === "symbol" ? key : String(key);
}

function _defineProperty(obj, key, value) {
  key = _toPropertyKey(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function (r) {
      return Object.getOwnPropertyDescriptor(e, r).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), !0).forEach(function (r) {
      _defineProperty(e, r, t[r]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) {
      Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
    });
  }
  return e;
}

const EVENT_TYPE_MAP = {
  pointer: {
    start: 'down',
    change: 'move',
    end: 'up'
  },
  mouse: {
    start: 'down',
    change: 'move',
    end: 'up'
  },
  touch: {
    start: 'start',
    change: 'move',
    end: 'end'
  },
  gesture: {
    start: 'start',
    change: 'change',
    end: 'end'
  }
};
function capitalize(string) {
  if (!string) return '';
  return string[0].toUpperCase() + string.slice(1);
}
const actionsWithoutCaptureSupported = ['enter', 'leave'];
function hasCapture(capture = false, actionKey) {
  return capture && !actionsWithoutCaptureSupported.includes(actionKey);
}
function toHandlerProp(device, action = '', capture = false) {
  const deviceProps = EVENT_TYPE_MAP[device];
  const actionKey = deviceProps ? deviceProps[action] || action : action;
  return 'on' + capitalize(device) + capitalize(actionKey) + (hasCapture(capture, actionKey) ? 'Capture' : '');
}
const pointerCaptureEvents = ['gotpointercapture', 'lostpointercapture'];
function parseProp(prop) {
  let eventKey = prop.substring(2).toLowerCase();
  const passive = !!~eventKey.indexOf('passive');
  if (passive) eventKey = eventKey.replace('passive', '');
  const captureKey = pointerCaptureEvents.includes(eventKey) ? 'capturecapture' : 'capture';
  const capture = !!~eventKey.indexOf(captureKey);
  if (capture) eventKey = eventKey.replace('capture', '');
  return {
    device: eventKey,
    capture,
    passive
  };
}
function toDomEventType(device, action = '') {
  const deviceProps = EVENT_TYPE_MAP[device];
  const actionKey = deviceProps ? deviceProps[action] || action : action;
  return device + actionKey;
}
function isTouch(event) {
  return 'touches' in event;
}
function getPointerType(event) {
  if (isTouch(event)) return 'touch';
  if ('pointerType' in event) return event.pointerType;
  return 'mouse';
}
function getCurrentTargetTouchList(event) {
  return Array.from(event.touches).filter(e => {
    var _event$currentTarget, _event$currentTarget$;
    return e.target === event.currentTarget || ((_event$currentTarget = event.currentTarget) === null || _event$currentTarget === void 0 || (_event$currentTarget$ = _event$currentTarget.contains) === null || _event$currentTarget$ === void 0 ? void 0 : _event$currentTarget$.call(_event$currentTarget, e.target));
  });
}
function getTouchList(event) {
  return event.type === 'touchend' || event.type === 'touchcancel' ? event.changedTouches : event.targetTouches;
}
function getValueEvent(event) {
  return isTouch(event) ? getTouchList(event)[0] : event;
}
function touchIds(event) {
  return getCurrentTargetTouchList(event).map(touch => touch.identifier);
}
function pointerId(event) {
  const valueEvent = getValueEvent(event);
  return isTouch(event) ? valueEvent.identifier : valueEvent.pointerId;
}
function pointerValues(event) {
  const valueEvent = getValueEvent(event);
  return [valueEvent.clientX, valueEvent.clientY];
}
function getEventDetails(event) {
  const payload = {};
  if ('buttons' in event) payload.buttons = event.buttons;
  if ('shiftKey' in event) {
    const {
      shiftKey,
      altKey,
      metaKey,
      ctrlKey
    } = event;
    Object.assign(payload, {
      shiftKey,
      altKey,
      metaKey,
      ctrlKey
    });
  }
  return payload;
}

function call(v, ...args) {
  if (typeof v === 'function') {
    return v(...args);
  } else {
    return v;
  }
}
function noop() {}
function chain(...fns) {
  if (fns.length === 0) return noop;
  if (fns.length === 1) return fns[0];
  return function () {
    let result;
    for (const fn of fns) {
      result = fn.apply(this, arguments) || result;
    }
    return result;
  };
}
function assignDefault(value, fallback) {
  return Object.assign({}, fallback, value || {});
}

const BEFORE_LAST_KINEMATICS_DELAY = 32;
class Engine {
  constructor(ctrl, args, key) {
    this.ctrl = ctrl;
    this.args = args;
    this.key = key;
    if (!this.state) {
      this.state = {};
      this.computeValues([0, 0]);
      this.computeInitial();
      if (this.init) this.init();
      this.reset();
    }
  }
  get state() {
    return this.ctrl.state[this.key];
  }
  set state(state) {
    this.ctrl.state[this.key] = state;
  }
  get shared() {
    return this.ctrl.state.shared;
  }
  get eventStore() {
    return this.ctrl.gestureEventStores[this.key];
  }
  get timeoutStore() {
    return this.ctrl.gestureTimeoutStores[this.key];
  }
  get config() {
    return this.ctrl.config[this.key];
  }
  get sharedConfig() {
    return this.ctrl.config.shared;
  }
  get handler() {
    return this.ctrl.handlers[this.key];
  }
  reset() {
    const {
      state,
      shared,
      ingKey,
      args
    } = this;
    shared[ingKey] = state._active = state.active = state._blocked = state._force = false;
    state._step = [false, false];
    state.intentional = false;
    state._movement = [0, 0];
    state._distance = [0, 0];
    state._direction = [0, 0];
    state._delta = [0, 0];
    state._bounds = [[-Infinity, Infinity], [-Infinity, Infinity]];
    state.args = args;
    state.axis = undefined;
    state.memo = undefined;
    state.elapsedTime = state.timeDelta = 0;
    state.direction = [0, 0];
    state.distance = [0, 0];
    state.overflow = [0, 0];
    state._movementBound = [false, false];
    state.velocity = [0, 0];
    state.movement = [0, 0];
    state.delta = [0, 0];
    state.timeStamp = 0;
  }
  start(event) {
    const state = this.state;
    const config = this.config;
    if (!state._active) {
      this.reset();
      this.computeInitial();
      state._active = true;
      state.target = event.target;
      state.currentTarget = event.currentTarget;
      state.lastOffset = config.from ? call(config.from, state) : state.offset;
      state.offset = state.lastOffset;
      state.startTime = state.timeStamp = event.timeStamp;
    }
  }
  computeValues(values) {
    const state = this.state;
    state._values = values;
    state.values = this.config.transform(values);
  }
  computeInitial() {
    const state = this.state;
    state._initial = state._values;
    state.initial = state.values;
  }
  compute(event) {
    const {
      state,
      config,
      shared
    } = this;
    state.args = this.args;
    let dt = 0;
    if (event) {
      state.event = event;
      if (config.preventDefault && event.cancelable) state.event.preventDefault();
      state.type = event.type;
      shared.touches = this.ctrl.pointerIds.size || this.ctrl.touchIds.size;
      shared.locked = !!document.pointerLockElement;
      Object.assign(shared, getEventDetails(event));
      shared.down = shared.pressed = shared.buttons % 2 === 1 || shared.touches > 0;
      dt = event.timeStamp - state.timeStamp;
      state.timeStamp = event.timeStamp;
      state.elapsedTime = state.timeStamp - state.startTime;
    }
    if (state._active) {
      const _absoluteDelta = state._delta.map(Math.abs);
      V.addTo(state._distance, _absoluteDelta);
    }
    if (this.axisIntent) this.axisIntent(event);
    const [_m0, _m1] = state._movement;
    const [t0, t1] = config.threshold;
    const {
      _step,
      values
    } = state;
    if (config.hasCustomTransform) {
      if (_step[0] === false) _step[0] = Math.abs(_m0) >= t0 && values[0];
      if (_step[1] === false) _step[1] = Math.abs(_m1) >= t1 && values[1];
    } else {
      if (_step[0] === false) _step[0] = Math.abs(_m0) >= t0 && Math.sign(_m0) * t0;
      if (_step[1] === false) _step[1] = Math.abs(_m1) >= t1 && Math.sign(_m1) * t1;
    }
    state.intentional = _step[0] !== false || _step[1] !== false;
    if (!state.intentional) return;
    const movement = [0, 0];
    if (config.hasCustomTransform) {
      const [v0, v1] = values;
      movement[0] = _step[0] !== false ? v0 - _step[0] : 0;
      movement[1] = _step[1] !== false ? v1 - _step[1] : 0;
    } else {
      movement[0] = _step[0] !== false ? _m0 - _step[0] : 0;
      movement[1] = _step[1] !== false ? _m1 - _step[1] : 0;
    }
    if (this.restrictToAxis && !state._blocked) this.restrictToAxis(movement);
    const previousOffset = state.offset;
    const gestureIsActive = state._active && !state._blocked || state.active;
    if (gestureIsActive) {
      state.first = state._active && !state.active;
      state.last = !state._active && state.active;
      state.active = shared[this.ingKey] = state._active;
      if (event) {
        if (state.first) {
          if ('bounds' in config) state._bounds = call(config.bounds, state);
          if (this.setup) this.setup();
        }
        state.movement = movement;
        this.computeOffset();
      }
    }
    const [ox, oy] = state.offset;
    const [[x0, x1], [y0, y1]] = state._bounds;
    state.overflow = [ox < x0 ? -1 : ox > x1 ? 1 : 0, oy < y0 ? -1 : oy > y1 ? 1 : 0];
    state._movementBound[0] = state.overflow[0] ? state._movementBound[0] === false ? state._movement[0] : state._movementBound[0] : false;
    state._movementBound[1] = state.overflow[1] ? state._movementBound[1] === false ? state._movement[1] : state._movementBound[1] : false;
    const rubberband = state._active ? config.rubberband || [0, 0] : [0, 0];
    state.offset = computeRubberband(state._bounds, state.offset, rubberband);
    state.delta = V.sub(state.offset, previousOffset);
    this.computeMovement();
    if (gestureIsActive && (!state.last || dt > BEFORE_LAST_KINEMATICS_DELAY)) {
      state.delta = V.sub(state.offset, previousOffset);
      const absoluteDelta = state.delta.map(Math.abs);
      V.addTo(state.distance, absoluteDelta);
      state.direction = state.delta.map(Math.sign);
      state._direction = state._delta.map(Math.sign);
      if (!state.first && dt > 0) {
        state.velocity = [absoluteDelta[0] / dt, absoluteDelta[1] / dt];
        state.timeDelta = dt;
      }
    }
  }
  emit() {
    const state = this.state;
    const shared = this.shared;
    const config = this.config;
    if (!state._active) this.clean();
    if ((state._blocked || !state.intentional) && !state._force && !config.triggerAllEvents) return;
    const memo = this.handler(_objectSpread2(_objectSpread2(_objectSpread2({}, shared), state), {}, {
      [this.aliasKey]: state.values
    }));
    if (memo !== undefined) state.memo = memo;
  }
  clean() {
    this.eventStore.clean();
    this.timeoutStore.clean();
  }
}

function selectAxis([dx, dy], threshold) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy && absDx > threshold) {
    return 'x';
  }
  if (absDy > absDx && absDy > threshold) {
    return 'y';
  }
  return undefined;
}
class CoordinatesEngine extends Engine {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "aliasKey", 'xy');
  }
  reset() {
    super.reset();
    this.state.axis = undefined;
  }
  init() {
    this.state.offset = [0, 0];
    this.state.lastOffset = [0, 0];
  }
  computeOffset() {
    this.state.offset = V.add(this.state.lastOffset, this.state.movement);
  }
  computeMovement() {
    this.state.movement = V.sub(this.state.offset, this.state.lastOffset);
  }
  axisIntent(event) {
    const state = this.state;
    const config = this.config;
    if (!state.axis && event) {
      const threshold = typeof config.axisThreshold === 'object' ? config.axisThreshold[getPointerType(event)] : config.axisThreshold;
      state.axis = selectAxis(state._movement, threshold);
    }
    state._blocked = (config.lockDirection || !!config.axis) && !state.axis || !!config.axis && config.axis !== state.axis;
  }
  restrictToAxis(v) {
    if (this.config.axis || this.config.lockDirection) {
      switch (this.state.axis) {
        case 'x':
          v[1] = 0;
          break;
        case 'y':
          v[0] = 0;
          break;
      }
    }
  }
}

const identity = v => v;
const DEFAULT_RUBBERBAND = 0.15;
const commonConfigResolver = {
  enabled(value = true) {
    return value;
  },
  eventOptions(value, _k, config) {
    return _objectSpread2(_objectSpread2({}, config.shared.eventOptions), value);
  },
  preventDefault(value = false) {
    return value;
  },
  triggerAllEvents(value = false) {
    return value;
  },
  rubberband(value = 0) {
    switch (value) {
      case true:
        return [DEFAULT_RUBBERBAND, DEFAULT_RUBBERBAND];
      case false:
        return [0, 0];
      default:
        return V.toVector(value);
    }
  },
  from(value) {
    if (typeof value === 'function') return value;
    if (value != null) return V.toVector(value);
  },
  transform(value, _k, config) {
    const transform = value || config.shared.transform;
    this.hasCustomTransform = !!transform;
    return transform || identity;
  },
  threshold(value) {
    return V.toVector(value, 0);
  }
};

const DEFAULT_AXIS_THRESHOLD = 0;
const coordinatesConfigResolver = _objectSpread2(_objectSpread2({}, commonConfigResolver), {}, {
  axis(_v, _k, {
    axis
  }) {
    this.lockDirection = axis === 'lock';
    if (!this.lockDirection) return axis;
  },
  axisThreshold(value = DEFAULT_AXIS_THRESHOLD) {
    return value;
  },
  bounds(value = {}) {
    if (typeof value === 'function') {
      return state => coordinatesConfigResolver.bounds(value(state));
    }
    if ('current' in value) {
      return () => value.current;
    }
    if (typeof HTMLElement === 'function' && value instanceof HTMLElement) {
      return value;
    }
    const {
      left = -Infinity,
      right = Infinity,
      top = -Infinity,
      bottom = Infinity
    } = value;
    return [[left, right], [top, bottom]];
  }
});

const KEYS_DELTA_MAP = {
  ArrowRight: (displacement, factor = 1) => [displacement * factor, 0],
  ArrowLeft: (displacement, factor = 1) => [-1 * displacement * factor, 0],
  ArrowUp: (displacement, factor = 1) => [0, -1 * displacement * factor],
  ArrowDown: (displacement, factor = 1) => [0, displacement * factor]
};
class DragEngine extends CoordinatesEngine {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "ingKey", 'dragging');
  }
  reset() {
    super.reset();
    const state = this.state;
    state._pointerId = undefined;
    state._pointerActive = false;
    state._keyboardActive = false;
    state._preventScroll = false;
    state._delayed = false;
    state.swipe = [0, 0];
    state.tap = false;
    state.canceled = false;
    state.cancel = this.cancel.bind(this);
  }
  setup() {
    const state = this.state;
    if (state._bounds instanceof HTMLElement) {
      const boundRect = state._bounds.getBoundingClientRect();
      const targetRect = state.currentTarget.getBoundingClientRect();
      const _bounds = {
        left: boundRect.left - targetRect.left + state.offset[0],
        right: boundRect.right - targetRect.right + state.offset[0],
        top: boundRect.top - targetRect.top + state.offset[1],
        bottom: boundRect.bottom - targetRect.bottom + state.offset[1]
      };
      state._bounds = coordinatesConfigResolver.bounds(_bounds);
    }
  }
  cancel() {
    const state = this.state;
    if (state.canceled) return;
    state.canceled = true;
    state._active = false;
    setTimeout(() => {
      this.compute();
      this.emit();
    }, 0);
  }
  setActive() {
    this.state._active = this.state._pointerActive || this.state._keyboardActive;
  }
  clean() {
    this.pointerClean();
    this.state._pointerActive = false;
    this.state._keyboardActive = false;
    super.clean();
  }
  pointerDown(event) {
    const config = this.config;
    const state = this.state;
    if (event.buttons != null && (Array.isArray(config.pointerButtons) ? !config.pointerButtons.includes(event.buttons) : config.pointerButtons !== -1 && config.pointerButtons !== event.buttons)) return;
    const ctrlIds = this.ctrl.setEventIds(event);
    if (config.pointerCapture) {
      event.target.setPointerCapture(event.pointerId);
    }
    if (ctrlIds && ctrlIds.size > 1 && state._pointerActive) return;
    this.start(event);
    this.setupPointer(event);
    state._pointerId = pointerId(event);
    state._pointerActive = true;
    this.computeValues(pointerValues(event));
    this.computeInitial();
    if (config.preventScrollAxis && getPointerType(event) !== 'mouse') {
      state._active = false;
      this.setupScrollPrevention(event);
    } else if (config.delay > 0) {
      this.setupDelayTrigger(event);
      if (config.triggerAllEvents) {
        this.compute(event);
        this.emit();
      }
    } else {
      this.startPointerDrag(event);
    }
  }
  startPointerDrag(event) {
    const state = this.state;
    state._active = true;
    state._preventScroll = true;
    state._delayed = false;
    this.compute(event);
    this.emit();
  }
  pointerMove(event) {
    const state = this.state;
    const config = this.config;
    if (!state._pointerActive) return;
    const id = pointerId(event);
    if (state._pointerId !== undefined && id !== state._pointerId) return;
    const _values = pointerValues(event);
    if (document.pointerLockElement === event.target) {
      state._delta = [event.movementX, event.movementY];
    } else {
      state._delta = V.sub(_values, state._values);
      this.computeValues(_values);
    }
    V.addTo(state._movement, state._delta);
    this.compute(event);
    if (state._delayed && state.intentional) {
      this.timeoutStore.remove('dragDelay');
      state.active = false;
      this.startPointerDrag(event);
      return;
    }
    if (config.preventScrollAxis && !state._preventScroll) {
      if (state.axis) {
        if (state.axis === config.preventScrollAxis || config.preventScrollAxis === 'xy') {
          state._active = false;
          this.clean();
          return;
        } else {
          this.timeoutStore.remove('startPointerDrag');
          this.startPointerDrag(event);
          return;
        }
      } else {
        return;
      }
    }
    this.emit();
  }
  pointerUp(event) {
    this.ctrl.setEventIds(event);
    try {
      if (this.config.pointerCapture && event.target.hasPointerCapture(event.pointerId)) {
        ;
        event.target.releasePointerCapture(event.pointerId);
      }
    } catch (_unused) {
    }
    const state = this.state;
    const config = this.config;
    if (!state._active || !state._pointerActive) return;
    const id = pointerId(event);
    if (state._pointerId !== undefined && id !== state._pointerId) return;
    this.state._pointerActive = false;
    this.setActive();
    this.compute(event);
    const [dx, dy] = state._distance;
    state.tap = dx <= config.tapsThreshold && dy <= config.tapsThreshold;
    if (state.tap && config.filterTaps) {
      state._force = true;
    } else {
      const [_dx, _dy] = state._delta;
      const [_mx, _my] = state._movement;
      const [svx, svy] = config.swipe.velocity;
      const [sx, sy] = config.swipe.distance;
      const sdt = config.swipe.duration;
      if (state.elapsedTime < sdt) {
        const _vx = Math.abs(_dx / state.timeDelta);
        const _vy = Math.abs(_dy / state.timeDelta);
        if (_vx > svx && Math.abs(_mx) > sx) state.swipe[0] = Math.sign(_dx);
        if (_vy > svy && Math.abs(_my) > sy) state.swipe[1] = Math.sign(_dy);
      }
    }
    this.emit();
  }
  pointerClick(event) {
    if (!this.state.tap && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  setupPointer(event) {
    const config = this.config;
    const device = config.device;
    if (config.pointerLock) {
      event.currentTarget.requestPointerLock();
    }
    if (!config.pointerCapture) {
      this.eventStore.add(this.sharedConfig.window, device, 'change', this.pointerMove.bind(this));
      this.eventStore.add(this.sharedConfig.window, device, 'end', this.pointerUp.bind(this));
      this.eventStore.add(this.sharedConfig.window, device, 'cancel', this.pointerUp.bind(this));
    }
  }
  pointerClean() {
    if (this.config.pointerLock && document.pointerLockElement === this.state.currentTarget) {
      document.exitPointerLock();
    }
  }
  preventScroll(event) {
    if (this.state._preventScroll && event.cancelable) {
      event.preventDefault();
    }
  }
  setupScrollPrevention(event) {
    this.state._preventScroll = false;
    persistEvent(event);
    const remove = this.eventStore.add(this.sharedConfig.window, 'touch', 'change', this.preventScroll.bind(this), {
      passive: false
    });
    this.eventStore.add(this.sharedConfig.window, 'touch', 'end', remove);
    this.eventStore.add(this.sharedConfig.window, 'touch', 'cancel', remove);
    this.timeoutStore.add('startPointerDrag', this.startPointerDrag.bind(this), this.config.preventScrollDelay, event);
  }
  setupDelayTrigger(event) {
    this.state._delayed = true;
    this.timeoutStore.add('dragDelay', () => {
      this.state._step = [0, 0];
      this.startPointerDrag(event);
    }, this.config.delay);
  }
  keyDown(event) {
    const deltaFn = KEYS_DELTA_MAP[event.key];
    if (deltaFn) {
      const state = this.state;
      const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      this.start(event);
      state._delta = deltaFn(this.config.keyboardDisplacement, factor);
      state._keyboardActive = true;
      V.addTo(state._movement, state._delta);
      this.compute(event);
      this.emit();
    }
  }
  keyUp(event) {
    if (!(event.key in KEYS_DELTA_MAP)) return;
    this.state._keyboardActive = false;
    this.setActive();
    this.compute(event);
    this.emit();
  }
  bind(bindFunction) {
    const device = this.config.device;
    bindFunction(device, 'start', this.pointerDown.bind(this));
    if (this.config.pointerCapture) {
      bindFunction(device, 'change', this.pointerMove.bind(this));
      bindFunction(device, 'end', this.pointerUp.bind(this));
      bindFunction(device, 'cancel', this.pointerUp.bind(this));
      bindFunction('lostPointerCapture', '', this.pointerUp.bind(this));
    }
    if (this.config.keys) {
      bindFunction('key', 'down', this.keyDown.bind(this));
      bindFunction('key', 'up', this.keyUp.bind(this));
    }
    if (this.config.filterTaps) {
      bindFunction('click', '', this.pointerClick.bind(this), {
        capture: true,
        passive: false
      });
    }
  }
}
function persistEvent(event) {
  'persist' in event && typeof event.persist === 'function' && event.persist();
}

const isBrowser = typeof window !== 'undefined' && window.document && window.document.createElement;
function supportsTouchEvents() {
  return isBrowser && 'ontouchstart' in window;
}
function isTouchScreen() {
  return supportsTouchEvents() || isBrowser && window.navigator.maxTouchPoints > 1;
}
function supportsPointerEvents() {
  return isBrowser && 'onpointerdown' in window;
}
function supportsPointerLock() {
  return isBrowser && 'exitPointerLock' in window.document;
}
function supportsGestureEvents() {
  try {
    return 'constructor' in GestureEvent;
  } catch (e) {
    return false;
  }
}
const SUPPORT = {
  isBrowser,
  gesture: supportsGestureEvents(),
  touch: supportsTouchEvents(),
  touchscreen: isTouchScreen(),
  pointer: supportsPointerEvents(),
  pointerLock: supportsPointerLock()
};

const DEFAULT_PREVENT_SCROLL_DELAY = 250;
const DEFAULT_DRAG_DELAY = 180;
const DEFAULT_SWIPE_VELOCITY = 0.5;
const DEFAULT_SWIPE_DISTANCE = 50;
const DEFAULT_SWIPE_DURATION = 250;
const DEFAULT_KEYBOARD_DISPLACEMENT = 10;
const DEFAULT_DRAG_AXIS_THRESHOLD = {
  mouse: 0,
  touch: 0,
  pen: 8
};
const dragConfigResolver = _objectSpread2(_objectSpread2({}, coordinatesConfigResolver), {}, {
  device(_v, _k, {
    pointer: {
      touch = false,
      lock = false,
      mouse = false
    } = {}
  }) {
    this.pointerLock = lock && SUPPORT.pointerLock;
    if (SUPPORT.touch && touch) return 'touch';
    if (this.pointerLock) return 'mouse';
    if (SUPPORT.pointer && !mouse) return 'pointer';
    if (SUPPORT.touch) return 'touch';
    return 'mouse';
  },
  preventScrollAxis(value, _k, {
    preventScroll
  }) {
    this.preventScrollDelay = typeof preventScroll === 'number' ? preventScroll : preventScroll || preventScroll === undefined && value ? DEFAULT_PREVENT_SCROLL_DELAY : undefined;
    if (!SUPPORT.touchscreen || preventScroll === false) return undefined;
    return value ? value : preventScroll !== undefined ? 'y' : undefined;
  },
  pointerCapture(_v, _k, {
    pointer: {
      capture = true,
      buttons = 1,
      keys = true
    } = {}
  }) {
    this.pointerButtons = buttons;
    this.keys = keys;
    return !this.pointerLock && this.device === 'pointer' && capture;
  },
  threshold(value, _k, {
    filterTaps = false,
    tapsThreshold = 3,
    axis = undefined
  }) {
    const threshold = V.toVector(value, filterTaps ? tapsThreshold : axis ? 1 : 0);
    this.filterTaps = filterTaps;
    this.tapsThreshold = tapsThreshold;
    return threshold;
  },
  swipe({
    velocity = DEFAULT_SWIPE_VELOCITY,
    distance = DEFAULT_SWIPE_DISTANCE,
    duration = DEFAULT_SWIPE_DURATION
  } = {}) {
    return {
      velocity: this.transform(V.toVector(velocity)),
      distance: this.transform(V.toVector(distance)),
      duration
    };
  },
  delay(value = 0) {
    switch (value) {
      case true:
        return DEFAULT_DRAG_DELAY;
      case false:
        return 0;
      default:
        return value;
    }
  },
  axisThreshold(value) {
    if (!value) return DEFAULT_DRAG_AXIS_THRESHOLD;
    return _objectSpread2(_objectSpread2({}, DEFAULT_DRAG_AXIS_THRESHOLD), value);
  },
  keyboardDisplacement(value = DEFAULT_KEYBOARD_DISPLACEMENT) {
    return value;
  }
});

_objectSpread2(_objectSpread2({}, commonConfigResolver), {}, {
  device(_v, _k, {
    shared,
    pointer: {
      touch = false
    } = {}
  }) {
    const sharedConfig = shared;
    if (sharedConfig.target && !SUPPORT.touch && SUPPORT.gesture) return 'gesture';
    if (SUPPORT.touch && touch) return 'touch';
    if (SUPPORT.touchscreen) {
      if (SUPPORT.pointer) return 'pointer';
      if (SUPPORT.touch) return 'touch';
    }
  },
  bounds(_v, _k, {
    scaleBounds = {},
    angleBounds = {}
  }) {
    const _scaleBounds = state => {
      const D = assignDefault(call(scaleBounds, state), {
        min: -Infinity,
        max: Infinity
      });
      return [D.min, D.max];
    };
    const _angleBounds = state => {
      const A = assignDefault(call(angleBounds, state), {
        min: -Infinity,
        max: Infinity
      });
      return [A.min, A.max];
    };
    if (typeof scaleBounds !== 'function' && typeof angleBounds !== 'function') return [_scaleBounds(), _angleBounds()];
    return state => [_scaleBounds(state), _angleBounds(state)];
  },
  threshold(value, _k, config) {
    this.lockDirection = config.axis === 'lock';
    const threshold = V.toVector(value, this.lockDirection ? [0.1, 3] : 0);
    return threshold;
  },
  modifierKey(value) {
    if (value === undefined) return 'ctrlKey';
    return value;
  },
  pinchOnWheel(value = true) {
    return value;
  }
});

_objectSpread2(_objectSpread2({}, coordinatesConfigResolver), {}, {
  mouseOnly: (value = true) => value
});

_objectSpread2(_objectSpread2({}, coordinatesConfigResolver), {}, {
  mouseOnly: (value = true) => value
});

const EngineMap = new Map();
const ConfigResolverMap = new Map();
function registerAction(action) {
  EngineMap.set(action.key, action.engine);
  ConfigResolverMap.set(action.key, action.resolver);
}
const dragAction = {
  key: 'drag',
  engine: DragEngine,
  resolver: dragConfigResolver
};

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }
  return target;
}

function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};
  var target = _objectWithoutPropertiesLoose(source, excluded);
  var key, i;
  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }
  return target;
}

const sharedConfigResolver = {
  target(value) {
    if (value) {
      return () => 'current' in value ? value.current : value;
    }
    return undefined;
  },
  enabled(value = true) {
    return value;
  },
  window(value = SUPPORT.isBrowser ? window : undefined) {
    return value;
  },
  eventOptions({
    passive = true,
    capture = false
  } = {}) {
    return {
      passive,
      capture
    };
  },
  transform(value) {
    return value;
  }
};

const _excluded = ["target", "eventOptions", "window", "enabled", "transform"];
function resolveWith(config = {}, resolvers) {
  const result = {};
  for (const [key, resolver] of Object.entries(resolvers)) {
    switch (typeof resolver) {
      case 'function':
        {
          result[key] = resolver.call(result, config[key], key, config);
        }
        break;
      case 'object':
        result[key] = resolveWith(config[key], resolver);
        break;
      case 'boolean':
        if (resolver) result[key] = config[key];
        break;
    }
  }
  return result;
}
function parse(newConfig, gestureKey, _config = {}) {
  const _ref = newConfig,
    {
      target,
      eventOptions,
      window,
      enabled,
      transform
    } = _ref,
    rest = _objectWithoutProperties(_ref, _excluded);
  _config.shared = resolveWith({
    target,
    eventOptions,
    window,
    enabled,
    transform
  }, sharedConfigResolver);
  if (gestureKey) {
    const resolver = ConfigResolverMap.get(gestureKey);
    _config[gestureKey] = resolveWith(_objectSpread2({
      shared: _config.shared
    }, rest), resolver);
  } else {
    for (const key in rest) {
      const resolver = ConfigResolverMap.get(key);
      if (resolver) {
        _config[key] = resolveWith(_objectSpread2({
          shared: _config.shared
        }, rest[key]), resolver);
      }
    }
  }
  return _config;
}

class EventStore {
  constructor(ctrl, gestureKey) {
    _defineProperty(this, "_listeners", new Set());
    this._ctrl = ctrl;
    this._gestureKey = gestureKey;
  }
  add(element, device, action, handler, options) {
    const listeners = this._listeners;
    const type = toDomEventType(device, action);
    const _options = this._gestureKey ? this._ctrl.config[this._gestureKey].eventOptions : {};
    const eventOptions = _objectSpread2(_objectSpread2({}, _options), options);
    element.addEventListener(type, handler, eventOptions);
    const remove = () => {
      element.removeEventListener(type, handler, eventOptions);
      listeners.delete(remove);
    };
    listeners.add(remove);
    return remove;
  }
  clean() {
    this._listeners.forEach(remove => remove());
    this._listeners.clear();
  }
}

class TimeoutStore {
  constructor() {
    _defineProperty(this, "_timeouts", new Map());
  }
  add(key, callback, ms = 140, ...args) {
    this.remove(key);
    this._timeouts.set(key, window.setTimeout(callback, ms, ...args));
  }
  remove(key) {
    const timeout = this._timeouts.get(key);
    if (timeout) window.clearTimeout(timeout);
  }
  clean() {
    this._timeouts.forEach(timeout => void window.clearTimeout(timeout));
    this._timeouts.clear();
  }
}

class Controller {
  constructor(handlers) {
    _defineProperty(this, "gestures", new Set());
    _defineProperty(this, "_targetEventStore", new EventStore(this));
    _defineProperty(this, "gestureEventStores", {});
    _defineProperty(this, "gestureTimeoutStores", {});
    _defineProperty(this, "handlers", {});
    _defineProperty(this, "config", {});
    _defineProperty(this, "pointerIds", new Set());
    _defineProperty(this, "touchIds", new Set());
    _defineProperty(this, "state", {
      shared: {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false
      }
    });
    resolveGestures(this, handlers);
  }
  setEventIds(event) {
    if (isTouch(event)) {
      this.touchIds = new Set(touchIds(event));
      return this.touchIds;
    } else if ('pointerId' in event) {
      if (event.type === 'pointerup' || event.type === 'pointercancel') this.pointerIds.delete(event.pointerId);else if (event.type === 'pointerdown') this.pointerIds.add(event.pointerId);
      return this.pointerIds;
    }
  }
  applyHandlers(handlers, nativeHandlers) {
    this.handlers = handlers;
    this.nativeHandlers = nativeHandlers;
  }
  applyConfig(config, gestureKey) {
    this.config = parse(config, gestureKey, this.config);
  }
  clean() {
    this._targetEventStore.clean();
    for (const key of this.gestures) {
      this.gestureEventStores[key].clean();
      this.gestureTimeoutStores[key].clean();
    }
  }
  effect() {
    if (this.config.shared.target) this.bind();
    return () => this._targetEventStore.clean();
  }
  bind(...args) {
    const sharedConfig = this.config.shared;
    const props = {};
    let target;
    if (sharedConfig.target) {
      target = sharedConfig.target();
      if (!target) return;
    }
    if (sharedConfig.enabled) {
      for (const gestureKey of this.gestures) {
        const gestureConfig = this.config[gestureKey];
        const bindFunction = bindToProps(props, gestureConfig.eventOptions, !!target);
        if (gestureConfig.enabled) {
          const Engine = EngineMap.get(gestureKey);
          new Engine(this, args, gestureKey).bind(bindFunction);
        }
      }
      const nativeBindFunction = bindToProps(props, sharedConfig.eventOptions, !!target);
      for (const eventKey in this.nativeHandlers) {
        nativeBindFunction(eventKey, '', event => this.nativeHandlers[eventKey](_objectSpread2(_objectSpread2({}, this.state.shared), {}, {
          event,
          args
        })), undefined, true);
      }
    }
    for (const handlerProp in props) {
      props[handlerProp] = chain(...props[handlerProp]);
    }
    if (!target) return props;
    for (const handlerProp in props) {
      const {
        device,
        capture,
        passive
      } = parseProp(handlerProp);
      this._targetEventStore.add(target, device, '', props[handlerProp], {
        capture,
        passive
      });
    }
  }
}
function setupGesture(ctrl, gestureKey) {
  ctrl.gestures.add(gestureKey);
  ctrl.gestureEventStores[gestureKey] = new EventStore(ctrl, gestureKey);
  ctrl.gestureTimeoutStores[gestureKey] = new TimeoutStore();
}
function resolveGestures(ctrl, internalHandlers) {
  if (internalHandlers.drag) setupGesture(ctrl, 'drag');
  if (internalHandlers.wheel) setupGesture(ctrl, 'wheel');
  if (internalHandlers.scroll) setupGesture(ctrl, 'scroll');
  if (internalHandlers.move) setupGesture(ctrl, 'move');
  if (internalHandlers.pinch) setupGesture(ctrl, 'pinch');
  if (internalHandlers.hover) setupGesture(ctrl, 'hover');
}
const bindToProps = (props, eventOptions, withPassiveOption) => (device, action, handler, options = {}, isNative = false) => {
  var _options$capture, _options$passive;
  const capture = (_options$capture = options.capture) !== null && _options$capture !== void 0 ? _options$capture : eventOptions.capture;
  const passive = (_options$passive = options.passive) !== null && _options$passive !== void 0 ? _options$passive : eventOptions.passive;
  let handlerProp = isNative ? device : toHandlerProp(device, action, capture);
  if (withPassiveOption && passive) handlerProp += 'Passive';
  props[handlerProp] = props[handlerProp] || [];
  props[handlerProp].push(handler);
};

function useRecognizers(handlers, config = {}, gestureKey, nativeHandlers) {
  const ctrl = React.useMemo(() => new Controller(handlers), []);
  ctrl.applyHandlers(handlers, nativeHandlers);
  ctrl.applyConfig(config, gestureKey);
  React.useEffect(ctrl.effect.bind(ctrl));
  React.useEffect(() => {
    return ctrl.clean.bind(ctrl);
  }, []);
  if (config.target === undefined) {
    return ctrl.bind.bind(ctrl);
  }
  return undefined;
}

function useDrag(handler, config) {
  registerAction(dragAction);
  return useRecognizers({
    drag: handler
  }, config || {}, 'drag');
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var __assign = (commonjsGlobal && commonjsGlobal.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
function pushProp(target, key, value) {
    if (key === 'className') {
        target.className = [target.className, value].join(' ').trim();
    }
    else if (key === 'style') {
        target.style = __assign(__assign({}, target.style), value);
    }
    else if (typeof value === 'function') {
        var oldFn_1 = target[key];
        target[key] = oldFn_1 ? function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            oldFn_1.apply(void 0, args);
            value.apply(void 0, args);
        } : value;
    }
    else if (
    // skip merging undefined values
    value === undefined ||
        // skip if both value are the same primitive value
        (typeof value !== 'object' && value === target[key])) {
        return;
    }
    else if (!(key in target)) {
        target[key] = value;
    }
    else {
        throw new Error("Didn\u2019t know how to merge prop '".concat(key, "'. ") +
            "Only 'className', 'style', and event handlers are supported");
    }
}
var dist = function mergeProps() {
    var props = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        props[_i] = arguments[_i];
    }
    if (props.length === 1) {
        return props[0];
    }
    return props.reduce(function (merged, ps) {
        for (var key in ps) {
            pushProp(merged, key, ps[key]);
        }
        return merged;
    }, {});
};


var q$1 = /*@__PURE__*/getDefaultExportFromCjs(dist);

var n$1=(r,m,e)=>Math.max(m,Math.min(e,r)),o=r=>n$1(r,0,1);var a=(r,m,e)=>(e-m)*r+m,b=(r,m,e)=>(r-m)/(e-m);

var jsxRuntime = {exports: {}};

var reactJsxRuntime_production_min = {};

/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var f$1=React,k=Symbol.for("react.element"),l=Symbol.for("react.fragment"),m=Object.prototype.hasOwnProperty,n=f$1.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,p$1={key:!0,ref:!0,__self:!0,__source:!0};
function q(c,a,g){var b,d={},e=null,h=null;void 0!==g&&(e=""+g);void 0!==a.key&&(e=""+a.key);void 0!==a.ref&&(h=a.ref);for(b in a)m.call(a,b)&&!p$1.hasOwnProperty(b)&&(d[b]=a[b]);if(c&&c.defaultProps)for(b in a=c.defaultProps,a)void 0===d[b]&&(d[b]=a[b]);return {$$typeof:k,type:c,key:e,ref:h,props:d,_owner:n.current}}reactJsxRuntime_production_min.Fragment=l;reactJsxRuntime_production_min.jsx=q;reactJsxRuntime_production_min.jsxs=q;

{
  jsxRuntime.exports = reactJsxRuntime_production_min;
}

var jsxRuntimeExports = jsxRuntime.exports;

var C=Object.defineProperty;var p=Object.getOwnPropertySymbols;var P=Object.prototype.hasOwnProperty,H=Object.prototype.propertyIsEnumerable;var x=(e,r,o)=>r in e?C(e,r,{enumerable:!0,configurable:!0,writable:!0,value:o}):e[r]=o,s=(e,r)=>{for(var o in r||(r={}))P.call(r,o)&&x(e,o,r[o]);if(p)for(var o of p(r))H.call(r,o)&&x(e,o,r[o]);return e};var v=(e,r)=>{var o={};for(var n in e)P.call(e,n)&&r.indexOf(n)<0&&(o[n]=e[n]);if(e!=null&&p)for(var n of p(e))r.indexOf(n)<0&&H.call(e,n)&&(o[n]=e[n]);return o};var w="y",L=!1,D=b,T=a,f=forwardRef((M,A)=>{var K=M,{valueRaw:e,valueMin:r,valueMax:o$1,dragSensitivity:n,valueRawRoundFn:i,valueRawDisplayFn:t,onValueRawChange:l,orientation:u,axis:a=w,includeIntoTabOrder:y=L,mapTo01:N=D,mapFrom01:R=T}=K,g=v(K,["valueRaw","valueMin","valueMax","dragSensitivity","valueRawRoundFn","valueRawDisplayFn","onValueRawChange","orientation","axis","includeIntoTabOrder","mapTo01","mapFrom01"]);let k=i(e),F=useDrag(({delta:b})=>{let c=0;c+=b[0]*n,c+=b[1]*-n;let h=N(e,r,o$1),z=o(h+c),I=n$1(R(z,r,o$1),r,o$1);l(I);},{pointer:{keys:!1},axis:S(u,a)});return jsxRuntimeExports.jsx("div",s({ref:A,role:"slider","aria-valuenow":k,"aria-valuemin":r,"aria-valuemax":o$1,"aria-orientation":W(u,a),"aria-valuetext":t(e),tabIndex:y?0:-1},q$1(F(),{style:{touchAction:"none"},onPointerDown(b){b.currentTarget.focus();}},g)))});f.displayName="KnobHeadless";f.defaultProps={axis:w,includeIntoTabOrder:L,mapTo01:D,mapFrom01:T};var S=(e,r)=>e?e==="horizontal"?"x":"y":r==="xy"?void 0:r,W=(e,r)=>{if(e)return e;if(r!=="xy")return r==="x"?"horizontal":"vertical"};var O=forwardRef((e,r)=>jsxRuntimeExports.jsx("label",s({ref:r},e)));O.displayName="KnobHeadlessLabel";var E=forwardRef((e,r)=>jsxRuntimeExports.jsx("output",s({ref:r},e)));E.displayName="KnobHeadlessOutput";

const KnobInner = ({ value, size }) => {
    // Angle calculation: value 0 = -135°, value 0.5 = 0° (top), value 1 = +135°
    const angleDeg = value * 270 - 135;
    // Convert to radians, offset by -90 so 0° is at top
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    // Sweep angle from start (0) to current value position (rounded to reduce jitter)
    const sweepDeg = Math.round(value * 270 * 10) / 10;
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.5; // Thinner arc, larger inner circle
    const arcCenterRadius = (outerRadius + innerRadius) / 2;
    // Handle dimensions - positioned in the middle of the arc ring
    const handleWidth = Math.round(size * 0.12);
    const handleHeight = Math.round((outerRadius - innerRadius) * 1.2);
    // Calculate handle offset from center (use transform for smoother animation)
    const handleOffsetX = arcCenterRadius * Math.cos(angleRad);
    const handleOffsetY = arcCenterRadius * Math.sin(angleRad);
    // Build dynamic gradient that only extends to the handle position
    const buildGradient = () => {
        if (sweepDeg <= 0)
            return 'transparent';
        // Create gradient stops proportionally within the sweep range
        const stops = [
            { pos: 0, color: 'color-mix(in srgb, var(--t3k-fg) 15%, transparent)' },
            {
                pos: 0.35,
                color: 'color-mix(in srgb, var(--t3k-fg) 45%, transparent)',
            },
            { pos: 0.7, color: 'color-mix(in srgb, var(--t3k-fg) 80%, transparent)' },
            { pos: 1, color: 'var(--t3k-fg)' },
        ];
        const gradientStops = stops
            .map(s => `${s.color} ${s.pos * sweepDeg}deg`)
            .join(', ');
        return `conic-gradient(from 225deg, ${gradientStops}, transparent ${sweepDeg}deg)`;
    };
    return (React.createElement("div", { style: {
            width: size,
            height: size,
            position: 'relative',
            borderRadius: '50%',
            pointerEvents: 'none',
        } },
        React.createElement("div", { style: {
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: `conic-gradient(from 225deg, var(--t3k-line-strong) 0deg, var(--t3k-line) 270deg, transparent 270deg)`,
            } }),
        React.createElement("div", { style: {
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: buildGradient(),
                willChange: 'background',
                backfaceVisibility: 'hidden',
            } }),
        React.createElement("div", { style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: innerRadius * 2,
                height: innerRadius * 2,
                borderRadius: '50%',
                backgroundColor: 'var(--t3k-surface)',
            } }),
        React.createElement("div", { style: {
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: handleWidth,
                height: handleHeight,
                backgroundColor: 'var(--t3k-fg)',
                borderLeft: '2px solid var(--t3k-surface)',
                transform: `translate(-50%, -50%) translate(${handleOffsetX}px, ${handleOffsetY}px) rotate(${angleDeg}deg)`,
                transformOrigin: 'center center',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
            } })));
};

/** How long the tip lingers after a non-drag change. */
const TIP_LINGER_MS = 900;
const KnobControl = ({ label, value, onChange, size = 64, labelSize = 14, labelBottom = true, hideLabel = false, isDisabled = false, tip, }) => {
    // const angleDeg = value * 270 - 135; // -135..+135
    const knobRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [nudged, setNudged] = useState(false);
    const nudgeTimer = useRef();
    // Set by the knob's own change callback, so only the user's wheel/key
    // turns flash the tip — not programmatic updates (a restored gain on
    // mount, a reset when the IR changes).
    const userChange = useRef(false);
    const handleChange = (next) => {
        userChange.current = true;
        onChange(next);
    };
    // A user change that isn't part of a drag (wheel, keys) flashes the tip.
    useEffect(() => {
        if (!userChange.current)
            return;
        userChange.current = false;
        if (dragging || !tip)
            return;
        setNudged(true);
        clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(() => setNudged(false), TIP_LINGER_MS);
        return () => clearTimeout(nudgeTimer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    useEffect(() => {
        const knobElement = knobRef.current;
        if (!knobElement)
            return;
        const preventSelection = (e) => {
            e.preventDefault();
            return false;
        };
        const handleMouseDown = () => {
            setDragging(true);
            // Prevent text selection during drag
            const bodyStyle = document.body.style;
            bodyStyle.userSelect = 'none';
            bodyStyle.webkitUserSelect = 'none';
            bodyStyle.mozUserSelect = 'none';
            bodyStyle.msUserSelect = 'none';
            // Add class for CSS targeting
            document.body.classList.add('dragging');
        };
        const handleMouseUp = () => {
            setDragging(false);
            // Restore text selection
            const bodyStyle = document.body.style;
            bodyStyle.userSelect = '';
            bodyStyle.webkitUserSelect = '';
            bodyStyle.mozUserSelect = '';
            bodyStyle.msUserSelect = '';
            // Remove class
            document.body.classList.remove('dragging');
        };
        // Add event listeners
        knobElement.addEventListener('selectstart', preventSelection);
        knobElement.addEventListener('dragstart', preventSelection);
        knobElement.addEventListener('pointerdown', handleMouseDown);
        document.addEventListener('pointerup', handleMouseUp);
        document.addEventListener('pointercancel', handleMouseUp);
        return () => {
            // Cleanup
            knobElement.removeEventListener('selectstart', preventSelection);
            knobElement.removeEventListener('dragstart', preventSelection);
            knobElement.removeEventListener('pointerdown', handleMouseDown);
            document.removeEventListener('pointerup', handleMouseUp);
            document.removeEventListener('pointercancel', handleMouseUp);
            // Ensure body styles are reset
            const bodyStyle = document.body.style;
            bodyStyle.userSelect = '';
            bodyStyle.webkitUserSelect = '';
            bodyStyle.mozUserSelect = '';
            bodyStyle.msUserSelect = '';
            document.body.classList.remove('dragging');
        };
    }, []);
    return (React.createElement("div", { style: {
            display: 'flex',
            flexDirection: labelBottom ? 'column' : 'column-reverse',
            justifyContent: 'center',
            alignItems: 'center',
            gap: hideLabel ? 0 : labelSize === 14 ? '14px' : '10px',
        } },
        React.createElement(f, { ref: knobRef, "aria-label": label, valueRaw: value, valueMin: 0, valueMax: 1, dragSensitivity: 0.006, valueRawRoundFn: x => Math.round(x * 100) / 100, valueRawDisplayFn: x => `${x.toFixed(2)}`, onValueRawChange: handleChange, onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false), className: 'knob', style: {
                width: size,
                height: size,
                position: 'relative',
                userSelect: 'none',
                outline: 'none',
                boxShadow: 'none',
                WebkitTapHighlightColor: 'transparent',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                pointerEvents: isDisabled ? 'none' : 'auto',
            } },
            React.createElement(KnobInner, { value: value, size: size }),
            tip && (dragging || hovered || nudged) && (React.createElement("span", { role: 'status', className: 'pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 z-10 whitespace-nowrap rounded bg-surface border border-line px-1.5 py-0.5 font-mono text-xs text-fg tabular-nums shadow' }, tip))),
        !hideLabel && (React.createElement("span", { style: {
                fontSize: labelSize,
                fontWeight: 400,
                textAlign: 'center',
                color: 'var(--t3k-fg)',
            } }, label))));
};

/**
 * A clip indicator that latches red when clipping is detected.
 *
 * The indicator turns red when the 'clipped' class is added (by useMeterAnimation).
 * Clicking it resets the latch.
 *
 * Usage:
 * ```tsx
 * const clipRef = useRef<HTMLButtonElement>(null);
 * const { resetClipLatch } = useMeterAnimation(
 *   { analyser, meterRef, clipRef },
 *   null,
 *   true
 * );
 * <ClipIndicator ref={clipRef} onClick={() => resetClipLatch('input')} />
 * ```
 */
const ClipIndicator = forwardRef(({ onClick, size = 24, className = '', label = 'Clip indicator - click to reset', inactive = false, }, ref) => {
    return (React.createElement("button", { ref: ref, type: 'button', onClick: onClick, className: `
          rounded-sm
          bg-line
          focus:outline-none
          [&.clipped]:bg-danger
          ${className}
          ${inactive ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}
        `, style: {
            width: size,
            height: size,
            minWidth: size,
            minHeight: size,
        }, "aria-label": label, "aria-pressed": false, title: 'Click to reset clip indicator' }));
});
ClipIndicator.displayName = 'ClipIndicator';

/**
 * Async iterator for requestAnimationFrame loop
 * Allows clean cancellation via break or return
 */
const rafIter = () => {
    let id;
    let cancelled = false;
    return {
        async next() {
            if (cancelled) {
                return { value: undefined, done: true };
            }
            const promise = new Promise(resolve => {
                id = requestAnimationFrame(resolve);
            });
            await promise;
            return { value: undefined, done: false };
        },
        async return() {
            cancelled = true;
            cancelAnimationFrame(id);
            return { value: undefined, done: true };
        },
        [Symbol.asyncIterator]() {
            return this;
        },
    };
};
/**
 * Hook for animating audio level meters at 60fps
 *
 * Uses direct DOM manipulation via CSS custom properties for performance.
 * Does NOT trigger React re-renders.
 *
 * @param inputConfig - Configuration for input meter
 * @param outputConfig - Configuration for output meter
 * @param enabled - Whether animation is running (default: true)
 * @returns Object with resetClipLatch function and current levels ref
 */
function useMeterAnimation(inputConfig, outputConfig, enabled = true) {
    // Reusable buffer for reading analyser data (must match fftSize of AnalyserNodes)
    const bufferRef = useRef(new Float32Array(2048));
    // Track current levels (for external access if needed)
    const levelsRef = useRef({
        input: { peak: 0, rms: 0 },
        output: { peak: 0, rms: 0 },
    });
    // Track clip latch state
    const clipStateRef = useRef({
        inputClipLatched: false,
        outputClipLatched: false,
    });
    // Animation loop cleanup ref
    const cleanupRef = useRef(null);
    // Reset clip latch indicators
    const resetClipLatch = useCallback((which = 'all') => {
        if (which === 'input' || which === 'all') {
            clipStateRef.current.inputClipLatched = false;
            inputConfig?.clipRef?.current?.classList.remove('clipped');
        }
        if (which === 'output' || which === 'all') {
            clipStateRef.current.outputClipLatched = false;
            outputConfig?.clipRef?.current?.classList.remove('clipped');
        }
    }, [inputConfig?.clipRef, outputConfig?.clipRef]);
    useEffect(() => {
        // Clean up any existing animation loop
        cleanupRef.current?.();
        cleanupRef.current = null;
        // Don't start if disabled or no analysers
        if (!enabled)
            return;
        if (!inputConfig?.analyser && !outputConfig?.analyser)
            return;
        const buffer = bufferRef.current;
        let running = true;
        // Start animation loop
        (async () => {
            for await (const _ of rafIter()) {
                if (!running)
                    break;
                // Update input meter
                if (inputConfig?.analyser && inputConfig.meterRef.current) {
                    const levels = calculateLevels(inputConfig.analyser, buffer);
                    levelsRef.current.input = levels;
                    // Update meter display (using scaled value for visual response)
                    const displayLevel = scaleForDisplay(levels.rms);
                    inputConfig.meterRef.current.style.setProperty('--level', String(displayLevel));
                    // Check for clipping
                    if (isClipping(levels)) {
                        clipStateRef.current.inputClipLatched = true;
                        inputConfig.clipRef?.current?.classList.add('clipped');
                    }
                }
                // Update output meter
                if (outputConfig?.analyser && outputConfig.meterRef.current) {
                    const levels = calculateLevels(outputConfig.analyser, buffer);
                    levelsRef.current.output = levels;
                    // Update meter display
                    const displayLevel = scaleForDisplay(levels.rms);
                    outputConfig.meterRef.current.style.setProperty('--level', String(displayLevel));
                    // Check for clipping
                    if (isClipping(levels)) {
                        clipStateRef.current.outputClipLatched = true;
                        outputConfig.clipRef?.current?.classList.add('clipped');
                    }
                }
            }
        })();
        // Cleanup function
        cleanupRef.current = () => {
            running = false;
        };
        return () => {
            running = false;
            cleanupRef.current = null;
        };
    }, [
        enabled,
        inputConfig?.analyser,
        inputConfig?.meterRef,
        inputConfig?.clipRef,
        outputConfig?.analyser,
        outputConfig?.meterRef,
        outputConfig?.clipRef,
    ]);
    return {
        /** Reset clip latch indicator(s) */
        resetClipLatch,
        /** Current meter levels (updated every frame, not reactive) */
        levelsRef,
        /** Current clip state (updated every frame, not reactive) */
        clipStateRef,
    };
}

const DB_MIN = -12;
const DB_MAX = 12;
const dbToKnob = (db) => Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));
const knobToDb = (knob) => knob * (DB_MAX - DB_MIN) + DB_MIN;
/** `Input: (knob) ▮▮▮▯▯ ●` — the live counterpart of the Input select. */
const LiveGain = ({ label, active }) => {
    const { getGraph, audioState, setLiveInputGain } = useT3kPlayerContext();
    const graph = getGraph();
    const config = audioState.liveInputConfig;
    const channel = config?.channel ?? 0;
    const gainDb = config?.gainsDb[channel] ?? 0;
    const analyser = active ? (graph?.inputMeter ?? null) : null;
    const meterRef = useRef(null);
    const clipRef = useRef(null);
    const { resetClipLatch } = useMeterAnimation(analyser ? { analyser, meterRef, clipRef } : null, null, active);
    useEffect(() => {
        resetClipLatch('input');
        clipRef.current?.classList.remove('clipped');
    }, [channel, resetClipLatch]);
    const onKnob = useCallback((knob) => setLiveInputGain(knobToDb(knob)), [setLiveInputGain]);
    return (React.createElement("div", { className: `flex items-center gap-2 ${active ? '' : 'opacity-50'}` },
        React.createElement("span", { className: 'text-muted flex-shrink-0' },
            label,
            ":"),
        React.createElement(KnobControl, { label: 'Input gain', value: dbToKnob(gainDb), onChange: onKnob, size: 22, hideLabel: true, isDisabled: !active, tip: `${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB` }),
        React.createElement("div", { ref: meterRef, className: 'flex items-center gap-2 flex-1 min-w-0' },
            React.createElement(InputMeter, { analyser: analyser, label: 'Input level', inactive: !active }),
            React.createElement(ClipIndicator, { ref: clipRef, onClick: () => resetClipLatch('input'), size: 12, inactive: !active }))));
};

/** The mix knob's width, so its "Mix" caption can sit over it. */
const MIX_W = 'w-[22px]';
/** Wet/dry for a reverb-like IR, beside the IR's select; `50%` tip on drag. */
const MixKnob = ({ mix, disabled }) => (React.createElement("span", { className: `flex items-center flex-shrink-0 ${MIX_W}` },
    React.createElement(KnobControl, { label: 'Mix', value: mix.value, onChange: mix.set, size: 22, hideLabel: true, isDisabled: disabled, tip: `${Math.round(mix.value * 100)}%` })));
/**
 * The tone controls: primary select + on/off toggle, then an inline line
 * with the source (Input select, or live gain) and the companion select.
 * A reverb-like IR gets a mix knob next to its select. Live stacks: gain
 * row + settings gear, device name, then the companion. One code path for
 * demo and live, single tones and playlists.
 */
const Controls = ({ controller: c, disabled = false, }) => {
    const isLive = c.sourceMode === 'live';
    const device = isLive
        ? c.live.devices.find(d => d.deviceId === c.live.config?.deviceId)
        : undefined;
    const dim = c.bypassed ? 'opacity-50 grayscale' : '';
    const selectsDisabled = disabled || c.bypassed;
    const select = (slot, inline) => (React.createElement(NativeSelect, { variant: inline ? 'inline' : 'field', options: slot.options, label: inline ? `${c.labels.secondary}:` : undefined, ariaLabel: c.labels.primary, value: slot.value, onChange: slot.set, disabled: selectsDisabled }));
    const mixKnob = c.mix.show ? (React.createElement(MixKnob, { mix: c.mix, disabled: selectsDisabled })) : null;
    const mixOn = (slot) => (slot.field === 'ir' ? mixKnob : null);
    return (React.createElement("div", { className: 'flex flex-col gap-3' },
        React.createElement("div", { className: 'flex flex-col gap-1' },
            React.createElement("div", { className: 'flex items-end gap-4 text-sm text-muted' },
                React.createElement("span", { className: `flex-1 min-w-0 truncate ${dim}` }, c.labels.primary),
                mixOn(c.primary) && (
                // As wide as the knob and centred on it; the text overhangs.
                React.createElement("span", { className: `${MIX_W} flex-shrink-0 flex justify-center whitespace-nowrap ${dim}` }, "Mix")),
                React.createElement("span", { className: 'w-10 flex-shrink-0 flex justify-center whitespace-nowrap' }, c.bypassed ? 'Tone off' : 'Tone on')),
            React.createElement("div", { className: 'flex items-center gap-4' },
                React.createElement("div", { className: `flex-1 min-w-0 ${dim}` }, select(c.primary, false)),
                mixOn(c.primary) && React.createElement("span", { className: dim }, mixOn(c.primary)),
                React.createElement(ToggleSimple, { label: '', onChange: c.toggleBypass, isChecked: !c.bypassed, ariaLabel: 'Tone on', disabled: disabled }))),
        isLive ? (
        // Live stacks: a bordered input group (gain row, interface name
        // under it) in the select's column with the settings gear beside it
        // in the toggle's column, then the companion.
        React.createElement("div", { className: 'flex flex-col gap-2 text-sm min-w-0' },
            React.createElement("div", { className: 'flex items-center gap-4' },
                React.createElement("div", { className: 'flex-1 min-w-0 flex flex-col gap-1 border border-line rounded-md px-4 py-3' },
                    React.createElement(LiveGain, { label: c.labels.input, active: c.isActive }),
                    React.createElement("div", { className: 'flex items-center gap-x-2 text-xs text-muted min-w-0' },
                        React.createElement("span", { className: 'truncate' }, device?.label ?? 'Interface'),
                        c.live.config && (c.live.config.channelCount ?? 0) >= 2 && (React.createElement("span", { className: 'flex-shrink-0' },
                            "Input ",
                            c.live.config.channel + 1)))),
                React.createElement("button", { type: 'button', onClick: () => c.setView('settings'), disabled: disabled, className: 'w-10 flex-shrink-0 flex justify-center p-1 rounded text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:cursor-not-allowed disabled:opacity-50', "aria-label": 'Audio settings' },
                    React.createElement(Settings, { size: 24 }))),
            React.createElement("span", { className: `min-w-0 flex items-center gap-3 ${dim}` },
                select(c.companion, true),
                mixOn(c.companion)))) : (
        // Demo: `.t3k-inline-row` is one truncating row, or two stacked rows
        // under ~380px — decided by the player's width, never by the option
        // text, so it's the same height as `ControlsSkeleton`.
        React.createElement("div", { className: 't3k-inline-row flex flex-nowrap items-center gap-x-5 gap-y-1 text-sm min-w-0' },
            React.createElement(NativeSelect, { variant: 'inline', options: c.inputOptions, label: `${c.labels.input}:`, value: c.selection?.input.url ?? '', onChange: c.setInput, disabled: disabled }),
            React.createElement("span", { className: `min-w-0 flex items-center gap-3 ${dim}` },
                select(c.companion, true),
                mixOn(c.companion))))));
};

const Bar = ({ className }) => (React.createElement("span", { className: `t3k-skeleton block rounded ${className}` }));
/**
 * Placeholder for `Controls` while a lazy tone resolves. Mirrors its
 * structure and spacing exactly (same wrappers, the field select's padding
 * and type size, the toggle's box) so swapping it for the real controls
 * doesn't move anything — important for embeds, where every height change
 * is a frame resize.
 */
const ControlsSkeleton = () => (React.createElement("div", { className: 'flex flex-col gap-3', role: 'status', "aria-label": 'Loading tone' },
    React.createElement("div", { className: 'flex flex-col gap-1' },
        React.createElement("div", { className: 'flex items-center justify-between text-sm' },
            React.createElement("span", { className: 'flex items-center h-5' },
                React.createElement(Bar, { className: 'h-3 w-24' })),
            React.createElement("span", { className: 'flex items-center justify-center h-5 w-10 flex-shrink-0' },
                React.createElement(Bar, { className: 'h-3 w-14' }))),
        React.createElement("div", { className: 'flex items-center gap-4' },
            React.createElement("div", { className: 'relative flex-1 min-w-0 px-4 py-3 text-md border border-line rounded-md' },
                React.createElement("span", { className: 'invisible' }, "\u00B7"),
                React.createElement(Bar, { className: 'absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-2/3' })),
            React.createElement("span", { className: 'w-10 h-6 rounded-full bg-toggle-off opacity-50 flex-shrink-0' }))),
    React.createElement("div", { className: 't3k-inline-row flex flex-nowrap items-center gap-x-5 gap-y-1 text-sm min-w-0' },
        React.createElement("span", { className: 'flex items-center h-5 min-w-0' },
            React.createElement(Bar, { className: 'h-3 w-36' })),
        React.createElement("span", { className: 'flex items-center h-5 min-w-0' },
            React.createElement(Bar, { className: 'h-3 w-32' })))));

/** Instrument glyph for the "Play Live" screen; colored by `currentColor`. */
const Guitar = ({ size = 64 }) => (React.createElement("svg", { width: size, height: size, "aria-hidden": 'true', viewBox: '0 0 64 64', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M58.3304 6.02963C58.2244 6.04282 58.0256 6.10872 57.9991 5.95055C57.9859 5.87147 58.0058 5.79239 58.0124 5.71331C58.019 5.63423 58.0058 5.55515 57.9793 5.48265C57.9395 5.3838 57.8733 5.29154 57.7871 5.23223C57.5552 5.06748 57.0782 5.08066 56.588 4.83023C56.0977 4.57322 55.6339 3.99988 55.6339 3.99988L55.402 4.53368C55.137 5.04112 54.819 5.51561 54.4745 5.96373L54.3287 5.81875L54.342 5.80557C54.3817 5.76603 54.3883 5.68695 54.3486 5.64741C54.3353 5.63423 54.3155 5.62105 54.2956 5.61446L54.3221 5.32449L53.8384 4.73138C53.8384 4.73138 53.5204 5.08725 53.3415 5.00817L53.3084 5.04771C53.3879 5.22564 53.0301 5.54197 53.0301 5.54197L53.6264 6.02305L53.9179 5.99668C53.9246 6.01646 53.9312 6.03623 53.9444 6.04941C53.9842 6.08895 54.0571 6.08895 54.1035 6.04941L54.1233 6.02963L54.2956 6.20098C53.9577 6.61616 53.5933 6.99179 53.2289 7.34107L53.0169 7.13019L53.0368 7.11041C53.0765 7.07087 53.0765 6.99838 53.0368 6.95884C53.0235 6.94566 53.0036 6.93248 52.9838 6.92589L53.0103 6.63593L52.5266 6.04282C52.5266 6.04282 52.2086 6.39868 52.0297 6.3196L51.9966 6.35255C52.0761 6.53048 51.7183 6.84681 51.7183 6.84681L52.3146 7.32789L52.6061 7.30153C52.6127 7.3213 52.6194 7.34107 52.6393 7.35425C52.679 7.39379 52.7519 7.40038 52.7983 7.35425L52.8181 7.33448L53.0235 7.53877C52.5796 7.94736 52.1357 8.30323 51.7382 8.59978L51.6388 8.50093L51.6587 8.48116C51.6984 8.44162 51.6984 8.36913 51.6587 8.32959C51.6454 8.31641 51.6256 8.30323 51.6057 8.30323L51.6322 8.01326L51.1485 7.42015C51.1485 7.42015 50.8305 7.77602 50.6516 7.69694L50.6185 7.72989C50.698 7.90782 50.3403 8.22414 50.3403 8.22414L50.9365 8.70522L51.2281 8.67886C51.2347 8.69863 51.2413 8.7184 51.2612 8.73158C51.3009 8.77113 51.3738 8.77772 51.4136 8.73158L51.4334 8.71181L51.4997 8.77772C50.7047 9.34447 50.1349 9.66079 50.1349 9.66079C50.3933 11.4467 49.5055 12.3627 49.5055 12.3627L27.0456 33.9454C27.0456 33.9454 24.3756 36.5419 23.0902 34.2419C22.0302 32.3506 23.9648 30.8678 24.6737 30.4065C24.7665 30.3472 24.74 30.2022 24.6339 30.1824C21.0894 29.3257 17.6111 31.8827 15.9879 34.868C15.3386 36.0542 15.1663 37.3986 14.1195 38.3542C13.8943 38.5585 13.6425 38.743 13.3775 38.8946C12.1121 39.6129 10.5154 39.4547 9.13066 39.7579C7.48095 40.1203 6.16251 41.0891 5.17533 42.4401C4.47305 43.3956 4.06228 44.5291 4.00928 45.7087C3.83039 49.3729 6.26852 52.5691 8.75964 55.0865C8.99153 55.3171 9.21679 55.5478 9.44868 55.7653C10.7009 56.9779 12.0259 58.1377 13.5696 58.9549C16.4715 60.5036 20.1155 60.4904 22.3747 57.828C23.7462 56.2068 24.2629 54.0387 24.5346 51.9825C25.0778 47.8374 28.2183 49.1027 31.0738 46.3085C33.492 43.936 33.2204 41.0891 33.0746 40.2785C33.0548 40.1796 32.9421 40.1401 32.8692 40.206C32.3723 40.6541 30.8088 41.8403 29.4506 40.5882C27.7479 39.112 29.3711 37.2866 29.3711 37.2866C29.3909 37.2668 51.6123 14.5375 51.6123 14.5375C51.6123 14.5375 52.5332 13.6478 54.3287 13.9114C54.3287 13.9114 54.6467 13.3381 55.2231 12.5539L55.3358 12.6659L55.3159 12.6857C55.2761 12.7252 55.2761 12.7977 55.3159 12.8372C55.3291 12.8504 55.349 12.8636 55.3689 12.8702L55.3424 13.1601L55.826 13.7533C55.826 13.7533 56.1441 13.3974 56.3229 13.4765L56.3561 13.4435C56.2766 13.2656 56.6343 12.9493 56.6343 12.9493L56.038 12.4682L55.7465 12.4945C55.7399 12.4748 55.7333 12.455 55.7134 12.4418C55.667 12.3957 55.6008 12.3957 55.5544 12.4418L55.5345 12.4616L55.3888 12.3166C55.6736 11.941 56.0115 11.5258 56.3892 11.1106L56.641 11.361L56.6211 11.3808C56.5747 11.4269 56.5747 11.4928 56.6211 11.539C56.6343 11.5522 56.6542 11.5653 56.6741 11.5653L56.6476 11.8553L57.1312 12.4484C57.1312 12.4484 57.4492 12.0925 57.6281 12.1716L57.6613 12.1387C57.5817 11.9607 57.9395 11.6444 57.9395 11.6444L57.3432 11.1633L57.0517 11.1897C57.0451 11.1699 57.0385 11.1502 57.0186 11.137C56.9788 11.0908 56.906 11.0908 56.8662 11.137L56.8463 11.1567L56.5813 10.8931C56.9457 10.5043 57.3499 10.1221 57.7938 9.75964L58.019 9.98371L57.9991 10.0035C57.9594 10.0496 57.9594 10.1155 57.9991 10.1616C58.0124 10.1748 58.0323 10.188 58.0522 10.188L58.0256 10.478L58.5093 11.0711C58.5093 11.0711 58.8273 10.7152 59.0062 10.7943L59.0393 10.7613C58.9598 10.5834 59.3176 10.2671 59.3176 10.2671L58.7213 9.786L58.4298 9.81236C58.4232 9.79259 58.4165 9.77282 58.4033 9.75964C58.3635 9.7201 58.2907 9.7201 58.2443 9.75964L58.2244 9.77941L58.0256 9.58171C58.4762 9.23902 58.9532 8.91611 59.4633 8.65909L60 8.42844C60 8.42844 59.417 7.96713 59.1652 7.47946C59.1122 7.37402 59.0658 7.26858 59.0261 7.15655C58.9664 6.99179 58.9333 6.81386 58.8936 6.64911C58.8472 6.47117 58.7942 6.28665 58.6418 6.17462C58.5954 6.056 58.4563 6.00986 58.3304 6.02963ZM17.7767 58.2102C17.4455 58.5397 16.9088 58.5397 16.5842 58.2102C16.2529 57.8807 16.2529 57.3469 16.5842 57.024C16.9154 56.6945 17.4521 56.6945 17.7767 57.024C18.108 57.3535 18.108 57.8807 17.7767 58.2102ZM15.9879 56.4309C15.6566 56.7604 15.12 56.7604 14.7953 56.4309C14.4707 56.1014 14.4641 55.5676 14.7953 55.2447C15.1266 54.9151 15.6632 54.9151 15.9879 55.2447C16.3125 55.5742 16.3125 56.1014 15.9879 56.4309ZM20.6124 56.8065C20.2811 57.136 19.7445 57.136 19.4198 56.8065C19.0952 56.477 19.0885 55.9432 19.4198 55.6203C19.7511 55.2908 20.2877 55.2908 20.6124 55.6203C20.937 55.9498 20.9436 56.477 20.6124 56.8065ZM18.7043 54.9086C18.373 55.2381 17.8364 55.2381 17.5117 54.9086C17.1871 54.5791 17.1804 54.0453 17.5117 53.7223C17.843 53.3928 18.3796 53.3928 18.7043 53.7223C19.0289 54.0518 19.0355 54.5791 18.7043 54.9086ZM27.887 38.5585C27.887 38.5585 26.9926 40.4696 28.6025 41.781C29.656 42.6378 30.6365 42.7432 31.1533 42.4796C31.6701 42.216 30.4709 45.2211 27.9996 46.6182C27.0721 47.1454 25.906 47.4288 25.0845 48.1207C24.1635 48.8918 23.6402 50.3021 23.4613 51.4553C22.7987 51.3763 22.229 50.9149 21.8314 50.3811C21.4339 49.8473 21.1689 49.2213 20.8509 48.6414C20.2148 47.4815 19.3867 46.4468 18.2339 45.7615C17.5316 45.3463 16.7829 45.03 16.0608 44.6477C15.862 44.5423 13.9672 43.1254 14.4972 42.8289C14.4972 42.8289 20.5991 39.3559 21.2153 34.9603C21.2153 34.9603 21.7784 35.6193 22.1759 35.8433C22.5735 36.0608 23.1499 36.3244 23.819 36.1069C24.4882 35.8961 25.1706 35.8697 25.1706 35.8697L27.887 38.5585Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M27.1184 39.7316C27.231 39.8437 27.2045 39.9557 27.1184 40.048L25.6542 41.5044C25.5681 41.59 25.4289 41.59 25.3362 41.5044L22.1825 38.3675C22.0964 38.2818 22.0964 38.1434 22.1825 38.0512L23.6467 36.5947C23.7328 36.5091 23.872 36.5091 23.9316 36.5684L27.1184 39.7316Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M17.6178 42.8421C17.5317 42.7565 17.5317 42.6181 17.6178 42.5258L19.082 41.0694C19.1681 40.9837 19.3073 40.9837 19.4 41.0694L22.5802 44.2326C22.6663 44.3183 22.6663 44.4567 22.5802 44.549L21.116 46.0054C21.0299 46.0911 20.8907 46.0911 20.798 46.0054L17.6178 42.8421Z', fill: 'currentColor' })));

/** Matches the controls' height so the panel doesn't jump between tabs. */
const MIN_HEIGHT = 'min-h-[150px]';
/** The host page's `<iframe>` lacks `allow="microphone"`: nothing to retry. */
function EmbedDenied({ href, linkTarget, }) {
    return (React.createElement("div", { className: `flex flex-col justify-center gap-4 ${MIN_HEIGHT}` },
        React.createElement(Alert, { variant: 'warning' },
            React.createElement("span", { className: 'font-semibold text-base' }, "This embed can't use your audio interface"),
            React.createElement("p", { className: 'text-muted-2' },
                "The page embedding this player hasn't allowed microphone access.",
                href ? ' Open the tone on TONE3000 to plug in and play.' : '')),
        href && (React.createElement("div", null,
            React.createElement(Button, { variant: 'secondary', onClick: () => window.open(href, linkTarget) }, "Open on TONE3000")))));
}
/**
 * The "Play Live" takeover shown in the controls' place until an interface
 * is connected. Connect opens the inline setup wizard (permission →
 * interface); with permission already granted it also starts connecting.
 */
const LiveConnect = ({ controller: c, disabled = false, href, linkTarget = '_blank', }) => {
    const { live } = c;
    // Inside an iframe whose host didn't grant the microphone, both the
    // untouched and the already-denied states mean the same thing.
    if (isFramed &&
        microphoneAllowedByPolicy() === false &&
        (live.status === 'connect' || live.status === 'blocked')) {
        return React.createElement(EmbedDenied, { href: href, linkTarget: linkTarget });
    }
    if (live.status === 'connecting' || live.status === 'pending') {
        return (React.createElement("div", { className: `flex items-center justify-center gap-3 ${MIN_HEIGHT} text-muted-2`, role: 'status' },
            React.createElement(LoaderCircle, { size: 24, className: 'animate-spin', "aria-hidden": 'true' }),
            live.status === 'pending'
                ? 'Waiting for microphone permission…'
                : 'Connecting to your interface…'));
    }
    const connect = () => {
        c.setView('settings');
        if (live.permission === 'granted')
            void live.connect();
    };
    return (React.createElement("div", { className: `flex flex-col items-center justify-center gap-5 text-center ${MIN_HEIGHT}` },
        React.createElement("div", { className: 'flex flex-col items-center gap-2 text-muted' },
            React.createElement(Guitar, { size: 56 }),
            React.createElement("h3", { className: 'font-semibold text-fg' }, "Play Live"),
            React.createElement("p", { className: 'text-sm text-muted-2 max-w-[360px]' }, "Play this tone with your own instrument by connecting it to an audio interface. Nothing to install.")),
        React.createElement(Button, { variant: 'secondary', onClick: connect, disabled: disabled }, "Connect"),
        live.error && live.permission !== 'blocked' && (React.createElement(Alert, { variant: 'error' }, live.error))));
};

const ArrowButton = ({ onClick, disabled, label, children }) => (React.createElement("button", { type: 'button', onClick: onClick, disabled: disabled, "aria-label": label, className: 'flex items-center justify-center w-7 h-7 -mx-1 rounded text-muted-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-2' }, children));
/** ‹ n/N › — steps the active tone of a playlist. */
const Pager = ({ index, count, onStep, disabled = false, className = '', }) => (React.createElement("div", { className: `flex items-center gap-1 flex-shrink-0 ${className}`, role: 'group', "aria-label": 'Tones' },
    React.createElement(ArrowButton, { onClick: () => void onStep(-1), disabled: disabled || index <= 0, label: 'Previous tone' },
        React.createElement(ChevronLeft, { size: 20 })),
    React.createElement("span", { className: 'text-sm text-muted-2 tabular-nums min-w-[3ch] text-center', "aria-live": 'polite' },
        index + 1,
        "/",
        count),
    React.createElement(ArrowButton, { onClick: () => void onStep(1), disabled: disabled || index >= count - 1, label: 'Next tone' },
        React.createElement(ChevronRight, { size: 20 }))));

const Skip = ({ opacity = 0.6, size = 32 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M16 32C13.8144 32 11.7542 31.5817 9.81961 30.7451C7.89542 29.9085 6.19608 28.7529 4.72157 27.2784C3.24706 25.8039 2.0915 24.1046 1.2549 22.1804C0.418301 20.2458 0 18.1856 0 16C0 13.8144 0.418301 11.7595 1.2549 9.83529C2.0915 7.90065 3.24183 6.19608 4.70588 4.72157C6.18039 3.24706 7.87974 2.0915 9.80392 1.2549C11.7386 0.418301 13.7987 0 15.9843 0C18.1699 0 20.2301 0.418301 22.1647 1.2549C24.0993 2.0915 25.8039 3.24706 27.2784 4.72157C28.7529 6.19608 29.9085 7.90065 30.7451 9.83529C31.5817 11.7595 32 13.8144 32 16C32 18.1856 31.5817 20.2458 30.7451 22.1804C29.9085 24.1046 28.7529 25.8039 27.2784 27.2784C25.8039 28.7529 24.0993 29.9085 22.1647 30.7451C20.2405 31.5817 18.1856 32 16 32ZM8.95686 21.1608C8.95686 21.8301 9.2915 22.1647 9.96078 22.1647H11.702C12.3712 22.1647 12.7059 21.8301 12.7059 21.1608V16.4863C12.8209 16.7477 13.0353 16.9673 13.349 17.1451L21.0667 21.6784C21.2131 21.7725 21.3542 21.8405 21.4902 21.8824C21.6366 21.9242 21.783 21.9451 21.9294 21.9451C22.2327 21.9451 22.4889 21.8405 22.698 21.6314C22.9072 21.4222 23.0118 21.1033 23.0118 20.6745V11.3725C23.0118 10.9542 22.9072 10.6405 22.698 10.4314C22.4889 10.2118 22.2327 10.102 21.9294 10.102C21.783 10.102 21.6366 10.1229 21.4902 10.1647C21.3542 10.2065 21.2131 10.2745 21.0667 10.3686L13.349 14.902C13.0353 15.0797 12.8209 15.2993 12.7059 15.5608V10.8392C12.7059 10.1699 12.3712 9.83529 11.702 9.83529H9.96078C9.2915 9.83529 8.95686 10.1699 8.95686 10.8392V21.1608Z', fill: 'var(--t3k-accent)', fillOpacity: opacity })));

const INNER_CIRCLE_SIZE = 16;
const RING_GAP = 2;
const RING_STROKE = 2;
/**
 * The Live-mode counterpart of PlayButton: a dot with a ring that breathes
 * with the input level while monitoring. Click to mute / unmute.
 */
const MonitorButton = ({ isMonitoring, onClick, analyserNode, size = 48, disabled = false, trailing, }) => {
    const bufferRef = useRef(new Float32Array(2048));
    const ringRef = useRef(null);
    const center = size / 2;
    const innerRadius = INNER_CIRCLE_SIZE / 2;
    const ringMinRadius = innerRadius + RING_GAP + RING_STROKE / 2;
    const ringMaxRadius = size / 2 - RING_STROKE / 2 - 1;
    // The ring follows the level at frame rate. It's written straight to the
    // SVG node: a React state update per frame would re-render the button
    // (and its trailing slot) 60×/s alongside the scope and meter loops, and
    // a CSS transition on `r` would keep chasing targets it never reaches.
    useEffect(() => {
        const ring = ringRef.current;
        if (!ring)
            return;
        if (!isMonitoring || !analyserNode) {
            ring.setAttribute('r', String(ringMinRadius));
            return;
        }
        let frame = 0;
        const buffer = bufferRef.current;
        const animate = () => {
            const levels = calculateLevels(analyserNode, buffer);
            const glow = scaleForDisplay(levels.rms);
            ring.setAttribute('r', String(ringMinRadius + glow * (ringMaxRadius - ringMinRadius)));
            frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [isMonitoring, analyserNode, ringMinRadius, ringMaxRadius]);
    const color = isMonitoring ? 'var(--t3k-danger)' : 'var(--t3k-muted)';
    return (React.createElement("button", { type: 'button', onClick: onClick, disabled: disabled, "aria-label": isMonitoring ? 'Mute' : 'Unmute', "aria-pressed": isMonitoring, className: `monitor-button-reset-focus flex items-center gap-3 p-0 flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${trailing ? 'rounded' : 'rounded-full'}`, style: { WebkitTapHighlightColor: 'transparent' } },
        React.createElement("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": 'true', style: { display: 'block', overflow: 'visible', flexShrink: 0 } },
            React.createElement("circle", { cx: center, cy: center, r: innerRadius, fill: color }),
            React.createElement("circle", { ref: ringRef, cx: center, cy: center, r: ringMinRadius, fill: 'none', stroke: color, strokeWidth: RING_STROKE })),
        trailing));
};

const Mute = ({ size = 24 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M22.7334 2.7334L2.7334 22.7334L1.2666 21.2666L21.2666 1.2666L22.7334 2.7334Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M16.6401 11.9741V22.3022L10.0688 17.5336L11.2876 15.8549L14.5659 18.2338V11.9741H16.6401Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M3.21289 14.4705V9.42654C3.21289 8.32652 4.07804 7.25662 5.32324 7.25662H8.81738L16.6396 1.59744V8.34549H14.5664V5.65701L9.49023 9.32986H5.33301C5.33064 9.33149 5.32637 9.33418 5.32129 9.33963C5.30056 9.36195 5.28711 9.39571 5.28711 9.42654V14.4705C5.2872 14.4978 5.29735 14.5193 5.30957 14.532L5.32031 14.5398H8.63086V16.614H5.32324C4.10813 16.614 3.21308 15.6021 3.21289 14.4705Z', fill: 'currentColor' })));
const Unmute = ({ size = 24 }) => (React.createElement("svg", { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement("path", { d: 'M16.6401 11.974V22.3021L10.0688 17.5336L11.2876 15.8549L14.5659 18.2338V11.974H16.6401Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M3.21289 14.4705V9.42651C3.21289 8.32649 4.07804 7.25659 5.32324 7.25659H8.81738L16.6396 1.59741V8.34546H14.5664V5.65698L9.49023 9.32983H5.33301C5.33064 9.33146 5.32637 9.33415 5.32129 9.3396C5.30056 9.36192 5.28711 9.39568 5.28711 9.42651V14.4705C5.2872 14.4978 5.29735 14.5192 5.30957 14.532L5.32031 14.5398H8.63086V16.614H5.32324C4.10813 16.614 3.21308 15.6021 3.21289 14.4705Z', fill: 'currentColor' }),
    React.createElement("path", { d: 'M16.64 22.3L8.81583 16.6111H5.32113C4.10561 16.6111 3.20996 15.599 3.20996 14.4676V9.42567C3.20996 8.32598 4.07564 7.25638 5.32113 7.25638H8.81679L16.64 1.59998V22.3ZM5.28479 14.4676C5.28479 14.4951 5.29547 14.5169 5.30774 14.5297C5.31258 14.5347 5.31609 14.5368 5.3173 14.5374C5.31768 14.5374 5.31989 14.5383 5.32113 14.5383H9.48992L14.5661 18.228V5.6576L9.488 9.32915H5.32973C5.32728 9.33089 5.32302 9.33358 5.31826 9.3387C5.29753 9.36102 5.28479 9.39484 5.28479 9.42567V14.4676Z', fill: 'currentColor' })));

const CANVAS_STYLE = {
    marginBottom: -20,
    marginTop: -20,
    width: '100%',
    height: '130px',
};
/**
 * Transport + waveform. Demo: play, skip, waveform, time. Live: LED ·
 * LIVE | mute/unmute, scope. Same bar, same visualizer.
 */
const Playbar = ({ controller: c, disabled = false, headerSlot, expandToggle = false, }) => {
    const { getGraph, audioState } = useT3kPlayerContext();
    const isLive = c.sourceMode === 'live';
    const isMonitoring = isLive && c.isActive;
    const engineReady = audioState.initState === 'ready';
    return (React.createElement("div", { className: 'flex items-center gap-3 sm:gap-4 overflow-hidden w-full min-h-[80px]' },
        isLive ? (React.createElement(React.Fragment, null,
            React.createElement(MonitorButton, { isMonitoring: isMonitoring, onClick: () => void c.togglePlay(), disabled: disabled || c.live.status !== 'ready', analyserNode: isMonitoring && engineReady
                    ? (getGraph()?.inputMeter ?? null)
                    : null, size: 48, trailing: React.createElement("span", { className: 'flex items-center gap-3 sm:gap-4' },
                    React.createElement("span", { className: `hidden sm:block text-sm font-mono ${isMonitoring ? 'text-fg' : 'text-muted'}` }, "LIVE"),
                    React.createElement("span", { className: 'w-px h-10 bg-line', "aria-hidden": 'true' }),
                    React.createElement("span", { className: c.live.status === 'ready' ? 'text-fg' : 'text-muted' }, isMonitoring ? React.createElement(Unmute, null) : React.createElement(Mute, null))) }))) : (React.createElement(React.Fragment, null,
            React.createElement(PlayButton, { isPlaying: c.isActive, isBusy: c.busyToneId === c.activeToneId, disabled: disabled, onClick: () => void c.togglePlay() }),
            React.createElement("button", { type: 'button', onClick: c.skipToStart, disabled: disabled, className: 'p-0 flex-shrink-0 focus:outline-none disabled:cursor-not-allowed', "aria-label": 'Skip to start' },
                React.createElement(Skip, { opacity: c.currentTime > 0 && !disabled ? 1 : 0.6 })))),
        React.createElement("div", { ref: c.canvasWrapperRef, className: 'flex-1 min-w-0' },
            React.createElement("canvas", { ref: c.visualizerRef, height: 130, style: CANVAS_STYLE })),
        !isLive && (React.createElement("div", { className: `hidden sm:flex text-sm font-mono gap-1 text-muted tabular-nums ${disabled ? 'opacity-50' : ''}` },
            React.createElement("span", null, formatTime(c.isActive ? c.currentTime : 0)),
            React.createElement("span", null, "/"),
            React.createElement("span", null, formatTime(c.isActive ? c.duration : 0)))),
        headerSlot,
        expandToggle && (React.createElement("button", { type: 'button', onClick: () => c.setExpanded(!c.expanded), disabled: disabled, className: 'p-0 flex-shrink-0 focus:outline-none text-fg disabled:cursor-not-allowed disabled:opacity-50', "aria-label": c.expanded ? 'Hide controls' : 'Show controls', "aria-expanded": c.expanded }, c.expanded ? React.createElement(ChevronUp, { size: 24 }) : React.createElement(ChevronDown, { size: 24 })))));
};

/** The full TONE3000 wordmark. `LogoSm` is the T3K mark for tight spots. */
const Logo = ({ height = 32, className }) => (React.createElement("svg", { width: (height * 210) / 32, height: height, viewBox: '0 0 210 32', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', className: className, "aria-hidden": 'true' },
    React.createElement("g", null,
        React.createElement("path", { d: 'M56.2412 25.6642V22.1787C55.8214 22.7661 55.3277 23.3051 54.753 23.7924C52.2832 25.8933 48.3415 27.0036 43.357 27.0036C40.2836 27.0036 35.8996 26.5164 32.484 24.2023C30.4017 22.792 29.2203 20.678 28.8878 17.7798C28.8231 18.322 28.7877 18.8868 28.7877 19.4839C28.7877 19.7259 28.7942 19.9615 28.8005 20.1939C28.7942 20.3811 28.7877 20.5683 28.7877 20.7619C28.7877 24.5961 29.9982 27.2781 32.484 28.9658C35.8996 31.2832 40.2805 31.7673 43.357 31.7673C48.3415 31.7673 52.2832 30.657 54.753 28.5561C55.3277 28.0686 55.8214 27.5297 56.2412 26.9423V31.4478H67.0884V26.6841H56.2412V25.6642Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M109.76 8.45915C110.519 7.73947 111.484 7.12303 112.653 6.61634C115.164 5.5287 118.238 4.97682 121.789 4.97682C125.524 4.97682 128.733 5.59326 131.332 6.80674C132.707 7.44899 133.714 8.18485 134.353 9.00458C134.618 8.71413 134.902 8.43981 135.209 8.17838C137.691 6.08381 141.623 4.97682 146.585 4.97682C151.002 4.97682 154.663 5.88693 157.165 7.60713C157.762 8.01379 158.285 8.47207 158.746 8.96909C159.002 8.69154 159.276 8.42689 159.573 8.17838C162.055 6.08381 165.988 4.97682 170.949 4.97682C175.337 4.97682 178.849 5.86112 181.39 7.60713C182.013 8.03639 182.565 8.51404 183.049 9.0401C183.32 8.73673 183.614 8.44948 183.937 8.17838C186.419 6.08381 190.352 4.97682 195.314 4.97682C199.73 4.97682 203.387 5.88693 205.889 7.60713C207.978 9.0401 209.227 11.0185 209.683 13.6165C209.815 12.8742 209.88 12.0803 209.88 11.2315C209.88 7.4264 208.575 4.68313 205.886 2.84029C203.384 1.12011 199.726 0.209991 195.31 0.209991C190.348 0.209991 186.416 1.31698 183.934 3.41154C183.614 3.68264 183.32 3.96989 183.046 4.27326C182.562 3.7472 182.013 3.26955 181.387 2.84029C178.849 1.09429 175.334 0.209991 170.946 0.209991C165.984 0.209991 162.052 1.31698 159.57 3.41154C159.273 3.66327 158.998 3.92793 158.743 4.20225C158.282 3.70201 157.758 3.24696 157.161 2.84029C154.659 1.12011 150.998 0.209991 146.582 0.209991C141.62 0.209991 137.688 1.31698 135.206 3.41154C134.896 3.67297 134.612 3.9473 134.35 4.23775C133.711 3.42124 132.707 2.68538 131.328 2.03991C128.73 0.82642 125.521 0.209991 121.785 0.209991C118.05 0.209991 115.161 0.761872 112.649 1.8495C111.481 2.3562 110.516 2.97263 109.757 3.69232V0.655367H78.7941V5.41898H109.757V8.45593L109.76 8.45915Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M33.6398 7.07784C36.0805 5.69976 39.4153 4.98005 43.4153 4.98005C47.8347 4.98005 51.4925 5.89016 53.9943 7.61035C54.8983 8.23001 55.644 8.95617 56.2381 9.78885V5.42221H66.0424L78.791 15.7046V10.941L66.0424 0.658594H56.2381V5.02524C55.644 4.19256 54.8983 3.4664 53.9943 2.84676C51.4925 1.12656 47.8347 0.216442 43.4153 0.216442C39.4122 0.216442 36.0805 0.936145 33.6398 2.31424V0.658594H0.094574V5.42221H33.6398V7.07784Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M148.71 14.0554C147.657 13.2357 146.773 13.2357 146.392 13.2357C145.746 13.2357 145.071 13.5132 144.387 14.0651C143.967 14.4008 143.096 15.3754 142.795 17.7379C143.096 20.1197 143.977 21.0814 144.397 21.4106C145.449 22.2336 146.292 22.2336 146.653 22.2336C147.325 22.2336 148.016 21.9528 148.706 21.4009C149.187 21.0169 149.93 20.0551 150.185 17.725C149.933 15.3787 149.187 14.4266 148.71 14.0522V14.0554Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M122.279 21.0233C122.018 21.0233 121.408 21.0492 120.268 21.2105L119.31 21.3461C120.236 22.2272 121.347 22.2336 121.86 22.2336C122.531 22.2336 123.435 22.1658 124.475 21.6333C124.539 21.601 124.597 21.5623 124.659 21.5268C123.961 21.1718 123.251 21.0201 122.279 21.0201V21.0233Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M108.482 16.6954V17.9735V18.2575V18.9965L116.34 18.4285L116.378 18.28L115.497 18.4059L115.917 16.6825L108.482 15.966V16.6954Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M173.074 14.0554C172.021 13.2357 171.137 13.2357 170.756 13.2357C170.11 13.2357 169.435 13.5132 168.751 14.0651C168.331 14.4008 167.46 15.3754 167.159 17.7379C167.46 20.1197 168.341 21.0814 168.761 21.4106C169.813 22.2336 170.656 22.2336 171.017 22.2336C171.689 22.2336 172.379 21.9528 173.07 21.4009C173.551 21.0169 174.294 20.0551 174.549 17.725C174.297 15.3787 173.551 14.4266 173.074 14.0522V14.0554Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M197.434 14.0554C196.382 13.2357 195.497 13.2357 195.117 13.2357C194.471 13.2357 193.796 13.5132 193.112 14.0651C192.692 14.4008 191.82 15.3754 191.52 17.7379C191.82 20.1197 192.702 21.0814 193.121 21.4106C194.174 22.2336 195.017 22.2336 195.378 22.2336C196.05 22.2336 196.74 21.9528 197.431 21.4009C197.912 21.0169 198.655 20.0551 198.91 17.725C198.658 15.3787 197.912 14.4266 197.434 14.0522V14.0554Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M45.5426 14.0554C44.4902 13.2357 43.6055 13.2357 43.2248 13.2357C42.5791 13.2357 41.9044 13.5132 41.2199 14.0651C40.7453 14.4492 40.0028 15.4109 39.7511 17.7379C40.0028 20.0809 40.7485 21.0362 41.2296 21.4106C42.282 22.2336 43.1247 22.2336 43.4862 22.2336C44.1577 22.2336 44.8486 21.9528 45.5394 21.4009C46.0203 21.0169 46.7628 20.0551 47.0148 17.725C46.7628 15.3787 46.0172 14.4266 45.5394 14.0522L45.5426 14.0554Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M11.3291 10.4698H0.094574V13.9554V15.2334H11.3291V13.9554V10.4698Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M11.329 30.1697V31.4478H22.3473V30.1697V26.6841H11.329V30.1697Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M30.1081 10.4698H22.3505V15.2334H28.8102C28.9007 13.3874 29.3333 11.8092 30.1081 10.4698Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M206.645 23.7924C204.175 25.8933 200.233 27.0036 195.249 27.0036C192.172 27.0036 187.791 26.5164 184.376 24.2023C183.879 23.8666 183.436 23.4858 183.04 23.0695C182.804 23.3212 182.552 23.5633 182.281 23.7924C179.811 25.8933 175.869 27.0036 170.885 27.0036C167.808 27.0036 163.428 26.5164 160.012 24.2023C159.515 23.8666 159.073 23.4858 158.675 23.0695C158.44 23.3212 158.188 23.5633 157.917 23.7924C155.447 25.8933 151.505 27.0036 146.521 27.0036C143.444 27.0036 139.063 26.5164 135.648 24.2023C135.345 23.9957 135.06 23.773 134.792 23.5375C134.182 24.028 133.44 24.4832 132.562 24.8994C129.634 26.2936 126.057 27.0036 121.928 27.0036C118.047 27.0036 114.712 26.3712 112.02 25.1253C111.481 24.8768 110.99 24.609 110.548 24.3248V26.6841H79.8015L67.0819 16.4049V21.1686L79.8015 31.4478H110.548V29.0885C110.99 29.3726 111.481 29.6405 112.02 29.889C114.712 31.1348 118.044 31.7673 121.928 31.7673C126.057 31.7673 129.637 31.0604 132.562 29.663C133.44 29.2434 134.182 28.7884 134.792 28.3011C135.057 28.5367 135.345 28.7593 135.648 28.9658C139.063 31.2832 143.444 31.7673 146.521 31.7673C151.505 31.7673 155.447 30.657 157.917 28.5561C158.188 28.3268 158.44 28.0848 158.675 27.833C159.069 28.2495 159.515 28.6303 160.012 28.9658C163.428 31.2832 167.808 31.7673 170.885 31.7673C175.869 31.7673 179.811 30.657 182.281 28.5561C182.552 28.3268 182.804 28.0848 183.04 27.833C183.433 28.2495 183.879 28.6303 184.376 28.9658C187.791 31.2832 192.172 31.7673 195.249 31.7673C200.233 31.7673 204.175 30.657 206.645 28.5561C208.821 26.7067 209.876 24.1571 209.876 20.7619C209.876 20.5489 209.87 20.3391 209.863 20.1326C209.873 19.9196 209.876 19.7033 209.876 19.4839C209.876 18.8771 209.841 18.2994 209.773 17.7443C209.46 20.2843 208.43 22.2755 206.645 23.7924Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M117.802 18.3253L118.315 19.7518C118.577 20.4779 118.925 20.9846 119.309 21.3493L120.268 21.2138C121.404 21.0524 122.018 21.0266 122.279 21.0266C123.248 21.0266 123.961 21.1783 124.659 21.5333C125.44 21.0815 125.824 20.4941 125.824 19.7421C125.824 18.9901 125.443 18.4447 124.656 18.0477C123.958 17.6927 123.248 17.541 122.276 17.541C122.015 17.541 121.404 17.5668 120.265 17.7282L116.375 18.2833L116.339 18.4318L117.799 18.3253H117.802Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M108.304 10.4698H89.6154V13.2131H108.482V15.9693L115.917 16.6857L116.746 13.2809L107.613 12.403L108.062 11.0733C108.13 10.87 108.211 10.6699 108.301 10.4763L108.304 10.4698Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M148.71 10.5699C147.657 9.75011 146.773 9.75011 146.392 9.75011C145.746 9.75011 145.071 10.0277 144.387 10.5796C143.877 10.9894 142.692 12.3385 142.692 15.9951C142.692 16.6503 142.731 17.228 142.795 17.7411C143.096 15.3787 143.967 14.404 144.387 14.0683C145.071 13.5197 145.746 13.2389 146.392 13.2389C146.769 13.2389 147.657 13.2389 148.71 14.0587C149.188 14.433 149.933 15.3819 150.185 17.7314C150.24 17.2215 150.272 16.647 150.272 15.9983C150.272 12.3417 149.294 11.0314 148.71 10.5763V10.5699Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M89.6154 18.2575V21.6398H108.007C107.817 21.2428 107.681 20.8297 107.604 20.3972L107.368 19.0772L108.482 18.9966V18.2575H89.6154Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M45.5426 10.5699C44.4902 9.75011 43.6056 9.75011 43.2246 9.75011C42.5791 9.75011 41.9042 10.0277 41.2199 10.5796C40.6389 11.0475 39.6638 12.3707 39.6638 15.9951C39.6638 16.6503 39.6961 17.228 39.7511 17.7411C40.0028 15.4142 40.7422 14.4524 41.2199 14.0683C41.9042 13.5197 42.5791 13.2389 43.2246 13.2389C43.6024 13.2389 44.4902 13.2389 45.5426 14.0587C46.0203 14.433 46.7662 15.3819 47.0179 17.7314C47.0727 17.2215 47.105 16.647 47.105 15.9983C47.105 12.3417 46.127 11.0314 45.5426 10.5763V10.5699Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M123.493 10.0793C123.006 9.84371 122.531 9.74688 121.86 9.74688C121.14 9.74688 120.636 9.85016 120.12 10.1051C119.658 10.3343 119.048 10.8216 118.764 11.8576L118.496 12.8419L120.556 12.9194C122.115 12.9065 122.864 12.6612 123.293 12.474C123.722 12.2868 124.291 11.9576 124.291 11.2153C124.291 10.473 123.69 10.1697 123.493 10.0728V10.0793Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M173.074 10.5699C172.021 9.75011 171.137 9.75011 170.756 9.75011C170.11 9.75011 169.435 10.0277 168.751 10.5796C168.241 10.9894 167.056 12.3385 167.056 15.9951C167.056 16.6503 167.095 17.228 167.16 17.7411C167.46 15.3787 168.331 14.404 168.751 14.0683C169.435 13.5197 170.11 13.2389 170.756 13.2389C171.134 13.2389 172.021 13.2389 173.074 14.0587C173.551 14.433 174.297 15.3819 174.549 17.7314C174.604 17.2215 174.636 16.647 174.636 15.9983C174.636 12.3417 173.658 11.0314 173.074 10.5763V10.5699Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M197.434 10.5699C196.382 9.75011 195.497 9.75011 195.117 9.75011C194.471 9.75011 193.796 10.0277 193.112 10.5796C192.602 10.9894 191.417 12.3385 191.417 15.9951C191.417 16.6503 191.456 17.228 191.52 17.7411C191.82 15.3787 192.692 14.404 193.112 14.0683C193.796 13.5197 194.471 13.2389 195.117 13.2389C195.494 13.2389 196.382 13.2389 197.434 14.0587C197.912 14.433 198.658 15.3819 198.91 17.7314C198.965 17.2215 198.997 16.647 198.997 15.9983C198.997 12.3417 198.019 11.0314 197.434 10.5763V10.5699Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M209.676 13.6197C209.221 11.0217 207.972 9.0401 205.883 7.61038C203.381 5.89018 199.723 4.98005 195.307 4.98005C190.345 4.98005 186.413 6.08705 183.93 8.1816C183.611 8.4527 183.317 8.73995 183.043 9.04332C182.558 8.51726 182.01 8.03961 181.383 7.61038C178.846 5.86436 175.33 4.98005 170.943 4.98005C165.981 4.98005 162.049 6.08705 159.567 8.1816C159.27 8.43336 158.995 8.69799 158.74 8.97231C158.278 8.47207 157.755 8.01702 157.158 7.61038C154.656 5.89018 150.995 4.98005 146.579 4.98005C141.617 4.98005 137.685 6.08705 135.202 8.1816C134.893 8.44303 134.608 8.71736 134.347 9.00783C133.708 8.1913 132.704 7.45544 131.325 6.80999C128.726 5.59648 125.517 4.98005 121.782 4.98005C118.047 4.98005 115.158 5.53193 112.646 6.61956C111.478 7.12625 110.512 7.74269 109.754 8.4624V5.42543H78.791V15.7079L66.0424 5.42543H56.2381V9.79207C55.644 8.95942 54.8983 8.23326 53.9943 7.6136C51.4925 5.89341 47.8347 4.98327 43.4153 4.98327C39.4122 4.98327 36.0805 5.70298 33.6398 7.08107V5.42543H0.094574V10.473H11.3291V26.6873H22.3473V10.473H30.105C29.3268 11.8124 28.8976 13.3906 28.8072 15.2367C28.7943 15.4884 28.7878 15.7401 28.7878 16.0016C28.7878 16.6277 28.8234 17.2183 28.8879 17.7831C29.2204 20.6812 30.402 22.792 32.4841 24.2055C35.8996 26.5227 40.2805 27.0068 43.3571 27.0068C48.3415 27.0068 52.2835 25.8967 54.7531 23.7957C55.3278 23.3083 55.8217 22.7694 56.2413 22.182V26.6873H67.0885V16.4082L79.8081 26.6873H110.554V24.3282C110.997 24.6121 111.487 24.88 112.027 25.1285C114.719 26.3743 118.05 27.0068 121.934 27.0068C126.063 27.0068 129.643 26.3001 132.568 24.9025C133.446 24.4832 134.189 24.028 134.799 23.5407C135.064 23.7763 135.351 23.999 135.654 24.2055C139.07 26.5227 143.451 27.0068 146.527 27.0068C151.512 27.0068 155.454 25.8967 157.923 23.7957C158.195 23.5665 158.446 23.3245 158.682 23.0727C159.076 23.4891 159.521 23.8699 160.019 24.2055C163.434 26.5227 167.815 27.0068 170.891 27.0068C175.876 27.0068 179.818 25.8967 182.287 23.7957C182.558 23.5665 182.81 23.3245 183.046 23.0727C183.44 23.4891 183.885 23.8699 184.382 24.2055C187.798 26.5227 192.179 27.0068 195.255 27.0068C200.24 27.0068 204.182 25.8967 206.651 23.7957C208.437 22.2788 209.467 20.2875 209.78 17.7476C209.848 17.1924 209.883 16.6115 209.883 16.0016C209.883 15.156 209.815 14.3653 209.686 13.623L209.676 13.6197ZM116.746 13.2744L115.917 16.6793L115.497 18.4027L116.375 18.2768L120.265 17.7217C121.401 17.5604 122.015 17.5345 122.276 17.5345C123.245 17.5345 123.958 17.6862 124.656 18.0412C125.443 18.4414 125.824 18.9966 125.824 19.7356C125.824 20.4747 125.44 21.075 124.659 21.5268C124.597 21.5623 124.539 21.5978 124.475 21.6333C123.435 22.1626 122.531 22.2336 121.86 22.2336C121.347 22.2336 120.233 22.2304 119.31 21.3461C118.929 20.9814 118.58 20.4747 118.315 19.7485L117.802 18.322L116.343 18.4285L108.485 18.9966L107.371 19.0772L107.607 20.3972C107.684 20.8297 107.82 21.2428 108.01 21.6398H89.6189V18.2575H108.485V13.2099H89.6189V10.4666H108.307C108.217 10.6602 108.136 10.8603 108.069 11.0637L107.62 12.3933L116.753 13.2712L116.746 13.2744ZM123.293 12.4772C122.864 12.6644 122.118 12.9097 120.556 12.9226L118.496 12.8452L118.764 11.8608C119.045 10.8248 119.655 10.3375 120.12 10.1084C120.636 9.85338 121.14 9.75011 121.86 9.75011C122.531 9.75011 123.006 9.84693 123.493 10.0825C123.69 10.1793 124.291 10.4666 124.291 11.225C124.291 11.9835 123.723 12.2965 123.293 12.4837V12.4772ZM150.185 17.725C149.933 20.0551 149.188 21.0169 148.706 21.4009C148.016 21.9528 147.322 22.2336 146.653 22.2336C146.292 22.2336 145.449 22.2336 144.397 21.4106C143.974 21.0814 143.096 20.1164 142.795 17.7379C142.731 17.2247 142.692 16.647 142.692 15.9919C142.692 12.3352 143.877 10.9894 144.387 10.5763C145.072 10.0277 145.746 9.74688 146.392 9.74688C146.769 9.74688 147.657 9.74688 148.71 10.5666C149.294 11.0217 150.272 12.332 150.272 15.9886C150.272 16.6406 150.24 17.2118 150.185 17.7217V17.725ZM174.549 17.725C174.297 20.0551 173.551 21.0169 173.071 21.4009C172.38 21.9528 171.685 22.2336 171.017 22.2336C170.656 22.2336 169.813 22.2336 168.761 21.4106C168.338 21.0814 167.46 20.1164 167.16 17.7379C167.095 17.2247 167.056 16.647 167.056 15.9919C167.056 12.3352 168.241 10.9894 168.751 10.5763C169.435 10.0277 170.11 9.74688 170.756 9.74688C171.134 9.74688 172.021 9.74688 173.074 10.5666C173.658 11.0217 174.636 12.332 174.636 15.9886C174.636 16.6406 174.604 17.2118 174.549 17.7217V17.725ZM198.91 17.725C198.658 20.0551 197.912 21.0169 197.431 21.4009C196.74 21.9528 196.046 22.2336 195.378 22.2336C195.017 22.2336 194.174 22.2336 193.121 21.4106C192.699 21.0814 191.821 20.1164 191.52 17.7379C191.456 17.2247 191.417 16.647 191.417 15.9919C191.417 12.3352 192.602 10.9894 193.112 10.5763C193.796 10.0277 194.471 9.74688 195.117 9.74688C195.494 9.74688 196.382 9.74688 197.434 10.5666C198.019 11.0217 198.997 12.332 198.997 15.9886C198.997 16.6406 198.965 17.2118 198.91 17.7217V17.725ZM47.018 17.725C46.7663 20.0551 46.0204 21.0169 45.5427 21.4009C44.8518 21.9528 44.1578 22.2336 43.4895 22.2336C43.1279 22.2336 42.2852 22.2336 41.2328 21.4106C40.7519 21.0362 40.006 20.0809 39.7543 17.7379C39.6995 17.2247 39.6673 16.647 39.6673 15.9919C39.6673 12.3707 40.6421 11.0443 41.2231 10.5763C41.9077 10.0277 42.5823 9.74688 43.2281 9.74688C43.6056 9.74688 44.4934 9.74688 45.5458 10.5666C46.1302 11.0217 47.1084 12.332 47.1084 15.9886C47.1084 16.6406 47.0762 17.2118 47.0211 17.7217L47.018 17.725Z', fill: '#FFFF00' }))));

/** The T3K mark. `Logo` is the full wordmark. */
const LogoSm = ({ width = 94, height = 32, className }) => (React.createElement("svg", { width: width, height: height, viewBox: '0 0 94 32', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', className: className, "aria-hidden": 'true' },
    React.createElement("g", null,
        React.createElement("path", { d: 'M33.607 6.68409C33.6555 6.6615 33.7005 6.64215 33.7456 6.61956C36.255 5.53192 39.3255 4.98005 42.8764 4.98005C46.6081 4.98005 49.8174 5.59648 52.4104 6.81318C54.3391 7.71687 55.5454 8.79803 56.0195 10.0406V5.42543H67.0759V0.661817H56.0195V5.27697C55.5454 4.03442 54.3391 2.95326 52.4104 2.04959C49.814 0.832867 46.6049 0.216438 42.8764 0.216438C39.1482 0.216438 36.255 0.768321 33.7456 1.85595C33.6974 1.87531 33.6521 1.8979 33.607 1.92049V0.658591H0.105835V5.4222H33.607V6.68409Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M79.1289 5.42543H84.7376L93.865 0.661812H79.1289L67.0758 7.15852V11.9221L79.1289 5.42543Z', fill: '#FF0000' }),
        React.createElement("path", { d: 'M56.0197 23.4084C55.3842 23.9441 54.5939 24.4412 53.6457 24.8962C50.7237 26.2936 47.1468 27.0005 43.0215 27.0005C39.1447 27.0005 35.813 26.368 33.1231 25.1222C32.1814 24.6863 31.3846 24.1959 30.7363 23.6569L28.4689 23.8215L28.7078 25.1544C29.0559 27.0972 30.543 28.6916 33.1231 29.8858C35.813 31.1314 39.1447 31.7641 43.0215 31.7641C47.1468 31.7641 50.7237 31.0572 53.6457 29.6599C54.5939 29.208 55.3842 28.711 56.0197 28.1719V31.4446H67.0758V26.681H56.0197V23.4084Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M22.3571 26.6841H11.3008V31.4478H22.3571V26.6841Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M11.3008 10.4956H0.105835V15.2592H11.3008V10.4956Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M44.547 10.1019C44.0698 9.86952 43.6053 9.77592 42.9473 9.77592C42.2443 9.77592 41.7508 9.8792 41.2444 10.1277C40.7866 10.3536 40.1833 10.8377 39.9028 11.8673L39.6414 12.8322L41.6507 12.9097C43.1925 12.8968 43.9278 12.6547 44.3503 12.4708C44.7728 12.2868 45.3342 11.9608 45.3342 11.2282C45.3342 10.4956 44.744 10.1955 44.547 10.1019Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M54.5811 14.2523C54.3327 14.4492 54.0616 14.6331 53.7682 14.8139C53.8295 14.8397 53.8908 14.8655 53.9521 14.8913C54.7456 15.2367 55.4358 15.6498 56.0194 16.1242V12.4579C55.7582 13.1034 55.281 13.7037 54.5811 14.2555V14.2523Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M39.4543 19.7388C40.3412 22.2045 42.2346 22.2045 42.9473 22.2045C43.6085 22.2045 44.4988 22.1368 45.5243 21.6139C46.4244 21.1524 46.8629 20.5392 46.8629 19.7324C46.8629 18.9965 46.4854 18.4479 45.7082 18.0509C45.0211 17.7024 44.3212 17.5507 43.3667 17.5507C43.1087 17.5507 42.5023 17.5733 41.3733 17.7346L36.5645 18.4221L37.8127 13.2905L28.7141 12.4127L29.1657 11.0669C29.2335 10.87 29.3108 10.6796 29.3946 10.4892H22.3571V15.2528H28.6431L28.7078 15.6207C28.9302 16.8536 29.6076 17.9476 30.7363 18.8868L38.9383 18.293L39.4577 19.7324L39.4543 19.7388Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M68.8787 18.464L67.0758 19.4032V24.1668L68.8787 23.2276L79.5674 31.4478H93.2167L86.7147 26.6841H79.5674L68.8787 18.464Z', fill: '#0000FF' }),
        React.createElement("path", { d: 'M84.7377 5.42543H79.1289L67.0759 11.9221V5.42543H56.0195V10.0406C55.5454 8.79804 54.3391 7.71687 52.4104 6.81321C49.814 5.59649 46.6049 4.98005 42.8764 4.98005C39.1482 4.98005 36.255 5.53193 33.7456 6.61956C33.6974 6.63893 33.6521 6.66153 33.607 6.6841V5.42221H0.105835V10.4924H11.3008V26.6778H22.3572V10.4924H29.3947C29.3109 10.6796 29.2302 10.8732 29.1658 11.0701L28.7142 12.4159L37.8128 13.2938L36.5646 18.4253L41.3734 17.7379C42.5024 17.5765 43.1054 17.5539 43.3668 17.5539C44.3213 17.5539 45.0212 17.7024 45.7083 18.0542C46.4855 18.4511 46.863 18.9998 46.863 19.7356C46.863 20.5425 46.4242 21.1589 45.5244 21.6172C44.4989 22.1432 43.6086 22.2078 42.9474 22.2078C42.2347 22.2078 40.3413 22.2078 39.4544 19.7421L38.9352 18.3027L30.7332 18.8965L28.4658 19.0611L28.7045 20.394C28.9271 21.6269 29.6045 22.7209 30.7332 23.6601C31.3815 24.1991 32.1781 24.6897 33.1201 25.1253C35.81 26.3712 39.1416 27.0036 43.0184 27.0036C47.1435 27.0036 50.7203 26.297 53.6426 24.8994C54.5908 24.4444 55.3809 23.9506 56.0163 23.4116V26.6841H67.0727V19.4064L68.8723 18.4672L79.5643 26.6873H93.2137L76.5388 14.4685L93.862 5.42866H84.7343L84.7377 5.42543ZM44.3504 12.4708C43.9279 12.6548 43.1926 12.8968 41.6508 12.9097L39.6414 12.8323L39.9028 11.8673C40.1834 10.8377 40.7864 10.3536 41.2445 10.1277C41.7509 9.87598 42.2444 9.77593 42.9474 9.77593C43.6054 9.77593 44.0667 9.86953 44.5471 10.1019C44.7407 10.1955 45.3342 10.4827 45.3342 11.2283C45.3342 11.9738 44.7729 12.2868 44.3504 12.4708ZM56.0195 16.1242C55.4359 15.6498 54.7456 15.2367 53.9522 14.8913C53.8909 14.8655 53.8296 14.8397 53.7683 14.8139C54.0617 14.6364 54.3328 14.4492 54.5811 14.2523C55.281 13.7004 55.7615 13.1001 56.0195 12.4547V16.121V16.1242Z', fill: '#FFFF00' }))));

/**
 * "Powered by TONE3000", stepping down as the tab bar narrows (container
 * queries in index.css): words + wordmark → wordmark → T3K mark. All three
 * are in the DOM; CSS picks one, so the link's accessible name stays put.
 */
const PoweredBy = ({ className = '', }) => (React.createElement("a", { href: 'https://www.tone3000.com', target: '_blank', rel: 'noopener noreferrer', "aria-label": 'Powered by TONE3000', className: `t3k-powered flex flex-row gap-2 items-center flex-shrink-0 ${className}` },
    React.createElement("span", { className: 't3k-powered-text text-muted text-xs', "aria-hidden": 'true' }, "Powered by"),
    React.createElement(Logo, { height: 16, className: 't3k-powered-logo' }),
    React.createElement(LogoSm, { width: 42, height: 14, className: 't3k-powered-mark' })));

/**
 * Round profile image with the tone3000 fallback silhouette
 * (`components/ui/ProfileUser/ProfileAvatar.tsx` there).
 */
const Avatar = ({ src, name, size }) => (React.createElement("span", { className: 'relative inline-block flex-shrink-0 rounded-full overflow-hidden', style: { width: size, height: size } }, src ? (React.createElement("img", { src: src, alt: `${name}'s avatar`, width: size, height: size, loading: 'lazy', className: 'w-full h-full object-cover' })) : (React.createElement("svg", { width: size, height: size, viewBox: '0 0 224 224', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', "aria-hidden": 'true' },
    React.createElement("path", { d: 'M112 224C96.7007 224 82.2797 221.072 68.7373 215.216C55.268 209.36 43.3725 201.271 33.051 190.949C22.7294 180.628 14.6405 168.732 8.78431 155.263C2.9281 141.72 0 127.299 0 112C0 96.7008 2.9281 82.3165 8.78431 68.8472C14.6405 55.3047 22.6928 43.3727 32.9412 33.0511C43.2627 22.7295 55.1582 14.6406 68.6274 8.78442C82.1699 2.92821 96.5908 0.000106812 111.89 0.000106812C127.19 0.000106812 141.61 2.92821 155.153 8.78442C168.695 14.6406 180.627 22.7295 190.949 33.0511C201.271 43.3727 209.359 55.3047 215.216 68.8472C221.072 82.3165 224 96.7008 224 112C224 127.299 221.072 141.72 215.216 155.263C209.359 168.732 201.271 180.628 190.949 190.949C180.627 201.271 168.695 209.36 155.153 215.216C141.684 221.072 127.299 224 112 224ZM112 207.31C120.345 207.31 128.617 206.175 136.816 203.906C145.088 201.71 152.847 198.489 160.094 194.243C167.341 190.071 173.783 185.02 179.42 179.09C175.467 172.795 170.05 167.451 163.169 163.059C156.361 158.594 148.565 155.226 139.78 152.957C131.069 150.614 121.809 149.443 112 149.443C102.044 149.443 92.6745 150.614 83.8902 152.957C75.1059 155.299 67.3098 158.703 60.502 163.169C53.7673 167.561 48.4235 172.868 44.4706 179.09C50.1072 185.02 56.549 190.071 63.7961 194.243C71.1163 198.489 78.8758 201.71 87.0745 203.906C95.2732 206.175 103.582 207.31 112 207.31ZM112 130.777C119.027 130.85 125.359 129.093 130.996 125.506C136.706 121.846 141.244 116.868 144.612 110.573C147.979 104.277 149.663 97.2132 149.663 89.3805C149.663 81.987 147.979 75.2158 144.612 69.0668C141.244 62.9178 136.706 58.0132 130.996 54.353C125.286 50.6197 118.954 48.753 112 48.753C104.973 48.753 98.6039 50.6197 92.8941 54.353C87.1843 58.0132 82.6457 62.9178 79.2784 69.0668C75.9111 75.2158 74.264 81.987 74.3372 89.3805C74.3372 97.2132 75.9843 104.241 79.2784 110.463C82.6457 116.685 87.1477 121.626 92.7843 125.286C98.4941 128.873 104.899 130.703 112 130.777Z', fill: '#8D8D93' })))));

/**
 * The NAM / IR format label, as on tone3000 tone cards and tone pages
 * (`components/ui/Tones/FormatPill.tsx` there): mono caps on a muted block.
 */
const FormatPill = ({ format, }) => {
    if (!format)
        return null;
    return (React.createElement("span", { className: 'bg-muted text-canvas text-xs font-mono px-[6px] py-[1px] rounded-sm whitespace-nowrap leading-4 flex-shrink-0' }, format.toUpperCase()));
};

/**
 * The tone3000 verified check (`components/icons/Varified.tsx` there): three
 * offset strokes in the brand red / yellow / blue. Mask ids are per instance
 * so several badges can share a page.
 */
const VerifiedBadge = ({ size = 20, className = '', }) => {
    const id = useId();
    const m1 = `t3k-v1-${id}`;
    const m2 = `t3k-v2-${id}`;
    const m3 = `t3k-v3-${id}`;
    return (React.createElement("svg", { width: size, height: size, viewBox: '0 0 32 33', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', className: className, style: { shapeRendering: 'geometricPrecision', overflow: 'visible' }, "aria-hidden": 'true' },
        React.createElement("mask", { id: m1, fill: 'white' },
            React.createElement("path", { d: 'M30 9.91187L10.75 32.5001L2 21.2327' })),
        React.createElement("path", { d: 'M33.8055 13.155C35.5967 11.0533 35.3449 7.89746 33.2431 6.10633C31.1414 4.3152 27.9856 4.567 26.1945 6.66874L33.8055 13.155ZM10.75 32.5001L6.80094 35.5669C7.72366 36.755 9.13231 37.4646 10.6363 37.4988C12.1403 37.533 13.5798 36.8882 14.5555 35.7432L10.75 32.5001ZM5.94906 18.166C4.25534 15.985 1.11425 15.5899 -1.06675 17.2837C-3.24775 18.9774 -3.64278 22.1185 -1.94906 24.2995L5.94906 18.166ZM26.1945 6.66874L6.94446 29.257L14.5555 35.7432L33.8055 13.155L26.1945 6.66874ZM14.6991 29.4334L5.94906 18.166L-1.94906 24.2995L6.80094 35.5669L14.6991 29.4334Z', fill: '#0000FF', mask: `url(#${m1})` }),
        React.createElement("mask", { id: m2, fill: 'white' },
            React.createElement("path", { d: 'M30 0.500122L10.75 23.0884L2 11.821' })),
        React.createElement("path", { d: 'M33.8055 3.74325C35.5967 1.64151 35.3449 -1.51428 33.2431 -3.30541C31.1414 -5.09655 27.9856 -4.84475 26.1945 -2.74301L33.8055 3.74325ZM10.75 23.0884L6.80094 26.1551C7.72366 27.3433 9.13231 28.0529 10.6363 28.0871C12.1403 28.1213 13.5798 27.4765 14.5555 26.3315L10.75 23.0884ZM5.94906 8.75423C4.25534 6.57323 1.11425 6.17821 -1.06675 7.87193C-3.24775 9.56565 -3.64278 12.7067 -1.94906 14.8877L5.94906 8.75423ZM26.1945 -2.74301L6.94446 19.8452L14.5555 26.3315L33.8055 3.74325L26.1945 -2.74301ZM14.6991 20.0216L5.94906 8.75423L-1.94906 14.8877L6.80094 26.1551L14.6991 20.0216Z', fill: '#FF0000', mask: `url(#${m2})` }),
        React.createElement("mask", { id: m3, fill: 'white' },
            React.createElement("path", { d: 'M30 5.20599L10.75 27.7942L2 16.5269' })),
        React.createElement("path", { d: 'M33.8055 8.44912C35.5967 6.34738 35.3449 3.19159 33.2431 1.40046C31.1414 -0.390674 27.9856 -0.138876 26.1945 1.96286L33.8055 8.44912ZM10.75 27.7942L6.80094 30.861C7.72366 32.0492 9.13231 32.7587 10.6363 32.7929C12.1403 32.8272 13.5798 32.1824 14.5555 31.0374L10.75 27.7942ZM5.94906 13.4601C4.25534 11.2791 1.11425 10.8841 -1.06675 12.5778C-3.24775 14.2715 -3.64278 17.4126 -1.94906 19.5936L5.94906 13.4601ZM26.1945 1.96286L6.94446 24.5511L14.5555 31.0374L33.8055 8.44912L26.1945 1.96286ZM14.6991 24.7275L5.94906 13.4601L-1.94906 19.5936L6.80094 30.861L14.6991 24.7275Z', fill: '#FFFF00', mask: `url(#${m3})` })));
};

// Image sizes sit just under a two-line title plus the facts row (~72px /
// ~64px), so the thumbnail reads as the same block rather than an icon.
const SIZES = {
    default: { image: 68, title: 'text-base sm:text-lg', avatar: 20 },
    dense: { image: 56, title: 'text-sm sm:text-base', avatar: 18 },
};
/**
 * Image, title, then one line of facts styled like a tone3000 tone card:
 * avatar name ✓ · subtitle (gear) · format pill.
 */
const ToneHeader = ({ meta, variant = 'default', linkTarget = '_blank', }) => {
    const s = SIZES[variant];
    const rel = linkTarget === '_blank' ? 'noopener noreferrer' : undefined;
    const { author } = meta;
    const hasFacts = !!(meta.subtitle || meta.format || author);
    const image = (React.createElement("div", { className: 'rounded-t3k-sm flex-shrink-0 overflow-hidden bg-surface-2', style: { width: s.image, height: s.image } }, meta.imageUrl ? (React.createElement("img", { src: meta.imageUrl, alt: '', width: s.image, height: s.image, loading: 'lazy', className: 'w-full h-full object-cover' })) : (meta.imageFallback)));
    const title = (React.createElement("span", { className: `${s.title} font-semibold leading-tight text-fg line-clamp-2`, style: { overflowWrap: 'anywhere' } }, meta.title));
    const authorName = author && (React.createElement("span", { className: 'flex items-center gap-1.5 min-w-0' },
        React.createElement(Avatar, { src: author.avatarUrl, name: author.name, size: s.avatar }),
        React.createElement("span", { className: 'truncate text-fg' }, author.name),
        author.verified && (React.createElement(React.Fragment, null,
            React.createElement(VerifiedBadge, { size: s.avatar - 2, className: 'flex-shrink-0' }),
            React.createElement("span", { className: 'sr-only' }, "(verified)")))));
    return (React.createElement("div", { className: 'flex items-center gap-3 sm:gap-4 min-w-0 flex-1' },
        meta.href ? (React.createElement("a", { href: meta.href, target: linkTarget, rel: rel, "aria-label": meta.title, className: 'flex-shrink-0' }, image)) : (image),
        React.createElement("div", { className: 'flex flex-col min-w-0 gap-1' },
            meta.href ? (React.createElement("a", { href: meta.href, target: linkTarget, rel: rel, className: 'min-w-0 cursor-pointer' }, title)) : (title),
            hasFacts && (React.createElement("div", { className: 'flex flex-row-reverse flex-wrap justify-end items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted min-w-0' },
                (meta.subtitle || meta.format) && (React.createElement("span", { className: 'flex items-center gap-2 min-w-0 max-w-full' },
                    meta.subtitle && (React.createElement("span", { className: 'truncate' }, meta.subtitle)),
                    React.createElement(FormatPill, { format: meta.format }))),
                author &&
                    (author.href ? (React.createElement("a", { href: author.href, target: linkTarget, rel: rel, className: 'min-w-0 max-w-full cursor-pointer' }, authorName)) : (authorName)))))));
};

const SOURCE_TABS = [
    { mode: 'demo', label: 'Sample' },
    { mode: 'live', label: 'Plug in and play' },
];
const SECTION = 'px-4 sm:px-6';
/**
 * `compact` and `full` are one set of sections in two orders.
 *
 * `full` (tone page, share embed):
 *
 *   [ Sample | Plug in and play            Powered by ]   source tabs / attribution
 *   [ image  title · author · gear · pill       ‹ n/N › ]   tone header (+ pager)
 *   [ playbar                                          ]
 *   [ controls | live setup wizard | play live         ]
 *
 * `compact` (docked under a card, or a standalone bar in an embed): the
 * playbar is the whole collapsed player; the chevron opens the tabs and the
 * body beneath it.
 *
 *   [ image  title                             ‹ n/N › ]   dense header: playlists, or not docked
 *   [ playbar                                        ⌄ ]
 *   [ Sample | Plug in and play            Powered by ]   ┐ expanded
 *   [ controls | live setup wizard | play live         ]   ┘
 */
const PanelLayout = ({ controller: c, layout, live, status, disabledReason, headerSlot, attribution, linkTarget, docked, }) => {
    const isPlaylist = c.tones.length > 1;
    const isFull = layout === 'full';
    const inert = status !== 'ready';
    const isLive = live && c.sourceMode === 'live';
    const meta = c.activeTone.meta;
    // `compact` docked under a card leaves the image and name to the card; a
    // standalone compact bar (share embed) carries them in the dense header.
    const showHeader = isPlaylist || (!!meta && (isFull || !docked));
    const showTabBar = live || attribution;
    const assetError = c.activeAssets.status === 'error' ? c.activeAssets.message : null;
    const assetsPending = c.activeAssets.status === 'idle' || c.activeAssets.status === 'loading';
    const tabBar = showTabBar && (React.createElement("div", { className: `${SECTION} t3k-tabbar ${
        // The attribution's step-down thresholds depend on whether it
        // shares the row with the tabs (index.css).
        live ? 't3k-has-tabs' : 't3k-no-tabs'} flex items-center justify-between gap-4 ${
        // Only `full` rules the tabs off from the header beneath; in
        // `compact` the tabs sit directly under the bar, like the v2 accordion.
        isFull ? 'border-b border-line' : ''}` },
        live ? (React.createElement(Tabs, { tabs: SOURCE_TABS.map(t => t.label), activeTab: SOURCE_TABS.findIndex(t => t.mode === c.sourceMode), setActiveTab: i => void c.setSourceMode(SOURCE_TABS[i].mode), disabled: inert, fill: false })) : (React.createElement("span", null)),
        attribution && React.createElement(PoweredBy, { className: 'py-3' })));
    const playbar = (React.createElement(Playbar, { controller: c, disabled: inert, headerSlot: headerSlot, expandToggle: !isFull && !inert }));
    const controls = (React.createElement(React.Fragment, null,
        assetError ? (React.createElement("p", { className: 'text-sm text-danger' }, assetError)) : assetsPending ? (React.createElement(ControlsSkeleton, null)) : (React.createElement(Controls, { controller: c })),
        c.error && !assetError && (React.createElement("p", { className: 'text-sm text-danger pt-2' }, c.error))));
    // The live-only panels that take the controls' place, under the playbar:
    // the setup wizard (permission → interface), or the "Play Live" takeover
    // until an interface is connected.
    let livePanel = null;
    if (isLive && c.view === 'settings') {
        livePanel = (React.createElement(AudioSettings, { controller: c, onClose: () => c.setView('controls'), disabled: inert, href: meta?.href, linkTarget: linkTarget }));
    }
    else if (isLive && c.live.status !== 'ready') {
        livePanel = (React.createElement(LiveConnect, { controller: c, disabled: inert, href: meta?.href, linkTarget: linkTarget }));
    }
    let body;
    if (isFull) {
        body = (React.createElement("div", { className: `${SECTION} t3k-body flex flex-col gap-3 py-2 sm:py-3` },
            playbar,
            status === 'disabled' && disabledReason && (React.createElement("p", { className: 'text-sm text-muted -mt-2 pb-2' }, disabledReason)),
            !inert && React.createElement("div", { className: 'pb-3 sm:pb-4' }, livePanel ?? controls)));
    }
    else {
        body = (React.createElement(React.Fragment, null,
            React.createElement("div", { className: SECTION },
                playbar,
                status === 'disabled' && disabledReason && (React.createElement("p", { className: 'text-sm text-muted -mt-1 pb-3' }, disabledReason))),
            !inert && c.expanded && (React.createElement(React.Fragment, null,
                tabBar,
                React.createElement("div", { className: `${SECTION} t3k-body py-4 sm:py-5` }, livePanel ?? controls)))));
    }
    return (React.createElement("div", { className: `bg-surface border border-line text-fg w-full flex flex-col overflow-hidden ${docked ? 'rounded-b-t3k border-t-0' : 'rounded-t3k'} ${inert ? 'opacity-50' : ''}`, "aria-busy": status === 'loading' || undefined, "aria-disabled": status === 'disabled' || undefined },
        isFull && tabBar,
        showHeader && (React.createElement("div", { className: `${SECTION} t3k-header flex flex-wrap items-center gap-4 py-3 sm:py-4 border-b border-line` },
            meta ? (React.createElement(ToneHeader, { meta: meta, variant: isFull ? 'default' : 'dense', linkTarget: linkTarget })) : (React.createElement("span", { className: 'flex-1 text-sm text-muted' },
                "Tone ",
                c.activeIndex + 1)),
            isPlaylist && (React.createElement(Pager, { index: c.activeIndex, count: c.tones.length, onStep: c.step, disabled: inert || c.isBusy, className: 't3k-header-pager' })))),
        body));
};

/**
 * The player. One component for every surface:
 *
 * - one tone → single player; two or more → playlist
 * - `layout` picks `mini` | `compact` | `full`
 * - all state changes surface through `onEvent`
 *
 * Must be rendered inside `T3kPlayerProvider`.
 */
const T3kPlayer = props => {
    const { tones, layout = 'full', live = true, disabled = false, isLoading = false, theme = 'dark', headerSlot, attribution = true, linkTarget = '_blank', docked = false, size, onEvent, } = props;
    const isPlaylist = tones.length > 1;
    if (isPlaylist && layout === 'mini') {
        console.warn('[T3kPlayer] `mini` layout does not support playlists; rendering `compact`.');
    }
    const effectiveLayout = isPlaylist && layout === 'mini' ? 'compact' : layout;
    const controller = usePlayer({
        tones,
        id: props.id,
        defaultToneId: props.defaultToneId,
        defaultExpanded: props.defaultExpanded,
        slimSize: props.slimSize,
        onEvent,
        live,
        layout: effectiveLayout,
    });
    const rootRef = useRef(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const reportHeight = useCallback((height) => onEventRef.current?.({ type: 'resize', height }), []);
    useRootResize(rootRef, onEvent ? reportHeight : undefined);
    const status = isLoading ? 'loading' : disabled ? 'disabled' : 'ready';
    const disabledReason = typeof disabled === 'object' ? disabled.reason : undefined;
    return (React.createElement("div", { ref: rootRef, className: 'neural-amp-modeler', "data-layout": effectiveLayout, "data-theme": theme, "data-player-id": controller.playerId, style: effectiveLayout === 'mini' ? { display: 'inline-flex' } : undefined }, effectiveLayout === 'mini' ? (React.createElement(MiniLayout, { controller: controller, status: status, size: size })) : (React.createElement(PanelLayout, { controller: controller, layout: effectiveLayout, live: live, status: status, disabledReason: disabledReason, headerSlot: headerSlot, attribution: attribution, linkTarget: linkTarget, docked: docked }))));
};

/**
 * Wrap the part of your app that renders players. One provider = one audio
 * engine (created lazily on the first play) shared by every player inside.
 */
function T3kPlayerProvider({ children, engineAssets, }) {
    return (React.createElement(T3kPlayerContextProvider, { engineAssets: engineAssets }, children));
}

/** The "no model" entry, for slots that should offer a pass-through. */
const NO_MODEL = { name: 'None', url: null };
/** The "no cabinet" IR, for asset lists that should offer a dry option. */
const NO_IR = { name: 'None', url: null, mix: 0 };

/**
 * Demo fixtures: a small library of NAM A2 models, IRs and DI clips served
 * from this repo. `npm start` serves them from /public; the published package
 * points at the GitHub raw URLs so the README examples work out of the box.
 */
const inputs = [
    {
        name: 'Brit - Guitar',
        url: '/inputs/Brit - Guitar.wav',
        default: true,
    },
    {
        name: 'Celestial - Guitar',
        url: '/inputs/Celestial - Guitar.wav',
    },
    {
        name: 'Cream - Guitar',
        url: '/inputs/Cream - Guitar.wav',
    },
    {
        name: 'Decapitated - Guitar',
        url: '/inputs/Decapitated - Guitar.wav',
    },
    {
        name: 'Downtown - Bass',
        url: '/inputs/Downtown - Bass.wav',
    },
    {
        name: "Drivin' - Bass",
        url: "/inputs/Drivin' - Bass.wav",
    },
    {
        name: 'Fast Thrash - Guitar',
        url: '/inputs/Fast Thrash - Guitar.wav',
    },
    {
        name: 'Fear - Guitar',
        url: '/inputs/Fear - Guitar.wav',
    },
    {
        name: 'Frogger - Bass',
        url: '/inputs/Frogger - Bass.wav',
    },
    {
        name: 'Garden - Bass',
        url: '/inputs/Garden - Bass.wav',
    },
    {
        name: 'Groove Thrash - Guitar',
        url: '/inputs/Groove Thrash - Guitar.wav',
    },
    {
        name: 'Hammer Lead - Guitar',
        url: '/inputs/Hammer Lead - Guitar.wav',
    },
    {
        name: 'Harmonics - Guitar',
        url: '/inputs/Harmonics - Guitar.wav',
    },
    {
        name: 'Honky - Guitar',
        url: '/inputs/Honky - Guitar.wav',
    },
    {
        name: 'Hotrod - Guitar',
        url: '/inputs/Hotrod - Guitar.wav',
    },
    {
        name: 'Jazz Hop - Guitar',
        url: '/inputs/Jazz Hop - Guitar.wav',
    },
    {
        name: 'Jazz Trot - Guitar',
        url: '/inputs/Jazz Trot - Guitar.wav',
    },
    {
        name: 'John - Guitar',
        url: '/inputs/John - Guitar.wav',
    },
    {
        name: 'Lunar - Guitar', // Lunar is contributed by Aditya Mhatre
        url: '/inputs/Lunar - Guitar.wav',
    },
    {
        name: 'Mayer - Guitar',
        url: '/inputs/Mayer - Guitar.wav',
    },
    {
        name: 'Metalcore - Guitar', // Metalcore is contributed by Aditya Mhatre
        url: '/inputs/Metalcore - Guitar.wav',
    },
    {
        name: 'Pluck - Guitar',
        url: '/inputs/Pluck - Guitar.wav',
    },
    {
        name: 'Pop Punk - Guitar',
        url: '/inputs/Pop Punk - Guitar.wav',
    },
    {
        name: 'Power - Guitar',
        url: '/inputs/Power - Guitar.wav',
    },
    {
        name: 'Power Thrash - Guitar',
        url: '/inputs/Power Thrash - Guitar.wav',
    },
    {
        name: 'Progression -  Guitar',
        url: '/inputs/Progression -  Guitar.wav',
    },
    {
        name: 'Raid - Guitar',
        url: '/inputs/Raid - Guitar.wav',
    },
    {
        name: "Rollin' - Bass",
        url: "/inputs/Rollin' - Bass.wav",
    },
    {
        name: 'Rotary - Guitar',
        url: '/inputs/Rotary - Guitar.wav',
    },
    {
        name: 'Slide Lead - Guitar',
        url: '/inputs/Slide Lead - Guitar.wav',
    },
    {
        name: "Smokin' - Bass",
        url: "/inputs/Smokin' - Bass.wav",
    },
    {
        name: 'Smooth - Guitar',
        url: '/inputs/Smooth - Guitar.wav',
    },
    {
        name: 'Stroke - Guitar',
        url: '/inputs/Stroke - Guitar.wav',
    },
    {
        name: 'Tomb - Guitar',
        url: '/inputs/Tomb - Guitar.wav',
    },
];
const cabIrs = [
    NO_IR,
    {
        name: 'Mesa 412 OS',
        url: '/irs/mesa.wav',
        mix: 1,
        default: true,
    },
    {
        name: 'Celestion G12 Vintage',
        url: '/irs/celestion.wav',
        mix: 1,
    },
    {
        name: 'Eminence Governor',
        url: '/irs/eminence.wav',
        mix: 1,
    },
    {
        name: 'Ampeg 8x10',
        url: '/irs/ampeg.wav',
        mix: 1,
    },
];
const reverbIrs = [
    NO_IR,
    {
        name: 'EMT 140 Plate Reverb',
        url: '/irs/plate.wav',
        mix: 0.3,
    },
    {
        name: 'Fender Spring Reverb',
        url: '/irs/spring.wav',
        mix: 0.35,
    },
];
const irs = [...cabIrs, ...reverbIrs.slice(1)];
const models = [
    {
        name: 'Fender Deluxe Reverb',
        url: '/models/deluxe-a2.nam',
        default: true,
    },
    {
        name: 'Marshall JCM800',
        url: '/models/jcm.nam',
    },
    {
        name: 'Vox AC10',
        url: '/models/ac10.nam',
    },
    {
        name: 'Dumble Overdrive Special',
        url: '/models/dumble.nam',
    },
    {
        name: 'Ampeg V-2',
        url: '/models/ampeg.nam',
    },
    {
        name: 'Boosted EVH 5153',
        url: '/models/5153.nam',
    },
    {
        name: 'Roland JC-120',
        url: '/models/jc.nam',
    },
];
const githubBaseUrl = 'https://raw.githubusercontent.com/tone-3000/neural-amp-modeler-wasm/refs/heads/main/ui/public';
const DEFAULT_MODELS = (models.map(model => ({
        ...model,
        url: `${githubBaseUrl}${model.url}`,
    })));
const withBase = (list) => (list.map(ir => ({
        ...ir,
        url: ir.url === null ? null : `${githubBaseUrl}${ir.url}`,
    })));
/** Speaker cabinets (fully wet), "None" first. */
const DEFAULT_CAB_IRS = withBase(cabIrs);
/** Reverbs (partial mix), "None" first. */
const DEFAULT_REVERB_IRS = withBase(reverbIrs);
/** Cabs then reverbs: the whole demo IR library. */
const DEFAULT_IRS = withBase(irs);
const DEFAULT_INPUTS = (inputs.map(input => ({
        ...input,
        url: `${githubBaseUrl}${input.url}`,
    })));

export { AudioGraph, DEFAULT_CAB_IRS, DEFAULT_INPUTS, DEFAULT_IRS, DEFAULT_MODELS, DEFAULT_REVERB_IRS, NO_IR, NO_MODEL, NamEngine, T3kPlayer, T3kPlayerContextProvider, T3kPlayerProvider, irInBandGainDb, useT3kPlayerContext };
//# sourceMappingURL=index.esm.js.map
