import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

declare global {
  interface Window {
    alphaTab?: any;
  }
}

function loadAlphaTab(): Promise<any> {
  if (window.alphaTab) return Promise.resolve(window.alphaTab);
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("alphaTab failed to load"));
    const onDone = () => (window.alphaTab ? resolve(window.alphaTab) : fail());
    const existing = document.querySelector<HTMLScriptElement>("script[data-alphatab]");
    if (existing) {
      existing.addEventListener("load", onDone, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "/alphatab/alphaTab.min.js";
    s.dataset.alphatab = "true";
    s.addEventListener("load", onDone, { once: true });
    s.addEventListener("error", fail, { once: true });
    document.head.appendChild(s);
  });
}

export type GuitarProPlayerHandle = {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  restart: () => Promise<void>;
  setSpeed?: (speed: number) => void;
};

type Props = {
  file: string;
  title?: string;
  embedded?: boolean;
  speed?: number;
  onReadyChange?: (ready: boolean) => void;
  onFinished?: () => void;
};

const GuitarProPlayer = forwardRef<GuitarProPlayerHandle, Props>(function GuitarProPlayer(
  { file, title, embedded = false, speed: propSpeed = 1, onReadyChange, onFinished },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);
  const currentStepRef = useRef<number>(-1);

  // Ref per tracciare la velocità corrente in tempo reale
  const speedRef = useRef<number>(propSpeed);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeSpeed = (v: number) => {
    speedRef.current = v;
    if (apiRef.current) {
      apiRef.current.playbackSpeed = v;
    }
  };

  useEffect(() => {
    if (propSpeed !== undefined) {
      changeSpeed(propSpeed);
    }
  }, [propSpeed]);

  useEffect(() => {
    const handleSpeedEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ speed: number }>;
      if (customEvent.detail?.speed !== undefined) {
        changeSpeed(customEvent.detail.speed);
      }
    };
    window.addEventListener("shred:speed-change", handleSpeedEvent);
    return () => window.removeEventListener("shred:speed-change", handleSpeedEvent);
  }, []);

  const stopAll = () => {
    if (apiRef.current) {
      try {
        apiRef.current.pause();
        apiRef.current.timePosition = 0;
      } catch {
        /* noop */
      }
    }
    currentStepRef.current = -1;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  useImperativeHandle(ref, () => ({
    play: async () => {
      if (!apiRef.current) return;

      // Risveglio immediato dell'AudioContext se in sospensione
      if (apiRef.current.player?.audioContext?.state === "suspended") {
        try {
          await apiRef.current.player.audioContext.resume();
        } catch {
          /* noop */
        }
      }

      try {
        apiRef.current.play();
      } catch {
        /* noop */
      }
    },
    pause: () => {
      if (apiRef.current) {
        try {
          apiRef.current.pause();
        } catch {
          /* noop */
        }
      }
    },
    stop: () => stopAll(),
    restart: async () => {
      stopAll();
      if (apiRef.current) {
        try {
          apiRef.current.timePosition = 0;
          apiRef.current.play();
        } catch {
          /* noop */
        }
      }
    },
    setSpeed: (v: number) => changeSpeed(v),
  }));

  useEffect(() => {
    let disposed = false;
    let api: any;

    setReady(false);
    onReadyChange?.(false);

    loadAlphaTab()
      .then((alphaTab) => {
        if (disposed || !hostRef.current || !scrollRef.current) return;

        api = new alphaTab.AlphaTabApi(hostRef.current, {
          core: {
            file,
            fontDirectory: "/alphatab/font/",
          },
          display: { scale: 0.72, layoutMode: alphaTab.LayoutMode.Page },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableAnimatedBeatCursor: true,
            enableElementHighlighting: true,
            enableUserInteraction: true,
            scrollElement: scrollRef.current,
            scrollMode: alphaTab.ScrollMode.Off,
            nativeBrowserSmoothScroll: true,
            scrollOffsetY: -10,
            soundFont: null,
          },
        });
        apiRef.current = api;
        api.playbackSpeed = speedRef.current;

        // Disattiva il sintetizzatore MIDI interno
        api.masterVolume = 0;
        api.isMute = true;

        let scoreIsReady = false;
        let renderIsReady = false;

        const checkFullyReady = () => {
          if (scoreIsReady && renderIsReady && !disposed) {
            setReady(true);
            onReadyChange?.(true);
          }
        };

        api.scoreLoaded.on((score: any) => {
          if (apiRef.current) {
            apiRef.current.masterVolume = 0;
            apiRef.current.isMute = true;
          }
          if (score && score.tracks) {
            score.tracks.forEach((track: any) => {
              track.playbackInfo.volume = 0;
              track.playbackInfo.isMute = true;
            });
          }
          scoreIsReady = true;
          checkFullyReady();
        });

        api.renderFinished.on(() => {
          renderIsReady = true;
          checkFullyReady();
        });

        if (api.playerReady) {
          api.playerReady.on(() => {
            checkFullyReady();
          });
        }

        // STOP PULITO A FINE BRANO (Niente Replay Automatico)
        api.playerFinished.on(() => {
          stopAll();
          onFinished?.();
        });

        // PARAMETRI SCORRIMENTO AUTOMATICO OGNI 3 RIGHI
        const BASE_BPM = 94;
        const BASE_SECONDS = 5;
        const THREE_STAFFS_HEIGHT_PX = 520;

        api.playerStateChanged.on((e: any) => {
          if (e.state === 0 && api.timePosition === 0) {
            currentStepRef.current = -1;
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
          }
        });

        api.playerPositionChanged.on((e: any) => {
          const realTimeSec = e.currentTime / 1000;
          if (realTimeSec <= 0) return;

          const currentSpeed = speedRef.current > 0 ? speedRef.current : 1;
          const songTimeSec = realTimeSec * currentSpeed;

          const currentBpm = api.score?.tempo ?? BASE_BPM;
          const dynamicInterval = BASE_SECONDS * (BASE_BPM / currentBpm);
          const step = Math.floor(songTimeSec / dynamicInterval);

          if (step !== currentStepRef.current) {
            currentStepRef.current = step;
            const container = scrollRef.current;
            if (container) {
              const targetY = step * THREE_STAFFS_HEIGHT_PX;
              container.scrollTo({ top: targetY, behavior: "smooth" });
            }
          }
        });

        api.error.on(() => setError("Unable to load the tab"));
      })
      .catch(() => setError("Unable to load the Guitar Pro player"));

    return () => {
      disposed = true;
      try {
        api?.destroy();
      } catch {
        /* noop */
      }
      apiRef.current = null;
    };
  }, [file]);

  return (
    <div className="border-t border-border">
      {error ? (
        <p className="px-5 py-6 text-xs font-semibold uppercase tracking-widest text-destructive">{error}</p>
      ) : (
        <div ref={scrollRef} className="h-[520px] overflow-y-auto overflow-x-hidden bg-white relative">
          {!ready && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Preparing Tab & Audio...</span>
              </div>
            </div>
          )}
          <div ref={hostRef} />
        </div>
      )}
    </div>
  );
});

export default GuitarProPlayer;