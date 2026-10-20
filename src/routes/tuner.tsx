import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  Mic,
  AlertTriangle,
  Sparkles,
  Settings2,
  Power,
  Info,
  SlidersHorizontal,
  RotateCcw,
  Music2,
  ChevronDown,
  Clock,
  ChevronRight,
} from "lucide-react";

import { useLanguage } from "../context/LanguageContext";

export const Route = createFileRoute("/tuner")({
  head: () => ({
    meta: [
      { title: "Cam & Tuner — SHRED Posture + Pitch Detection" },
      { name: "description", content: "Front camera with posture guide overlay and live pitch detection." },
      { property: "og:title", content: "Cam & Tuner — SHRED" },
      { property: "og:description", content: "Real-time posture overlay guide and pitch detection tuner." },
    ],
  }),
  component: TunerPage,
});

type Language = "it" | "es" | "en";
type PresetKey = "E_STANDARD" | "DROP_D" | "DROP_C" | "CUSTOM";

interface GuitarString {
  name: string;
  octave: string;
  freq: number;
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    badge: "/ CONTROL ROOM",
    titleMain: "Cam",
    titleSub: "Tuner",
    subtitle: "Precision pitch detection tuner + hand posture guide.",
    overlayActive: "Visual Mirror Active",
    comingSoonBadge: "Under Development — AI Posture Tracking",
    comingSoonNotice: "Camera is currently active as a visual mirror. Automated AI posture analysis is coming soon!",
    leftHand: "Left (Fretting)",
    rightHand: "Right (Picking)",
    alignLeft: "POSITION FRETTING HAND IN FRONT OF CAMERA",
    alignRight: "POSITION PICKING HAND IN FRONT OF CAMERA",
    enableCamMic: "Enable Cam + Mic",
    camError: "Camera access denied. Enable permissions for the posture check.",
    micError: "Microphone access denied. The tuner needs the mic to hear you.",
    enablePrompt: "Please enable Camera & Microphone first by clicking the orange button above to use the tuner.",
    enableNow: "Enable Now",
    tunerOn: "TUNER ON",
    tunerOff: "TUNER OFF",
    custom: "Custom",
    pitchShift: "Pitch Shift",
    pitchShiftTitle: "Pitch Shift / Transpose",
    octave: "Octaves",
    semitone: "Semitones",
    resetShift: "Reset Pitch Shift",
    muted: "Muted",
    awaiting: "Awaiting signal...",
    stringLabel: "String",
    off: "OFF",
    tunerDisabled: "Tuner Disabled",
    inTune: "● In Tune",
    flat: "Flat",
    sharp: "Sharp",
    pluckString: "Pluck an open string",
    tunerTip: "Tip: Bring your device microphone close to the amplifier or guitar for optimal detection.",
    postureTitle: "Hand Posture Guide",
    frettingHandBtn: "Fretting Hand (Left)",
    pickingHandBtn: "Picking Hand (Right)",
    leftTip1Title: "Arch your fingers",
    leftTip1Text: "Ensure your fingers hit the fretboard vertically to prevent unwanted string muting.",
    leftTip2Title: "Thumb positioning",
    leftTip2Text: "Keep your thumb behind the neck, roughly opposite your middle finger, for optimal leverage.",
    leftTip3Title: "Relax the wrist",
    leftTip3Text: "Keep your wrist straight and relaxed to avoid strain during fast passages.",
    rightTip1Title: "Anchor point",
    rightTip1Text: "Rest your forearm lightly on the guitar body, keeping your wrist flexible.",
    rightTip2Title: "Pick angle",
    rightTip2Text: "Angle the pick slightly (around 45°) against the strings to reduce resistance and increase speed.",
    rightTip3Title: "Minimal movement",
    rightTip3Text: "Use small, controlled movements from the wrist rather than the arm for efficient alternate picking.",
  },
  it: {
    badge: "/ SALA DI CONTROLLO",
    titleMain: "Cam",
    titleSub: "Tuner",
    subtitle: "Accordatore di precisione + guida alla postura delle mani.",
    overlayActive: "Specchio Visivo Attivo",
    comingSoonBadge: "In Lavorazione — Tracciamento IA Postura",
    comingSoonNotice: "La fotocamera è attiva come specchio visivo. La funzione di analisi automatica della postura tramite IA è attualmente in sviluppo.",
    leftHand: "Sinistra (Tasto)",
    rightHand: "Destra (Plettro)",
    alignLeft: "POSIZIONA LA MANO SULLA TASTIERA DI FRONTE ALLA CAM",
    alignRight: "POSIZIONA LA MANO SUL PONTE DI FRONTE ALLA CAM",
    enableCamMic: "Attiva Cam + Microfono",
    camError: "Accesso alla fotocamera negato. Abilita i permessi per il controllo della postura.",
    micError: "Accesso al microfono negato. L'accordatore ha bisogno del microfono per rilevare le note.",
    enablePrompt: "Per favore attiva prima la fotocamera e il microfono cliccando sul pulsante arancione per usare l'accordatore.",
    enableNow: "Attiva Ora",
    tunerOn: "ACCORDATORE ON",
    tunerOff: "ACCORDATORE OFF",
    custom: "Personalizzato",
    pitchShift: "Pitch Shift",
    pitchShiftTitle: "Pitch Shift / Trasposizione",
    octave: "Ottave",
    semitone: "Semitoni",
    resetShift: "Ripristina Pitch Shift",
    muted: "Muto",
    awaiting: "In attesa del segnale...",
    stringLabel: "Corda",
    off: "OFF",
    tunerDisabled: "Accordatore Disattivato",
    inTune: "● In Accordo",
    flat: "Calante (Flat)",
    sharp: "Crescente (Sharp)",
    pluckString: "Suona una corda a vuoto",
    tunerTip: "Suggerimento: avvicina il microfono del dispositivo all'amplificatore o alla chitarra per una ricezione ottimale.",
    postureTitle: "Guida alla Postura delle Mani",
    frettingHandBtn: "Mano sulla Tastiera (Sinistra)",
    pickingHandBtn: "Mano sul Plettro (Destra)",
    leftTip1Title: "Incurva le dita",
    leftTip1Text: "Assicurati che le dita tocchino la tastiera verticalmente per evitare di stoppare involontariamente le altre corde.",
    leftTip2Title: "Posizione del pollice",
    leftTip2Text: "Tieni il pollice dietro il manico, all'incirca di fronte al dito medio, per una leva ottimale.",
    leftTip3Title: "Rilassa il polso",
    leftTip3Text: "Mantieni il polso dritto e rilassato per evitare affaticamenti durante i passaggi veloci.",
    rightTip1Title: "Punto di ancoraggio",
    rightTip1Text: "Appoggia leggermente l'avambraccio sul corpo della chitarra, mantenendo il polso flessibile.",
    rightTip2Title: "Angolo del plettro",
    rightTip2Text: "Inclina leggermente il plettro (circa 45°) rispetto alle corde per ridurre la resistenza e aumentare la velocità.",
    rightTip3Title: "Movimento minimo",
    rightTip3Text: "Usa movimenti piccoli e controllati del polso invece dell'intero braccio per una pennata alternata efficiente.",
  },
  es: {
    badge: "/ SALA DE CONTROL",
    titleMain: "Cam",
    titleSub: "Tuner",
    subtitle: "Afinador de precisión + guía de postura de manos.",
    overlayActive: "Espejo Visual Activo",
    comingSoonBadge: "En Desarrollo — Seguimiento de Postura IA",
    comingSoonNotice: "La cámara está activa como espejo visual. El análisis automático de postura con IA está actualmente en desarrollo.",
    leftHand: "Izquierda (Mástil)",
    rightHand: "Derecha (Púa)",
    alignLeft: "POSICIONA LA MANO EN EL MÁSTIL FRENTE A LA CÁMARA",
    alignRight: "POSICIONA LA MANO EN EL PUENTE FRENTE A LA CÁMARA",
    enableCamMic: "Activar Cam + Micrófono",
    camError: "Acceso a la cámara denegado. Habilita los permisos para la guía de postura.",
    micError: "Acceso al micrófono denegado. El afinador necesita el micrófono para escuchar.",
    enablePrompt: "Por favor, activa primero la cámara y el micrófono haciendo clic en el botón naranja superior para usar el afinador.",
    enableNow: "Activar Ahora",
    tunerOn: "AFINADOR ON",
    tunerOff: "AFINADOR OFF",
    custom: "Personalizado",
    pitchShift: "Pitch Shift",
    pitchShiftTitle: "Pitch Shift / Transposición",
    octave: "Octavas",
    semitone: "Semitones",
    resetShift: "Restablecer Pitch Shift",
    muted: "Silenciado",
    awaiting: "Esperando señal...",
    stringLabel: "Cuerda",
    off: "OFF",
    tunerDisabled: "Afinador Desactivado",
    inTune: "● Afinado",
    flat: "Bajo (Flat)",
    sharp: "Alto (Sharp)",
    pluckString: "Toca una cuerda al aire",
    tunerTip: "Consejo: Acerca el micrófono de tu dispositivo al amplificador o a la guitarra para una mejor recepción.",
    postureTitle: "Guía de Postura de las Manos",
    frettingHandBtn: "Mano del Mástil (Izquierda)",
    pickingHandBtn: "Mano de la Púa (Derecha)",
    leftTip1Title: "Arquea los dedos",
    leftTip1Text: "Asegúrate de que tus dedos pisen el diapasón de forma vertical para evitar silenciar cuerdas adyacentes.",
    leftTip2Title: "Posición del pulgar",
    leftTip2Text: "Mantén el pulgar detrás del mástil, a la altura del dedo corazón, para una palanca óptima.",
    leftTip3Title: "Relaja la muñeca",
    leftTip3Text: "Mantén la muñeca recta y relajada para evitar tensiones durante pasajes rápidos.",
    rightTip1Title: "Punto de apoyo",
    rightTip1Text: "Apoya suavemente el antebrazo sobre el cuerpo de la guitarra, manteniendo la muñeca flexible.",
    rightTip2Title: "Ángulo de la púa",
    rightTip2Text: "Inclina ligeramente la púa (unos 45°) respecto a las cuerdas para reducir la resistencia y ganar velocidad.",
    rightTip3Title: "Movimiento mínimo",
    rightTip3Text: "Realiza movimientos pequeños y controlados desde la muñeca en lugar de usar todo el brazo.",
  },
};

