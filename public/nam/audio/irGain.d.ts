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
export declare function irInBandGainDb(buffer: AudioBuffer): number;
