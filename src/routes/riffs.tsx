import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Flame, AlertTriangle, Upload, FileMusic, Minus, Plus, Crown, Sparkles, X, Repeat } from "lucide-react";
import { lazy, Suspense } from "react";
import { useLanguage } from "../context/LanguageContext";

const GuitarProPlayer = lazy(() => import("@/components/GuitarProPlayer"));

export const Route = createFileRoute("/riffs")({
  head: () => ({
    meta: [
      { title: "Riffs — SHRED Hard Rock Vault" },
      { name: "description", content: "Original hard rock practice riffs with scrolling tabs and audio player." },
      { property: "og:title", content: "Riffs — SHRED" },
      { property: "og:description", content: "Practice riffs inspired by classic hard rock styles. Listen and shred." },
    ],
  }),
  component: RiffsPage,
});

type Riff = {
  id: string;
  title: string;
  key: string;
  tempo: number;
  tag: string;
  src: string;
  gpFile?: string;
  fallback?: string;
  altSources?: string[];
  stems?: { id: string; name: string; url: string }[];
  tab: string[];
};

const RIFFS: Riff[] = [
  {
    id: "acdc-style-workout",
    title: "80s HARD ROCK: BENDS & CHORDS",
    key: "E minor — E5 / D5 / G5",
    tempo: 128,
    tag: "Open Chords · Bends & Pull-offs",
    gpFile: "/track/Back_in_The_Rhythm.gp",
    src: "/track/back-in-the-rhythm.wav",
    fallback: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    tab: [],
    altSources: ["/track/Back_in_The_Rhythm.wav"],
    stems: [
      { id: "guitar", name: "Guitar", url: "/track/back-in-the-rhythm-guitar.wav" },
      { id: "bass", name: "Bass", url: "/track/back-in-the-rhythm-bass.wav" },
      { id: "drums", name: "Drums", url: "/track/back-in-the-rhythm-drums.wav" },
    ],
  },
  {
    id: "metallica-downpicking",
    title: "THRASH METAL: DOWNPICKING RIFFS",
    key: "E minor — Palm Mute E5",
    tempo: 180,
    tag: "Downpicking · Fast Speed",
    gpFile: "/track/metallica-style-downpicking-workout.gp",
    src: "/track/metallica-style-downpicking-workout-guitar.wav",
    tab: [],
    stems: [
      { id: "guitar", name: "Guitar", url: "/track/metallica-style-downpicking-workout-guitar.wav" },
      { id: "bass", name: "Bass", url: "/track/metallica-style-downpicking-workout-bass.wav" },
      { id: "drums", name: "Drums", url: "/track/metallica-style-downpicking-workout-drums.wav" },
    ],
  },
  {
    id: "guns-n-roses-alternate-picking-string-skipping",
    title: "80s ROCK & BLUES: ALTERNATE & SKIPPING",
    key: "G minor — Alternate Picking G3",
    tempo: 120,
    tag: "Alternate Picking · String Skipping",
    gpFile: "/track/guns-n-roses-alternate-picking-and-string-skipping-workout.gp",
    src: "/track/guns-n-roses-alternate-picking-and-string-skipping-guitar.wav",
    tab: [],
    stems: [
      { id: "guitar", name: "Guitar", url: "/track/guns-n-roses-alternate-picking-and-string-skipping-guitar.wav" },
      { id: "bass", name: "Bass", url: "/track/guns-n-roses-alternate-picking-and-string-skipping-bass.wav" },
      { id: "drums", name: "Drums", url: "/track/guns-n-roses-alternate-picking-and-string-skipping-drums.wav" },
    ],
  },
];