const PRESETS: Record<Exclude<PresetKey, "CUSTOM">, GuitarString[]> = {
  E_STANDARD: [
    { name: "E", octave: "E2", freq: 82.41 },
    { name: "A", octave: "A2", freq: 110.0 },
    { name: "D", octave: "D3", freq: 146.83 },
    { name: "G", octave: "G3", freq: 196.0 },
    { name: "B", octave: "B3", freq: 246.94 },
    { name: "E", octave: "E4", freq: 329.63 },
  ],
  DROP_D: [
    { name: "D", octave: "D2", freq: 73.42 },
    { name: "A", octave: "A2", freq: 110.0 },
    { name: "D", octave: "D3", freq: 146.83 },
    { name: "G", octave: "G3", freq: 196.0 },
    { name: "B", octave: "B3", freq: 246.94 },
    { name: "E", octave: "E4", freq: 329.63 },
  ],
  DROP_C: [
    { name: "C", octave: "C2", freq: 65.41 },
    { name: "G", octave: "G2", freq: 98.0 },
    { name: "C", octave: "C3", freq: 130.81 },
    { name: "F", octave: "F3", freq: 174.61 },
    { name: "A", octave: "A3", freq: 220.0 },
    { name: "D", octave: "D4", freq: 293.66 },
  ],
};

