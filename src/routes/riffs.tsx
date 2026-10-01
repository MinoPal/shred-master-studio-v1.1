import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Flame, AlertTriangle, Upload, FileMusic, Minus, Plus, Crown, Sparkles, X, CheckCircle2 } from "lucide-react";
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
  fallback?: string;
  altSources?: string[];
  stems?: { id: string; name: string; url: string }[];
  tab: string[];
};

const RIFFS: Riff[] = [
  {
    id: "backintherhythm",
    title: "Back in The Rhythm",
    key: "E minor — E5 power chord",
    tempo: 128,
    tag: "Palm mute · Gain 8",
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
];

const translations = {
  en: {
    badge: "/ PRACTICE VAULT",
    titleMain: "Riffs",
    titleHighlight: "TO LEARN",
    subtitle: "Style-based practice riffs. Plug in, crank the gain, shred.",
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
    badge: "/ ARCHIVIO RIFF",
    titleMain: "Riff",
    titleHighlight: "DA IMPARARE",
    subtitle: "Riff di allenamento in stile. Collega il jack, alza il gain e suona.",
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
    badge: "/ ARCHIVO DE RIFFS",
    titleMain: "Riffs",
    titleHighlight: "PARA APRENDER",
    subtitle: "Riffs de práctica por estilo. Conecta la guitarra, sube el gain y toca.",
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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [speed, setSpeedState] = useState<number>(1);
  const playbackGenerationRef = useRef(0);

  const stemMixRef = useRef<{
    vol: Record<string, number>;
    mute: Record<string, boolean>;
    solo: Record<string, boolean>;
  }>({ vol: { guitar: 1, bass: 1, drums: 1 }, mute: {}, solo: {} });

  function configureAudioPitch(a: HTMLAudioElement, rate: number) {
    a.playbackRate = rate;
    a.preservesPitch = true;
    if ("webkitPreservesPitch" in a) (a as any).webkitPreservesPitch = true;
    if ("mozPreservesPitch" in a) (a as any).mozPreservesPitch = true;
  }

  function applyStemMix() {
    const { vol, mute, solo } = stemMixRef.current;
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
    vol: Record<string, number>,
    mute: Record<string, boolean>,
    solo: Record<string, boolean>
  ) {
    stemMixRef.current = { vol, mute, solo };
    applyStemMix();
  }

  function changeSpeed(newSpeed: number) {
    const clamped = Math.max(0.5, Math.min(1.5, newSpeed));
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

  async function playStems(riff: Riff, syncScore?: () => Promise<void>): Promise<boolean> {
    if (!riff.stems || riff.stems.length === 0) return false;
    stop();
    setErrorId(null);
    const generation = playbackGenerationRef.current;

    try {
      if (typeof window === "undefined") return false;

      const elements: HTMLAudioElement[] = [];
      let leaderAudio: HTMLAudioElement | null = null;

      riff.stems.forEach((s) => {
        const a = new Audio(s.url);
        a.preload = "auto";
        a.loop = false;
        if (s.url.startsWith("http")) a.crossOrigin = "anonymous";
        configureAudioPitch(a, speed);

        if (!leaderAudio) leaderAudio = a;

        stemAudiosRef.current.set(s.id, a);
        elements.push(a);
      });

      if (leaderAudio) {
        (leaderAudio as HTMLAudioElement).onended = () => {
          if (generation === playbackGenerationRef.current) {
            elements.forEach((el) => {
              el.currentTime = 0;
              el.play().catch(() => {});
            });
            void syncScore?.();
          }
        };
      }

      applyStemMix();

      if (generation !== playbackGenerationRef.current) return false;

      await Promise.all(elements.map((a) => a.play()));
      void syncScore?.();

      setPlayingId(riff.id);
      return true;
    } catch (e) {
      console.warn("Stems loading failed, falling back to standard audio.", e);
      return false;
    }
  }

  async function play(riff: Riff, syncScore?: () => Promise<void>) {
    if (riff.stems && riff.stems.length > 0) {
      const ok = await playStems(riff, syncScore);
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
        configureAudioPitch(a, speed);

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
            a.currentTime = 0;
            a.play().catch(() => {});
            void syncScore?.();
          }
        };

        await a.play();
        void syncScore?.();
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

  return { play, stop, playingId, errorId, setStemMix, speed, changeSpeed };
}

function RiffsPage() {
  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();
  const currentLang = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";

  const t = translations[currentLang as keyof typeof translations] || translations.en;

  const { play, stop, playingId, errorId, setStemMix, speed, changeSpeed } = useMp3Player();
  const [showStems, setShowStems] = useState(false);
  const [stemVol, setStemVol] = useState<Record<string, number>>({ guitar: 1, bass: 1, drums: 1 });
  const [stemMute, setStemMute] = useState<Record<string, boolean>>({});
  const [stemSolo, setStemSolo] = useState<Record<string, boolean>>({});

  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const closeModal = () => {
    setIsProModalOpen(false);
    // Reset dello stato di invio dopo la chiusura del modale
    setTimeout(() => setIsSubmitted(false), 300);
  };

  const updateStemMix = (
    vol: Record<string, number>,
    mute: Record<string, boolean>,
    solo: Record<string, boolean>
  ) => {
    setStemVol(vol);
    setStemMute(mute);
    setStemSolo(solo);
    setStemMix(vol, mute, solo);
  };

  const guitarProRef = useRef<any>(null);

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

  const startWithCountIn = async (riff: Riff, syncScore?: () => Promise<void>) => {
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
        void play(riff, syncScore);
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
      guitarProRef.current?.stop();
      return;
    }
    if (countIn?.id === riff.id) {
      cancelCountIn();
      return;
    }

    if (riff.id === "backintherhythm") {
      guitarProRef.current?.stop();
    }

    const syncScore = riff.id === "backintherhythm"
      ? async () => {
          await guitarProRef.current?.restart();
        }
      : undefined;

    void startWithCountIn(riff, syncScore);
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
          return (
            <div key={riff.id} className="flex flex-col gap-4">
              <article className={`overflow-hidden rounded-3xl border bg-card transition-shadow ${active ? "border-primary shadow-neon" : "border-border"}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-2xl">{riff.title}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {riff.stems && (
                      <button
                        onClick={() => setShowStems((v) => !v)}
                        aria-label="Stems mixer"
                        className={`grid h-12 w-12 place-items-center rounded-full bg-fire text-primary-foreground shadow-neon transition-transform active:scale-95 ${showStems ? "ring-2 ring-primary-foreground/70" : ""}`}
                      >
                        <span className="font-display text-lg font-bold">S</span>
                      </button>
                    )}
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

                {/* MIXER DEGLI STEM & SELETTORE VELOCITÀ */}
                {riff.stems && showStems && (
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

                    {/* LISTA STEM TRADOTTI */}
                    {riff.stems.map((stem) => {
                      const muted = !!stemMute[stem.id];
                      const soloed = !!stemSolo[stem.id];
                      const vol = stemVol[stem.id] ?? 1;
                      const translatedName = t.stems[stem.id as keyof typeof t.stems] || stem.name;

                      return (
                        <div key={stem.id} className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              updateStemMix(stemVol, { ...stemMute, [stem.id]: !muted }, stemSolo)
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
                              updateStemMix(stemVol, stemMute, { ...stemSolo, [stem.id]: !soloed })
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
                            updateStemMix(
                              { ...stemVol, [stem.id]: Number(e.target.value) },
                              stemMute,
                              stemSolo
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
                    ref={guitarProRef} 
                    file="/track/Back_in_The_Rhythm.gp" 
                    embedded 
                    speed={speed} 
                  />
                </Suspense>
              </ClientOnly>

              {active && (
                <div className="flex items-center gap-2 border-t border-primary/40 bg-primary/10 px-5 py-2 text-xs font-bold uppercase tracking-widest text-primary">
                  <Flame className="h-3.5 w-3.5 animate-pulse" /> {t.live}
                </div>
              )}
              {errorId === riff.id && (
                <div className="flex items-center gap-2 border-t border-destructive/40 bg-destructive/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t.audioError}
                </div>
              )}
            </article>
          </div>
        );
      })}
    </div>

    {/* BANNER PROMOZIONALE PRO */}
    <section className="relative overflow-hidden rounded-3xl border border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-card to-background p-5 shadow-neon mt-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-black shadow-lg">
            <Crown className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              {t.proBanner.badge}
            </span>
            <h2 className="truncate font-display text-xl text-foreground">{t.proBanner.title}</h2>
            <p className="text-xs text-muted-foreground">{t.proBanner.desc}</p>
          </div>
        </div>

        <div>
          <button
            onClick={() => setIsProModalOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 font-display text-sm uppercase font-bold shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>{t.proBanner.btn}</span>
          </button>
        </div>
      </div>
    </section>

    {/* MODALE CON FORM HTML CLASSICO E INVIO INVISIBILE (IFRAME NASCOSTO) */}
    {isProModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-md rounded-3xl border border-amber-500/60 bg-card p-6 shadow-2xl">
          <button
            onClick={closeModal}
            className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-border bg-background hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-black">
              <Crown className="h-5 w-5" />
            </div>
            <h3 className="font-display text-xl uppercase font-bold text-foreground">
              {t.proModal.title}
            </h3>
          </div>

          <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
            {t.proModal.desc}
          </p>

          {/* Form nativo integrato con invio in background */}
          <form 
            action="https://docs.google.com/forms/u/0/d/e/1FAIpQLSfiLKWGKuX_A7BOwVpEoiffoHQXcJjvhSHRKBfWtiLlhy2dYw/formResponse" 
            method="POST" 
            target="hidden_iframe"
            onSubmit={() => {
              setIsSubmitted(true);
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="email"
              name="entry.230576403" 
              required
              placeholder={t.proModal.placeholder}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-amber-500 focus:outline-none"
            />
            
            <button
              type="submit"
              className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black py-3 font-display text-sm uppercase font-bold shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>{t.proModal.submitBtn}</span>
            </button>
          </form>

          {/* Iframe nascosto per impedire il reindirizzamento della pagina */}
          <iframe name="hidden_iframe" id="hidden_iframe" style={{ display: 'none' }}></iframe>

          {/* Messaggio di successo personalizzato a comparsa */}
          {isSubmitted && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card/95 rounded-3xl p-6 text-center gap-3 animate-in fade-in">
              <CheckCircle2 className="h-12 w-12 text-amber-500 animate-bounce" />
              <p className="font-display text-lg text-foreground">Grandioso! Sei nella lista VIP.</p>
              <button
                onClick={closeModal}
                className="mt-2 rounded-2xl bg-secondary px-6 py-2.5 font-display text-xs uppercase font-bold text-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                {t.proModal.closeBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
}