const translations = {
  en: {
    badge: "/ SHRED ACADEMY",
    titleMain: "Riff",
    titleHighlight: "ACADEMY",
    subtitle: "Master iconic guitar styles. Plug in, crank the gain, shred.",
    live: "Live — feel the gain",
    audioError: "Audio not found — check the MP3 file",
    uploadTitle: "Personal Practice / Custom Tab",
    uploadDesc: "Personal practice custom tab, support for Guitar Pro files (.gp, .gp5, .gpx) and real-time audio playback.",
    uploadBtn: "Open guitar tab player",
    speed: "Speed",
    stems: {
      guitar: "Guitar",
      bass: "Bass",
      drums: "Drums",
    },
    proBanner: {
      badge: "PRO / EARLY ACCESS",
      title: "Unlock SHRED Studio Pro",
      desc: "Get unlimited riff access, custom GP upload, and HD audio stem exports.",
      btn: "Get Pro Access",
    },
    proModal: {
      badge: "PRO",
      title: "Get 50% Off Studio Pro",
      desc: "We are currently building the Pro version! Enter your email to get priority access and a 50% launch discount.",
      submitBtn: "Get 50% Discount",
      placeholder: "Enter your email...",
      closeBtn: "Close",
    },
  },
  it: {
    badge: "/ SHRED ACADEMY",
    titleMain: "Riff",
    titleHighlight: "ACADEMY",
    subtitle: "Padroneggia gli stili iconici del rock. Collega la chitarra, alza il gain e suona.",
    live: "Live — senti il gain",
    audioError: "Audio non trovato — controlla il file MP3",
    uploadTitle: "Studio Personale / Tab Personalizzata",
    uploadDesc: "Tab personalizzata per pratica personale, caricamento file Guitar Pro (.gp, .gp5, .gpx) e riproduzione audio in tempo reale.",
    uploadBtn: "Apri player tab per chitarra",
    speed: "Velocità",
    stems: {
      guitar: "Chitarra",
      bass: "Basso",
      drums: "Batteria",
    },
    proBanner: {
      badge: "PRO / ANTEPRIMA",
      title: "Sblocca SHRED Studio Pro",
      desc: "Accedi all'archivio illimitato di riff, importa i tuoi file GP ed esporta gli stem audio HD.",
      btn: "Prova la versione Pro",
    },
    proModal: {
      badge: "PRO",
      title: "Ottieni il 50% di Sconto su Studio Pro",
      desc: "Stiamo completando la versione Pro! Lascia la tua email per ricevere l'accesso prioritario e uno sconto speciale del 50% al lancio.",
      submitBtn: "Voglio lo Sconto 50%",
      placeholder: "Inserisci la tua email...",
      closeBtn: "Chiudi",
    },
  },
  es: {
    badge: "/ SHRED ACADEMY",
    titleMain: "Riff",
    titleHighlight: "ACADEMY",
    subtitle: "Domina estilos icónicos del rock. Conecta la guitarra, sube el gain y toca.",
    live: "En vivo — siente el gain",
    audioError: "Audio no encontrado — comprueba el archivo MP3",
    uploadTitle: "Estudio Personal / Tab Personalizada",
    uploadDesc: "Tab personalizada para práctica personal, carga de archivos Guitar Pro (.gp, .gp5, .gpx) y reproducción de audio en tiempo real.",
    uploadBtn: "Abrir reproductor de tablatura",
    speed: "Velocidad",
    stems: {
      guitar: "Guitarra",
      bass: "Bajo",
      drums: "Batería",
    },
    proBanner: {
      badge: "PRO / ACCESO ANTICIPADO",
      title: "Desbloquea SHRED Studio Pro",
      desc: "Accede al archivo ilimitado de riffs, importa archivos GP y exporta stems de audio HD.",
      btn: "Obtener Versión Pro",
    },
    proModal: {
      badge: "PRO",
      title: "Consigue un 50% de Descuento en Studio Pro",
      desc: "¡Estamos preparando la versión Pro! Deja tu correo para acceso prioritario y un 50% de descuento en el lanzamiento.",
      submitBtn: "Obtener Descuento",
      placeholder: "Introduce tu correo...",
      closeBtn: "Cerrar",
    },
  },
};