const CUSTOM_NOTE_OPTIONS = [
  // Ottava 1 (Per accordature ribassate estreme, Drop B, Drop A, ecc.)
  { name: "C", octave: "C1", freq: 32.70 },
  { name: "D", octave: "D1", freq: 36.71 },
  { name: "E", octave: "E1", freq: 41.20 },
  { name: "F", octave: "F1", freq: 43.65 },
  { name: "G", octave: "G1", freq: 49.00 },
  { name: "A", octave: "A1", freq: 55.00 },
  { name: "B", octave: "B1", freq: 61.74 },
  
  // Ottava 2 (Standard gravi e Drop C/D)
  { name: "C", octave: "C2", freq: 65.41 },
  { name: "D", octave: "D2", freq: 73.42 },
  { name: "E", octave: "E2", freq: 82.41 },
  { name: "F", octave: "F2", freq: 87.31 },
  { name: "G", octave: "G2", freq: 98.00 },
  { name: "A", octave: "A2", freq: 110.00 },
  { name: "B", octave: "B2", freq: 123.47 },
  
  // Ottava 3 (Medie)
  { name: "C", octave: "C3", freq: 130.81 },
  { name: "D", octave: "D3", freq: 146.83 },
  { name: "E", octave: "E3", freq: 164.81 },
  { name: "F", octave: "F3", freq: 174.61 },
  { name: "G", octave: "G3", freq: 196.00 },
  { name: "A", octave: "A3", freq: 220.00 },
  { name: "B", octave: "B3", freq: 246.94 },
  
  // Ottava 4 (Acute e cantini)
  { name: "C", octave: "C4", freq: 261.63 },
  { name: "D", octave: "D4", freq: 293.66 },
  { name: "E", octave: "E4", freq: 329.63 }, // 1ª corda Standard
  { name: "F", octave: "F4", freq: 349.23 },
  { name: "G", octave: "G4", freq: 392.00 }, // Limite massimo di tensione per la 1ª corda
];

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0,
    r2 = SIZE - 1,
    thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++)
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  for (let i = 1; i < SIZE / 2; i++)
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  const c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1,
    maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;
  if (T0 <= 0) return -1;
  const x1 = c[T0 - 1],
    x2 = c[T0],
    x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
}

