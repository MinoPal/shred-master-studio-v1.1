export declare const setupVisualizer: (canvas: HTMLCanvasElement, audioCtx: AudioContext, useGradient?: boolean) => {
    analyser: AnalyserNode;
    stop: () => void;
};
export declare const initVisualizer: ({ canvas, useGradient, }: {
    canvas: HTMLCanvasElement | null;
    useGradient?: boolean;
}) => void;