function useMp3Player() {
  const stemAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const singleAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [speed, setSpeedState] = useState<number>(1);
  const speedRef = useRef<number>(1);
  const playbackGenerationRef = useRef(0);

  // Mixer separati per singolo riffId
  const stemMixesRef = useRef<Record<string, {
    vol: Record<string, number>;
    mute: Record<string, boolean>;
    solo: Record<string, boolean>;
  }>>({});

  function configureAudioPitch(a: HTMLAudioElement, rate: number) {
    a.playbackRate = rate;
    a.preservesPitch = true;
    if ("webkitPreservesPitch" in a) (a as any).webkitPreservesPitch = true;
    if ("mozPreservesPitch" in a) (a as any).mozPreservesPitch = true;
  }

  function applyStemMix(riffId: string) {
    const mix = stemMixesRef.current[riffId] || { vol: { guitar: 1, bass: 1, drums: 1 }, mute: {}, solo: {} };
    const { vol, mute, solo } = mix;
    const anySolo = Object.values(solo).some(Boolean);

    stemAudiosRef.current.forEach((audioEl, id) => {
      const isMuted = !!mute[id];
      const isSoloed = !!solo[id];
      const audible = !isMuted && (!anySolo || isSoloed);
      const targetVol = audible ? (vol[id] ?? 1) : 0;
      audioEl.volume = targetVol;
    });
  }

  function setStemMix(
    riffId: string,
    vol: Record<string, number>,
    mute: Record<string, boolean>,
    solo: Record<string, boolean>
  ) {
    stemMixesRef.current[riffId] = { vol, mute, solo };
    applyStemMix(riffId);
  }

  function changeSpeed(newSpeed: number) {
    const clamped = Math.max(0.5, Math.min(1.5, newSpeed));
    speedRef.current = clamped;
    setSpeedState(clamped);

    if (singleAudioRef.current) {
      configureAudioPitch(singleAudioRef.current, clamped);
    }
    stemAudiosRef.current.forEach((a) => {
      configureAudioPitch(a, clamped);
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("shred:speed-change", { detail: { speed: clamped } })
      );
    }
  }

  function stop() {
    playbackGenerationRef.current += 1;
    if (singleAudioRef.current) {
      singleAudioRef.current.pause();
      singleAudioRef.current.currentTime = 0;
      singleAudioRef.current = null;
    }
    stemAudiosRef.current.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    stemAudiosRef.current.clear();
    setPlayingId(null);
  }

  function preloadRiffs(riffs: Riff[]) {
    if (typeof window === "undefined") return;
    riffs.forEach((riff) => {
      if (riff.stems && riff.stems.length > 0) {
        riff.stems.forEach((s) => {
          if (!preloadedAudiosRef.current.has(s.url)) {
            const a = new Audio(s.url);
            a.preload = "auto";
            if (s.url.startsWith("http")) a.crossOrigin = "anonymous";
            a.load();
            preloadedAudiosRef.current.set(s.url, a);
          }
        });
      } else {
        const sources = [riff.src, ...(riff.altSources ?? []), riff.fallback].filter(Boolean) as string[];
        if (sources.length > 0 && !preloadedAudiosRef.current.has(sources[0])) {
          const a = new Audio(sources[0]);
          a.preload = "auto";
          if (sources[0].startsWith("http")) a.crossOrigin = "anonymous";
          a.load();
          preloadedAudiosRef.current.set(sources[0], a);
        }
      }
    });
  }

  async function playStems(riff: Riff, syncScore?: () => Promise<void>, onEnd?: () => void): Promise<boolean> {
    if (!riff.stems || riff.stems.length === 0) return false;
    stop();
    setErrorId(null);
    const generation = playbackGenerationRef.current;

    try {
      if (typeof window === "undefined") return false;

      const elements: HTMLAudioElement[] = [];
      let leaderAudio: HTMLAudioElement | null = null;

      const loadPromises = riff.stems.map((s) => {
        return new Promise<HTMLAudioElement>((resolve, reject) => {
          const a = new Audio(s.url);
          a.preload = "auto";
          a.loop = false;
          if (s.url.startsWith("http")) a.crossOrigin = "anonymous";

          const onCanPlay = () => {
            cleanup();
            resolve(a);
          };
          const onError = () => {
            cleanup();
            reject(new Error(`Unable to load stem ${s.url}`));
          };
          const cleanup = () => {
            a.removeEventListener("canplaythrough", onCanPlay);
            a.removeEventListener("canplay", onCanPlay);
            a.removeEventListener("error", onError);
          };

          a.addEventListener("canplaythrough", onCanPlay, { once: true });
          a.addEventListener("canplay", onCanPlay, { once: true });
          a.addEventListener("error", onError, { once: true });
          a.load();
        });
      });

      const loadedElements = await Promise.all(loadPromises);
      if (generation !== playbackGenerationRef.current) return false;

      loadedElements.forEach((a, idx) => {
        const s = riff.stems![idx];
        stemAudiosRef.current.set(s.id, a);
        elements.push(a);
        if (!leaderAudio) leaderAudio = a;
      });

      if (leaderAudio) {
        (leaderAudio as HTMLAudioElement).onended = () => {
          if (generation === playbackGenerationRef.current) {
            stop();
            onEnd?.();
          }
        };
      }

      applyStemMix(riff.id);

      if (generation !== playbackGenerationRef.current) return false;

      void syncScore?.();
      await Promise.all(elements.map((a) => a.play()));

      elements.forEach((a) => configureAudioPitch(a, speedRef.current));

      setPlayingId(riff.id);
      return true;
    } catch (e) {
      console.warn("Stems loading failed, falling back to standard audio.", e);
      return false;
    }
  }

  async function play(riff: Riff, syncScore?: () => Promise<void>, onEnd?: () => void) {
    if (riff.stems && riff.stems.length > 0) {
      const ok = await playStems(riff, syncScore, onEnd);
      if (ok) return;
    }

    stop();
    setErrorId(null);
    const generation = playbackGenerationRef.current;

    const sources = [riff.src, ...(riff.altSources ?? []), riff.fallback].filter(Boolean) as string[];
    let started = false;

    for (const url of sources) {
      try {
        const a = new Audio();
        a.preload = "auto";
        a.loop = false;
        if (url.startsWith("http")) a.crossOrigin = "anonymous";
        a.src = url;

        singleAudioRef.current = a;

        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error(`Unable to load ${url}`));
          };
          const cleanup = () => {
            a.removeEventListener("canplaythrough", onCanPlay);
            a.removeEventListener("canplay", onCanPlay);
            a.removeEventListener("error", onError);
          };

          a.addEventListener("canplaythrough", onCanPlay, { once: true });
          a.addEventListener("canplay", onCanPlay, { once: true });
          a.addEventListener("error", onError, { once: true });
          a.load();
        });

        if (generation !== playbackGenerationRef.current) return;

        a.onended = () => {
          if (generation === playbackGenerationRef.current) {
            stop();
            onEnd?.();
          }
        };

        void syncScore?.();
        await a.play();

        configureAudioPitch(a, speedRef.current);

        started = true;
        break;
      } catch {
        if (singleAudioRef.current) {
          singleAudioRef.current.pause();
          singleAudioRef.current.removeAttribute("src");
        }
      }
    }

    if (!started) {
      setErrorId(riff.id);
      setPlayingId(null);
      return;
    }

    setPlayingId(riff.id);
  }

  useEffect(() => () => stop(), []);

  return { play, stop, playingId, errorId, setStemMix, speed, changeSpeed, preloadRiffs };
}