function nearestString(freq: number, currentStrings: GuitarString[]) {
  let best = currentStrings[0],
    diff = Infinity;
  for (const s of currentStrings) {
    const cents = Math.abs(1200 * Math.log2(freq / s.freq));
    if (cents < diff) {
      diff = cents;
      best = s;
    }
  }
  const cents = 1200 * Math.log2(freq / best.freq);
  return { string: best, cents };
}

function shiftFrequency(freq: number, totalSemitones: number): number {
  return freq * Math.pow(2, totalSemitones / 12);
}

const SMOOTHING_FACTOR = 0.15;

function TunerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const smoothedCentsRef = useRef<number>(0);

  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();

  const currentLang: Language = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";

  const t = useCallback(
    (key: string) => {
      return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS["en"][key] || key;
    },
    [currentLang]
  );

  const [camErrorKey, setCamErrorKey] = useState<string | null>(null);
  const [micErrorKey, setMicErrorKey] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const [tunerActive, setTunerActive] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const [octaveShift, setOctaveShift] = useState<number>(0);
  const [semitoneShift, setSemitoneShift] = useState<number>(0);
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState(false);

  const [pitch, setPitch] = useState<number | null>(null);
  const [note, setNote] = useState<{ name: string; octave: string; cents: number } | null>(null);

  const [preset, setPreset] = useState<PresetKey>("E_STANDARD");
  const [customStrings, setCustomStrings] = useState<GuitarString[]>([...PRESETS.E_STANDARD]);

  const [handView, setHandView] = useState<"LEFT" | "RIGHT">("LEFT");

  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<Float32Array | null>(null);

  const totalSemitoneShift = octaveShift * 12 + semitoneShift;
  const baseStrings = preset === "CUSTOM" ? customStrings : PRESETS[preset];

  const activeStrings = baseStrings.map((s) => ({
    ...s,
    freq: shiftFrequency(s.freq, totalSemitoneShift),
  }));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsShiftDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function start() {
    setStarted(true);
    setShowPrompt(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCamErrorKey("camError");
    }

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(mic);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      setIsAudioReady(true);
    } catch {
      setMicErrorKey("micError");
    }
  }

  const handleToggleTuner = () => {
    if (!started) {
      setShowPrompt(true);
      return;
    }
    setShowPrompt(false);
    setTunerActive((prev) => !prev);
  };

  useEffect(() => {
    if (!tunerActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPitch(null);
      setNote(null);
      smoothedCentsRef.current = 0;
    } else if (started && isAudioReady && analyserRef.current) {
      loop();
    }
}, [tunerActive, started, isAudioReady, octaveShift, semitoneShift, preset, customStrings]);

  function loop() {
    if (!tunerActive) return;
    const analyser = analyserRef.current,
      ctx = ctxRef.current,
      buf = bufRef.current;
    if (!analyser || !ctx || !buf) return;
    analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    const f = autoCorrelate(buf, ctx.sampleRate);
    if (f > 15 && f < 4000) {
      const { string, cents: rawCents } = nearestString(f, activeStrings);
      
      // Sesta corda lasciata naturale, 1°-5° corda con smoothing
      const isSixthString = string === activeStrings[0] || f < 95;

      let finalCents: number;
      if (isSixthString) {
        finalCents = rawCents;
        smoothedCentsRef.current = rawCents;
      } else {
        const prev = smoothedCentsRef.current;
        const smoothed = prev + (rawCents - prev) * SMOOTHING_FACTOR;
        finalCents = Math.abs(smoothed) < 1.5 ? 0 : smoothed;
        smoothedCentsRef.current = finalCents;
      }

      setPitch(f);
      setNote({ name: string.name, octave: string.octave, cents: finalCents });
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close();
    const v = videoRef.current;
    const s = v?.srcObject as MediaStream | null;
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  const handleCustomNoteChange = (index: number, selectedOctave: string) => {
    const found = CUSTOM_NOTE_OPTIONS.find((opt) => opt.octave === selectedOctave);
    if (!found) return;
    const updated = [...customStrings];
    updated[index] = found;
    setCustomStrings(updated);
  };

  const adjustOctave = (delta: number) => {
    setOctaveShift((prev) => Math.min(12, Math.max(-12, prev + delta)));
  };

  const adjustSemitone = (delta: number) => {
    setSemitoneShift((prev) => Math.min(11, Math.max(-11, prev + delta)));
  };

  const resetShift = () => {
    setOctaveShift(0);
    setSemitoneShift(0);
  };

  const cents = note?.cents ?? 0;
  const inTune = Math.abs(cents) < 4;
  const barPos = Math.max(-48, Math.min(48, cents));

  const getShiftBadgeLabel = () => {
    if (octaveShift === 0 && semitoneShift === 0) return "0 oct";
    const parts = [];
    if (octaveShift !== 0) parts.push(`${octaveShift > 0 ? `+${octaveShift}` : octaveShift} oct`);
    if (semitoneShift !== 0) parts.push(`${semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift} st`);
    return parts.join(" ");
  };

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-12 max-w-4xl mx-auto">
      {tunerActive && (
        <style font-mono>{`
          nav, [role="navigation"], .floating-menu, footer {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `}</style>
      )}

      {/* HEADER */}
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{t("badge")}</p>
          <h1 className="mt-1 text-4xl font-black">
            {t("titleMain")} <span className="text-neon">&</span> {t("titleSub")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      {/* WEBCAM & POSTURE OVERLAY FRAME */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-black" style={{ aspectRatio: "16 / 9" }}>
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />

        {/* OVERLAY VISUAL MIRROR + BANNER INFORMAZIONI CHIARO */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
          <div className="w-full flex justify-between items-center">
            <div className="flex gap-1.5 rounded-full border border-primary/40 bg-background/80 p-1 backdrop-blur-md pointer-events-auto">
              <button
                onClick={() => setHandView("LEFT")}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase transition-all ${
                  handView === "LEFT" ? "bg-primary text-primary-foreground shadow-neon" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("leftHand")}
              </button>
              <button
                onClick={() => setHandView("RIGHT")}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase transition-all ${
                  handView === "RIGHT" ? "bg-primary text-primary-foreground shadow-neon" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("rightHand")}
              </button>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-[10px] font-bold text-primary backdrop-blur">
              <Sparkles className="h-3 w-3 animate-pulse" /> {t("overlayActive")}
            </span>
          </div>

          {/* AVVISO CHIARO STATO FEATURE */}
          <div className="max-w-md rounded-2xl border border-amber-500/40 bg-black/80 p-3 backdrop-blur-md text-center shadow-2xl">
            <div className="flex items-center justify-center gap-1.5 text-amber-400 font-bold text-xs mb-1">
              <Clock className="h-4 w-4 animate-spin" />
              <span>{t("comingSoonBadge")}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("comingSoonNotice")}
            </p>
          </div>
        </div>

        {!started && (
          <div className="absolute inset-0 grid place-items-center bg-background/85 backdrop-blur">
            <button
              onClick={start}
              className="flex items-center gap-3 rounded-2xl bg-fire px-6 py-4 font-display text-lg uppercase text-primary-foreground shadow-neon active:scale-95"
            >
              <Camera className="h-6 w-6" /> {t("enableCamMic")}
            </button>
          </div>
        )}
        {camErrorKey && (
          <div className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-xl border border-destructive/60 bg-background/90 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t(camErrorKey)}
          </div>
        )}
      </section>

      {/* WARNING PROMPT */}
      {showPrompt && !started && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-xs font-bold text-amber-300">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 shrink-0 text-amber-400" />
            <span>{t("enablePrompt")}</span>
          </div>
          <button onClick={start} className="shrink-0 rounded-xl bg-fire px-3 py-1.5 text-xs uppercase text-primary-foreground shadow-sm">
            {t("enableNow")}
          </button>
        </div>
      )}

      {/* TUNER PANEL */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleTuner}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                tunerActive
                  ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(52,137,72,0.6)]"
                  : "bg-muted text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              {tunerActive ? t("tunerOn") : t("tunerOff")}
            </button>

            {(["E_STANDARD", "DROP_D", "DROP_C"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  preset === k
                    ? "bg-primary text-primary-foreground shadow-neon"
                    : "border border-border bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {k.replace("_", " ")}
              </button>
            ))}

            <button
              onClick={() => setPreset("CUSTOM")}
              className={`flex items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                preset === "CUSTOM"
                  ? "bg-primary text-primary-foreground shadow-neon"
                  : "border border-border bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" /> {t("custom")}
            </button>

            {/* PITCH SHIFT DROPDOWN */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsShiftDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all border ${
                  octaveShift !== 0 || semitoneShift !== 0
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Music2 className="h-3.5 w-3.5" />
                <span>{t("pitchShift")}</span>
                <span className="ml-1 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-mono border border-border">
                  {getShiftBadgeLabel()}
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isShiftDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isShiftDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 z-50 w-72 rounded-2xl border border-border bg-card p-4 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold">{t("pitchShiftTitle")}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{getShiftBadgeLabel()}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => adjustOctave(1)}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-background/60 p-2.5 text-xs font-bold hover:bg-primary/20 hover:border-primary active:scale-95 transition-all"
                    >
                      <span className="text-primary text-sm font-black">+1 Oct</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t("octave")}: {octaveShift > 0 ? `+${octaveShift}` : octaveShift}</span>
                    </button>

                    <button
                      onClick={() => adjustOctave(-1)}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-background/60 p-2.5 text-xs font-bold hover:bg-primary/20 hover:border-primary active:scale-95 transition-all"
                    >
                      <span className="text-primary text-sm font-black">-1 Oct</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t("octave")}: {octaveShift > 0 ? `+${octaveShift}` : octaveShift}</span>
                    </button>

                    <button
                      onClick={() => adjustSemitone(1)}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-background/60 p-2.5 text-xs font-bold hover:bg-primary/20 hover:border-primary active:scale-95 transition-all"
                    >
                      <span className="text-foreground text-sm font-black">+1 Semi</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t("semitone")}: {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift}</span>
                    </button>

                    <button
                      onClick={() => adjustSemitone(-1)}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-background/60 p-2.5 text-xs font-bold hover:bg-primary/20 hover:border-primary active:scale-95 transition-all"
                    >
                      <span className="text-foreground text-sm font-black">-1 Semi</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t("semitone")}: {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift}</span>
                    </button>
                  </div>

                  {(octaveShift !== 0 || semitoneShift !== 0) && (
                    <button
                      onClick={resetShift}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("resetShift")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Mic className={`h-4 w-4 ${started && tunerActive ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-xs font-semibold text-muted-foreground">
              {!tunerActive ? t("tunerDisabled") : pitch ? `${pitch.toFixed(1)} Hz` : t("awaiting")}
            </span>
          </div>
        </div>

        {/* CUSTOM TUNING SELECTORS */}
        {preset === "CUSTOM" && (
          <div className="mt-4 grid grid-cols-6 gap-2 rounded-2xl border border-border bg-background/40 p-3">
            {customStrings.map((str, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("stringLabel")} {6 - idx}</span>
                <select
                  value={str.octave}
                  onChange={(e) => handleCustomNoteChange(idx, e.target.value)}
                  className="w-full rounded-lg border border-border bg-card text-center text-xs font-bold py-1 focus:border-primary focus:outline-none"
                >
                  {CUSTOM_NOTE_OPTIONS.map((opt) => (
                    <option key={opt.octave} value={opt.octave}>
                      {opt.octave} ({opt.freq.toFixed(0)}Hz)
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* SUGGERIMENTO MICROFONO */}
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>{t("tunerTip")}</span>
        </div>

        {/* VISUAL TUNER METER */}
        <div className="mt-6 flex flex-col items-center">
          <div className="text-center h-20 flex flex-col justify-center">
            {tunerActive && note ? (
              <>
                <div className="font-display text-6xl font-black tracking-tight text-foreground">
                  {note.name}<span className="text-2xl font-bold text-muted-foreground">{note.octave.slice(-1)}</span>
                </div>
                <div className={`text-xs font-bold uppercase mt-1 ${inTune ? "text-emerald-500" : "text-amber-500"}`}>
                  {inTune ? t("inTune") : cents < 0 ? `${t("flat")} (${cents.toFixed(1)}c)` : `${t("sharp")} (+${cents.toFixed(1)}c)`}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground font-semibold">
                {!tunerActive ? t("tunerDisabled") : t("pluckString")}
              </p>
            )}
          </div>

          <div className="relative mt-4 h-3 w-full max-w-md rounded-full bg-secondary overflow-hidden border border-border">
            <div
              className={`absolute top-0 bottom-0 w-2 transition-all duration-75 rounded-full ${
                inTune ? "bg-emerald-500 shadow-[0_0_10px_rgba(52,137,72,0.8)]" : "bg-primary shadow-neon"
              }`}
              style={{
                left: `calc(50% + ${barPos}% - 4px)`,
              }}
            />
          </div>
          <div className="flex justify-between w-full max-w-md text-[10px] font-mono text-muted-foreground mt-1 px-1">
            <span>-50c</span>
            <span>-25c</span>
            <span className="text-primary font-bold">0</span>
            <span>+25c</span>
            <span>+50c</span>
          </div>
        </div>
      </section>

      {/* POSTURE GUIDE SECTION - ORIZZONTALE A PIENA LARGHEZZA */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-primary shrink-0" />
          <span className="uppercase tracking-wider font-display">{t("postureTitle")}</span>
        </h2>

        <div className="flex flex-col gap-3">
          {handView === "LEFT" ? (
            <>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip1Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip1Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip2Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip2Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip3Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip3Text")}</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("rightTip1Title")}: </span>
                  <span className="text-muted-foreground">{t("rightTip1Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("rightTip2Title")}: </span>
                  <span className="text-muted-foreground">{t("rightTip2Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("rightTip3Title")}: </span>
                  <span className="text-muted-foreground">{t("rightTip3Text")}</span>
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}