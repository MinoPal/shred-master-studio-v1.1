import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Zap, Gauge, Minus, Plus, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Allenamento — SHRED Metronomo Progressivo" },
      { name: "description", content: "Visual metronome and Speed Tracker: +2 BPM every 4 bars to shred faster and faster." },
      { property: "og:title", content: "Allenamento — SHRED" },
      { property: "og:description", content: "Metronomo progressivo per chitarristi rock e metal." },
    ],
  }),
  component: TrainingPage,
});

type Language = "it" | "es" | "en";

const translations: Record<Language, Record<string, string>> = {
  en: {
    badge: "/ Warm-up",
    titleMain: "Full Gain",
    titleHighlight: "Training",
    subtitle: "Progressive metronome. Raise the tempo, raise the shred.",
    bpmLabel: "Beats per minute",
    stop: "Stop",
    start: "Riff On",
    speedTrackerTitle: "Speed Tracker",
    speedTrackerSub: "+2 BPM every 4 bars",
    speedTrackerDescPart1: "When enabled, the BPM increases by ",
    speedTrackerDescPart2: "+2",
    speedTrackerDescPart3: " every ",
    speedTrackerDescPart4: "4 bars",
    speedTrackerDescPart5: ". The tempo goes up 2 BPM after every 4 complete measures, progressively pushing your training.",
    statStart: "Start",
    statCurrent: "Current",
    statBars: "Bars",
    noHistory: "Enable Speed Tracker and hit Riff On",
    reset: "Reset",
    feedbackBtn: "Request Riff / Send Feedback",
    privacyBtn: "Privacy Policy",
  },
  it: {
    badge: "/ Riscaldamento",
    titleMain: "Allenamento",
    titleHighlight: "Full Gain",
    subtitle: "Metronomo progressivo. Aumenta il tempo, spingi lo shred.",
    bpmLabel: "Battiti al minuto",
    stop: "Pausa",
    start: "Riff On",
    speedTrackerTitle: "Speed Tracker",
    speedTrackerSub: "+2 BPM ogni 4 battute",
    speedTrackerDescPart1: "Quando attivo, il BPM aumenta di ",
    speedTrackerDescPart2: "+2",
    speedTrackerDescPart3: " ogni ",
    speedTrackerDescPart4: "4 battute",
    speedTrackerDescPart5: ". Il tempo sale di 2 BPM dopo ogni 4 misure complete, spingendo progressivamente il tuo allenamento.",
    statStart: "Inizio",
    statCurrent: "Attuale",
    statBars: "Misure",
    noHistory: "Attiva Speed Tracker e premi Riff On",
    reset: "Azzera",
    feedbackBtn: "Richiedi Riff / Invia Feedback",
    privacyBtn: "Informativa sulla Privacy",
  },
  es: {
    badge: "/ Calentamiento",
    titleMain: "Entrenamiento",
    titleHighlight: "Full Gain",
    subtitle: "Metrónomo progresivo. Sube el tempo, sube el shred.",
    bpmLabel: "Pulsaciones por minuto",
    stop: "Pausa",
    start: "Riff On",
    speedTrackerTitle: "Speed Tracker",
    speedTrackerSub: "+2 BPM cada 4 compases",
    speedTrackerDescPart1: "Al activarse, el BPM aumenta ",
    speedTrackerDescPart2: "+2",
    speedTrackerDescPart3: " cada ",
    speedTrackerDescPart4: "4 compases",
    speedTrackerDescPart5: ". El tempo sube 2 BPM tras cada 4 compases completos, aumentando progresivamente tu velocidad.",
    statStart: "Inicio",
    statCurrent: "Actual",
    statBars: "Compases",
    noHistory: "Activa Speed Tracker y pulsa Riff On",
    reset: "Reiniciar",
    feedbackBtn: "Pedir Riff / Enviar Feedback",
    privacyBtn: "Política de Privacidad",
  },
};

