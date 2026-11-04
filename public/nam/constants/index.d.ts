import { Input, IR, Model, NonEmptyArray } from '../types';
export declare const DEFAULT_MODELS: NonEmptyArray<Model>;
/** Speaker cabinets (fully wet), "None" first. */
export declare const DEFAULT_CAB_IRS: NonEmptyArray<IR>;
/** Reverbs (partial mix), "None" first. */
export declare const DEFAULT_REVERB_IRS: NonEmptyArray<IR>;
/** Cabs then reverbs: the whole demo IR library. */
export declare const DEFAULT_IRS: NonEmptyArray<IR>;
export declare const DEFAULT_INPUTS: NonEmptyArray<Input>;