function RiffsPage() {
  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();
  const currentLang = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";

  const t = translations[currentLang as keyof typeof translations] || translations.en;

  const { play, stop, playingId, errorId, setStemMix, speed, changeSpeed, preloadRiffs } = useMp3Player();
  const [showStems, setShowStems] = useState<Record<string, boolean>>({});
  const [repeatState, setRepeatState] = useState<Record<string, boolean>>({});
  const repeatStateRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    repeatStateRef.current = repeatState;
  }, [repeatState]);

  useEffect(() => {
    preloadRiffs(RIFFS);
  }, []);

  const toggleRepeatForRiff = (riffId: string) => {
    setRepeatState((prev) => ({
      ...prev,
      [riffId]: !prev[riffId],
    }));
  };

  // STATI DEL MIXER INDICIZZATI PER Riff ID
  const [riffStemVols, setRiffStemVols] = useState<Record<string, Record<string, number>>>({});
  const [riffStemMutes, setRiffStemMutes] = useState<Record<string, Record<string, boolean>>>({});
  const [riffStemSolos, setRiffStemSolos] = useState<Record<string, Record<string, boolean>>>({});

  const toggleStemsForRiff = (riffId: string) => {
    setShowStems((prev) => ({ ...prev, [riffId]: !prev[riffId] }));
  };

  const updateStemMixForRiff = (
    riffId: string,
    vol: Record<string, number>,
    mute: Record<string, boolean>,
    solo: Record<string, boolean>
  ) => {
    setRiffStemVols((prev) => ({ ...prev, [riffId]: vol }));
    setRiffStemMutes((prev) => ({ ...prev, [riffId]: mute }));
    setRiffStemSolos((prev) => ({ ...prev, [riffId]: solo }));
    setStemMix(riffId, vol, mute, solo);
  };

  const guitarProRefs = useRef<Record<string, any>>({});

  const [countIn, setCountIn] = useState<{ id: string; beat: number } | null>(null);
  const countInCtxRef = useRef<AudioContext | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  const countInGenRef = useRef(0);

  const cancelCountIn = () => {
    countInGenRef.current += 1;
    if (typeof window !== "undefined") {
      countInTimersRef.current.forEach((t) => window.clearTimeout(t));
    }
    countInTimersRef.current = [];
    if (countInCtxRef.current) {
      try { countInCtxRef.current.close(); } catch { /* noop */ }
      countInCtxRef.current = null;
    }
    setCountIn(null);
  };

  const startWithCountIn = async (riff: Riff, syncScore?: () => Promise<void>, onEnd?: () => void) => {
    stop();
    cancelCountIn();
    if (typeof window === "undefined") return;
    const gen = countInGenRef.current;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    countInCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const beat = (60 / riff.tempo) / speed;
    const noteLen = 0.05;
    const t0 = ctx.currentTime + 0.08;

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = i === 0 ? 1500 : 900;
      const t = t0 + i * beat;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i === 0 ? 0.5 : 0.3, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteLen + 0.01);
      countInTimersRef.current.push(
        window.setTimeout(() => {
          if (gen === countInGenRef.current) setCountIn({ id: riff.id, beat: i + 1 });
        }, Math.max(0, (t - ctx.currentTime) * 1000))
      );
    }

    countInTimersRef.current.push(
      window.setTimeout(() => {
        if (gen !== countInGenRef.current) return;
        cancelCountIn();
        void play(riff, syncScore, onEnd);
      }, 4 * beat * 1000 + 80)
    );
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("shred:playback-change", { detail: { playing: playingId !== null } })
      );
    }
    return () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("shred:playback-change", { detail: { playing: false } })
        );
      }
    };
  }, [playingId]);

  useEffect(() => () => cancelCountIn(), []);

  const toggleRiff = (riff: Riff, active: boolean) => {
    if (active) {
      stop();
      guitarProRefs.current[riff.id]?.stop();
      return;
    }
    if (countIn?.id === riff.id) {
      cancelCountIn();
      return;
    }

    const syncScore = async () => {
      try {
        const player = guitarProRefs.current[riff.id];
        if (player) {
          await player.restart();
        }
      } catch (err) {
        console.warn("AlphaTab sync error:", err);
      }
    };

    const onEnd = () => {
      try {
        guitarProRefs.current[riff.id]?.stop();
      } catch {
        /* noop */
      }
      if (repeatStateRef.current[riff.id]) {
        setTimeout(() => {
          void startWithCountIn(riff, syncScore, onEnd);
        }, 150);
      }
    };

    void startWithCountIn(riff, syncScore, onEnd);
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-8 pb-12 max-w-4xl mx-auto">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{t.badge}</p>
        <h1 className="mt-1 text-4xl font-black">{t.titleMain} <span className="text-neon">{t.titleHighlight}</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      {/* SEZIONE LINK AL CUSTOM TAB */}
      <section className="rounded-3xl border border-primary/40 bg-card/80 p-5 shadow-neon">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-fire text-primary-foreground shadow-neon">
              <FileMusic className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl">{t.uploadTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.uploadDesc}</p>
            </div>
          </div>

          <div>
            <Link
              to="/custom-tab"
              className="flex items-center gap-2 rounded-2xl bg-fire px-4 py-2.5 font-display text-sm uppercase text-primary-foreground shadow-neon active:scale-95 transition-all cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>{t.uploadBtn}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* LISTA RIFF UFFICIALI */}
      <div className="flex flex-col gap-4">
        {RIFFS.map((riff) => {
          const active = playingId === riff.id;
          const counting = countIn?.id === riff.id;
          const isStemsOpen = !!showStems[riff.id];

          return (
            <div key={riff.id} className="flex flex-col gap-4">
              <article className={`overflow-hidden rounded-3xl border bg-card transition-shadow ${active ? "border-primary shadow-neon" : "border-border"}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3">
                 <div className="min-w-0">
                  <h2 className="font-display text-lg sm:text-xl font-bold leading-tight text-foreground whitespace-pre-line">
                    {riff.title}
                   </h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    
                   {/* TASTO RIPETIZIONE INDIPENDENTE */}
                    {(() => {
                      const isRiffRepeatActive = !!repeatState[riff.id];
                      return (
                        <button
                          onClick={() => toggleRepeatForRiff(riff.id)}
                          aria-label={isRiffRepeatActive ? "Disattiva ripetizione" : "Attiva ripetizione"}
                          title={isRiffRepeatActive ? "Ripetizione attiva" : "Attiva ripetizione"}
                          className={`grid h-12 w-12 place-items-center rounded-full bg-fire text-primary-foreground shadow-neon transition-all active:scale-95 ${
                            isRiffRepeatActive ? "ring-2 ring-primary-foreground/90 scale-105" : "opacity-75 hover:opacity-100"
                          }`}
                        >
                          <Repeat className="h-5 w-5" />
                        </button>
                      );
                    })()}

                    {/* TASTO STEMS */}
                    {riff.stems && (
                      <button
                        onClick={() => toggleStemsForRiff(riff.id)}
                        aria-label="Stems mixer"
                        className={`grid h-12 w-12 place-items-center rounded-full bg-fire text-primary-foreground shadow-neon transition-transform active:scale-95 ${isStemsOpen ? "ring-2 ring-primary-foreground/70" : ""}`}
                      >
                        <span className="font-display text-lg font-bold">S</span>
                      </button>
                    )}

                    {/* TASTO PLAY / PAUSE */}
                    <button
                      onClick={() => toggleRiff(riff, active)}
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fire text-primary-foreground shadow-neon transition-transform active:scale-95"
                      aria-label={active ? "Pause" : counting ? "Cancel count-in" : "Play"}
                    >
                      {active ? (
                        <Pause className="h-5 w-5" />
                      ) : counting ? (
                        <span className="font-display text-xl tabular-nums">{countIn?.beat ?? 1}</span>
                      ) : (
                        <Play className="h-5 w-5 translate-x-0.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* MIXER DEGLI STEM & SELETTORE VELOCITÀ PER QUESTO RIFF */}
                {riff.stems && isStemsOpen && (
                  <div className="flex flex-col gap-3 border-t border-border px-5 py-4">

                    {/* CONTROLLO VELOCITÀ */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t.speed}:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeSpeed(Math.max(0.5, Math.round((speed - 0.05) * 100) / 100))}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-background hover:bg-secondary text-xs font-bold transition-colors cursor-pointer"
                          title="-5%"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>

                        <input
                          type="range"
                          min={0.5}
                          max={1.5}
                          step={0.01}
                          value={speed}
                          onChange={(e) => changeSpeed(Number(e.target.value))}
                          className="h-1.5 w-24 sm:w-32 accent-blue-500 cursor-pointer"
                        />

                        <button
                          onClick={() => changeSpeed(Math.min(1.5, Math.round((speed + 0.05) * 100) / 100))}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-background hover:bg-secondary text-xs font-bold transition-colors cursor-pointer"
                          title="+5%"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex items-center rounded-lg border border-border bg-background px-2.5 py-1 select-none">
                          <span className="text-xs font-bold text-primary tabular-nums">
                            {Math.round(speed * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* LISTA STEM TRADOTTI INDIPENDENTI */}
                    {riff.stems.map((stem) => {
                      const currentVolMap = riffStemVols[riff.id] || { guitar: 1, bass: 1, drums: 1 };
                      const currentMuteMap = riffStemMutes[riff.id] || {};
                      const currentSoloMap = riffStemSolos[riff.id] || {};

                      const muted = !!currentMuteMap[stem.id];
                      const soloed = !!currentSoloMap[stem.id];
                      const vol = currentVolMap[stem.id] ?? 1;
                      const translatedName = t.stems[stem.id as keyof typeof t.stems] || stem.name;

                      return (
                        <div key={stem.id} className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              updateStemMixForRiff(
                                riff.id,
                                currentVolMap,
                                { ...currentMuteMap, [stem.id]: !muted },
                                currentSoloMap
                              )
                            }
                            aria-label={`Mute ${translatedName}`}
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] font-bold transition-colors cursor-pointer ${
                              muted
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            M
                          </button>
                          <button
                            onClick={() =>
                              updateStemMixForRiff(
                                riff.id,
                                currentVolMap,
                                currentMuteMap,
                                { ...currentSoloMap, [stem.id]: !soloed }
                              )
                            }
                            aria-label={`Solo ${translatedName}`}
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                              soloed
                                ? "bg-fire text-primary-foreground shadow-neon"
                                : "border border-border bg-background text-muted-foreground"
                            }`}
                          >
                            S
                          </button>
                          <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                            {translatedName}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={vol}
                            onChange={(e) =>
                              updateStemMixForRiff(
                                riff.id,
                                { ...currentVolMap, [stem.id]: Number(e.target.value) },
                                currentMuteMap,
                                currentSoloMap
                              )
                            }
                            className="h-1 flex-1 accent-primary cursor-pointer"
                            aria-label={`${translatedName} volume`}
                          />
                          <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-primary">
                            {Math.round(vol * 100)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* SPARTITO GUITAR TAB CLIENT-ONLY */}
                <ClientOnly fallback={<div className="h-[520px] border-t border-border bg-background/70" />}>
                  <Suspense fallback={<div className="h-[520px] border-t border-border bg-background/70" />}>
                    <GuitarProPlayer 
                      key={riff.id}
                      ref={(el) => {
                        if (el) guitarProRefs.current[riff.id] = el;
                      }}
                      file={riff.gpFile || ""}
                    />
                  </Suspense>
                </ClientOnly>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}