// Il tuo link diretto al modulo Google Forms
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSffNjH4YDBe5l5g1WpsVDGCTD0MyYoPzQYuNeLhFhMilGL3SA/viewform?usp=publish-editor";

function TrainingPage() {
  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();
  const currentLang: Language = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";
  const t = translations[currentLang] || translations.en;

  const [bpm, setBpm] = useState(90);
  const [startBpm, setStartBpm] = useState(90);
  const [playing, setPlaying] = useState(false);
  const [speedMode, setSpeedMode] = useState(false);
  const [beat, setBeat] = useState(0); // 0..3
  const [measure, setMeasure] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const measureCountRef = useRef(0);
  const bpmRef = useRef(bpm);
  const speedRef = useRef(speedMode);
  const timerRef = useRef<number | null>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { speedRef.current = speedMode; }, [speedMode]);

  function click(time: number, accent: boolean) {
    const ctx = audioCtxRef.current!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 900;
    osc.type = "square";
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  function scheduler() {
    const ctx = audioCtxRef.current!;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      const beatIdx = beatCountRef.current % 4;
      click(nextNoteTimeRef.current, beatIdx === 0);
      const scheduledBeat = beatIdx;
      const delay = Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000);
      window.setTimeout(() => setBeat(scheduledBeat), delay);

      beatCountRef.current += 1;
      if (beatCountRef.current % 4 === 0) {
        measureCountRef.current += 1;
        const m = measureCountRef.current;
        window.setTimeout(() => setMeasure(m), delay);
        if (speedRef.current && m % 4 === 0) {
          const newBpm = Math.min(300, bpmRef.current + 2);
          bpmRef.current = newBpm;
          window.setTimeout(() => {
            setBpm(newBpm);
            setHistory((h) => [...h.slice(-39), newBpm]);
          }, delay);
        }
      }
      const secondsPerBeat = 60 / bpmRef.current;
      nextNoteTimeRef.current += secondsPerBeat;
    }
    timerRef.current = window.setTimeout(scheduler, 25);
  }

  function start() {
    // Se l'AudioContext non esiste o è stato chiuso, ne creiamo uno nuovo
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Se è in sospensione, lo riattiviamo
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    beatCountRef.current = 0;
    measureCountRef.current = 0;
    setBeat(0);
    setMeasure(0);
    setHistory([bpmRef.current]);
    nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;
    setPlaying(true);
    scheduler();
  }

  function stop() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;

    // Mettiamo in pausa l'AudioContext per liberare risorse sul telefono
    if (audioCtxRef.current && audioCtxRef.current.state === "running") {
      audioCtxRef.current.suspend();
    }

    setPlaying(false);
  }

  // CLEANUP FONDAMENTALE: Quando l'utente cambia pagina, chiudiamo del tutto l'audio del metronomo
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  function reset() {
    stop();
    setBpm(startBpm);
    bpmRef.current = startBpm;
    setHistory([]);
    setMeasure(0);
    setBeat(0);
  }

  const maxHist = Math.max(...history, bpm, 1);
  const minHist = Math.min(...(history.length ? history : [bpm]));

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-12 max-w-4xl mx-auto">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{t.badge}</p>
        <h1 className="mt-1 text-4xl font-black">
          {t.titleMain} <span className="text-neon">{t.titleHighlight}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      {/* BPM display */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-ember">
        <div className="absolute inset-x-0 top-0 h-px bg-fire opacity-70" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.bpmLabel}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-7xl leading-none ${playing ? "text-neon" : "text-foreground"}`}>{bpm}</span>
              <span className="text-sm font-semibold text-muted-foreground">BPM</span>
            </div>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-4 w-4 rounded-full transition-all ${
                  playing && beat === i
                    ? i === 0 ? "bg-primary shadow-neon scale-125" : "bg-accent scale-125"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => { const v = Math.max(30, bpm - 1); setBpm(v); bpmRef.current = v; if (!playing) setStartBpm(v); }}
            className="grid h-11 w-11 place-items-center rounded-full border border-border bg-secondary text-foreground active:scale-95"
          ><Minus className="h-5 w-5" /></button>
          <input
            type="range" min={40} max={240} value={bpm}
            onChange={(e) => { const v = +e.target.value; setBpm(v); bpmRef.current = v; if (!playing) setStartBpm(v); }}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
          />
          <button
            onClick={() => { const v = Math.min(300, bpm + 1); setBpm(v); bpmRef.current = v; if (!playing) setStartBpm(v); }}
            className="grid h-11 w-11 place-items-center rounded-full border border-border bg-secondary text-foreground active:scale-95"
          ><Plus className="h-5 w-5" /></button>
        </div>

        <button
          onClick={playing ? stop : start}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-fire py-4 font-display text-2xl uppercase text-primary-foreground shadow-neon transition-transform active:scale-[0.98]"
        >
          {playing ? <><Pause className="h-6 w-6" /> {t.stop}</> : <><Play className="h-6 w-6" /> {t.start}</>}
        </button>
      </section>

      {/* Speed Tracker */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl">{t.speedTrackerTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.speedTrackerSub}</p>
            </div>
          </div>
          <button
            onClick={() => setSpeedMode((s) => !s)}
            className={`relative h-8 w-14 shrink-0 overflow-hidden rounded-full border transition-colors duration-300 ease-out ${
              speedMode
                ? "border-white bg-white shadow-[0_0_18px_rgba(255,255,255,0.55)]"
                : "border-border bg-secondary"
            }`}
            aria-pressed={speedMode}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full transition-all duration-300 ease-out ${
                speedMode
                  ? "left-0.5 bg-black shadow-[0_0_8px_rgba(0,0,0,0.35)]"
                  : "left-[calc(100%-1.75rem)] bg-neutral-700"
              }`}
            />
          </button>
        </div>

        <p className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed transition-colors ${speedMode ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-background/40 text-muted-foreground"}`}>
          {t.speedTrackerDescPart1}<span className="font-bold text-primary">{t.speedTrackerDescPart2}</span>{t.speedTrackerDescPart3}<span className="font-bold text-primary">{t.speedTrackerDescPart4}</span>{t.speedTrackerDescPart5}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label={t.statStart} value={`${startBpm}`} />
          <Stat label={t.statCurrent} value={`${bpm}`} highlight />
          <Stat label={t.statBars} value={`${measure}`} />
        </div>

        {/* Sparkline */}
        <div className="mt-4 h-24 rounded-xl border border-border bg-background/60 p-3">
          {history.length > 1 ? (
            <svg viewBox={`0 0 ${history.length - 1} 100`} preserveAspectRatio="none" className="h-full w-full">
              <defs>
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.19 55)" />
                  <stop offset="100%" stopColor="oklch(0.62 0.24 25)" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke="url(#g)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                points={history
                  .map((v, i) => `${i},${100 - ((v - minHist) / Math.max(1, maxHist - minHist)) * 90 - 5}`)
                  .join(" ")}
              />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              <Gauge className="mr-2 h-4 w-4" /> {t.noHistory}
            </div>
          )}
        </div>

        <button onClick={reset} className="mt-3 w-full rounded-xl border border-border py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {t.reset}
        </button>
      </section>

      {/* FOOTER LINK: FEEDBACK & PRIVACY POLICY */}
      <footer className="mt-4 flex flex-col items-center justify-center gap-3 pt-4 border-t border-border/50 text-xs">
        <a
          href={GOOGLE_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 font-bold text-primary hover:bg-primary/20 transition-all active:scale-95"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>{t.feedbackBtn}</span>
        </a>

        <Link
          to="/privacy"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors py-1 text-[11px]"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{t.privacyBtn}</span>
        </Link>
      </footer>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-border p-3 ${highlight ? "bg-primary/10" : "bg-background/60"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl ${highlight ? "text-neon" : ""}`}>{value}</p>
    </div>
  );
}