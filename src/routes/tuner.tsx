import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  Mic,
  AlertTriangle,
  Sparkles,
  Info,
  Clock,
  Power,
  ChevronDown,
  Save,
  Trash2,
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
type PresetKey = string; // Supporta sia preset fissi che custom salvati

interface GuitarString {
  name: string;
  octave: string;
  freq: number;
}

interface SavedCustomPreset {
  id: string;
  name: string;
  strings: GuitarString[];
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
    enableCamMic: "Enable Cam + Mic",
    camError: "Camera access denied. Enable permissions for the posture check.",
    micError: "Microphone access denied. The tuner needs the mic to hear you.",
    enablePrompt: "Please enable Camera & Microphone first by clicking the orange button above to use the tuner.",
    enableNow: "Enable Now",
    tunerOn: "ON",
    tunerOff: "OFF",
    custom: "Custom",
    savePreset: "Save Preset",
    presetNamePlaceholder: "Preset Name (e.g. My Brutal Drop)...",
    moreTunings: "More Tunings...",
    awaiting: "Awaiting signal...",
    stringLabel: "String",
    tunerDisabled: "Tuner Disabled (Click ON to start)",
    pluckString: "Pluck an open string",
    tunerTip: "Tip: Bring your device microphone close to the amplifier or guitar for optimal detection.",
    postureTitle: "Hand Posture Guide",
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
    enableCamMic: "Attiva Cam + Microfono",
    camError: "Accesso alla fotocamera negato. Abilita i permessi per il controllo della postura.",
    micError: "Accesso al microfono negato. L'accordatore ha bisogno del microfono per rilevare le note.",
    enablePrompt: "Per favore attiva prima la fotocamera e il microfono cliccando sul pulsante arancione per usare l'accordatore.",
    enableNow: "Attiva Ora",
    tunerOn: "ON",
    tunerOff: "OFF",
    custom: "Personalizzato",
    savePreset: "Salva Preset",
    presetNamePlaceholder: "Nome accordatura (es. Mio Drop Brutale)...",
    moreTunings: "Altre accordature...",
    awaiting: "In attesa del segnale...",
    stringLabel: "Corda",
    tunerDisabled: "Accordatore Disattivato (Clicca ON per iniziare)",
    pluckString: "Suona una corda a vuoto",
    tunerTip: "Suggerimento: avvicina il microfono del dispositivo all'amplificatore o alla chitarra per una ricezione ottimale.",
    postureTitle: "Guida alla Postura delle Mani",
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
    enableCamMic: "Activar Cam + Micrófono",
    camError: "Acceso a la cámara denegado. Habilita los permisos para la guía de postura.",
    micError: "Acceso al micrófono denegado. El afinador necesita el micrófono para escuchar.",
    enablePrompt: "Por favor, activa primero la cámara y el micrófono haciendo clic en el botón naranja superior para usar el afinador.",
    enableNow: "Activar Ahora",
    tunerOn: "ON",
    tunerOff: "OFF",
    custom: "Personalizado",
    savePreset: "Guardar",
    presetNamePlaceholder: "Nombre de afinación...",
    moreTunings: "Más afinaciones...",
    awaiting: "Esperando señal...",
    stringLabel: "Cuerda",
    tunerDisabled: "Afinador Desactivado",
    pluckString: "Toca una cuerda al aire",
    tunerTip: "Consejo: Acerca el micrófono de tu dispositivo al amplificador o a la guitarra para una mejor recepción.",
    postureTitle: "Guía de Postura de las Manos",
    leftTip1Title: "Arquea los dedos",
    leftTip1Text: "Asegúrate de que tus dedos pisen el diapasón de forma vertical para evitar silenciar cuerdas adyacentes.",
    leftTip2Title: "Posición del pulgar",
    leftTip2Text: "Mantén el pulgar detrás del mástil, a la altura del dedo corazón, para una palanca óptima.",
    leftTip3Title: "Relaja la muñeca",
    leftTip3Text: "Mantén la muñeca recta y relajada para evitar tensiones durante passaggi rapidos.",
    rightTip1Title: "Punto de apoyo",
    rightTip1Text: "Apoya suavemente el antebrazo sobre el cuerpo de la guitarra, manteniendo la muñeca flexible.",
    rightTip2Title: "Ángulo de la púa",
    rightTip2Text: "Inclina ligeramente la púa (unos 45°) respecto a le corde per ridurre la resistenza e aumentare la velocità.",
    rightTip3Title: "Movimento mínimo",
    rightTip3Text: "Realiza movimientos pequeños y controlados desde la muñeca en lugar de usar todo el brazo.",
  },
};

const BASE_PRESETS: Record<string, GuitarString[]> = {
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
  D_STANDARD: [
    { name: "D", octave: "D2", freq: 73.42 },
    { name: "G", octave: "G2", freq: 98.00 },
    { name: "C", octave: "C3", freq: 130.81 },
    { name: "F", octave: "F3", freq: 174.61 },
    { name: "A", octave: "A3", freq: 220.00 },
    { name: "D", octave: "D4", freq: 293.66 },
  ],
  EB_STANDARD: [
    { name: "Eb", octave: "Eb2", freq: 77.78 },
    { name: "Ab", octave: "Ab2", freq: 103.83 },
    { name: "Db", octave: "Db3", freq: 138.59 },
    { name: "Gb", octave: "Gb3", freq: 185.00 },
    { name: "Bb", octave: "Bb3", freq: 233.08 },
    { name: "Eb", octave: "Eb4", freq: 311.13 },
  ],
  DROP_C: [
    { name: "C", octave: "C2", freq: 65.41 },
    { name: "G", octave: "G2", freq: 98.0 },
    { name: "C", octave: "C3", freq: 130.81 },
    { name: "F", octave: "F3", freq: 174.61 },
    { name: "A", octave: "A3", freq: 220.0 },
    { name: "D", octave: "D4", freq: 293.66 },
  ],
  C_STANDARD: [
    { name: "C", octave: "C2", freq: 65.41 },
    { name: "F", octave: "F2", freq: 87.31 },
    { name: "Bb", octave: "Bb2", freq: 116.54 },
    { name: "Eb", octave: "Eb3", freq: 155.56 },
    { name: "G", octave: "G3", freq: 196.00 },
    { name: "C", octave: "C4", freq: 261.63 },
  ],
  OPEN_G: [
    { name: "D", octave: "D2", freq: 73.42 },
    { name: "G", octave: "G2", freq: 98.0 },
    { name: "D", octave: "D3", freq: 146.83 },
    { name: "G", octave: "G3", freq: 196.0 },
    { name: "B", octave: "B3", freq: 246.94 },
    { name: "D", octave: "D4", freq: 293.66 },
  ],
};

const CUSTOM_NOTE_OPTIONS = [
  { name: "C", octave: "C1", freq: 32.70 },
  { name: "Db", octave: "Db1", freq: 34.65 },
  { name: "D", octave: "D1", freq: 36.71 },
  { name: "Eb", octave: "Eb1", freq: 38.89 },
  { name: "E", octave: "E1", freq: 41.20 },
  { name: "F", octave: "F1", freq: 43.65 },
  { name: "Gb", octave: "Gb1", freq: 46.25 },
  { name: "G", octave: "G1", freq: 49.00 },
  { name: "Ab", octave: "Ab1", freq: 51.91 },
  { name: "A", octave: "A1", freq: 55.00 },
  { name: "Bb", octave: "Bb1", freq: 58.27 },
  { name: "B", octave: "B1", freq: 61.74 },
  { name: "C", octave: "C2", freq: 65.41 },
  { name: "Db", octave: "Db2", freq: 69.30 },
  { name: "D", octave: "D2", freq: 73.42 },
  { name: "Eb", octave: "Eb2", freq: 77.78 },
  { name: "E", octave: "E2", freq: 82.41 },
  { name: "F", octave: "F2", freq: 87.31 },
  { name: "Gb", octave: "Gb2", freq: 92.50 },
  { name: "G", octave: "G2", freq: 98.00 },
  { name: "Ab", octave: "Ab2", freq: 103.83 },
  { name: "A", octave: "A2", freq: 110.00 },
  { name: "Bb", octave: "Bb2", freq: 116.54 },
  { name: "B", octave: "B2", freq: 123.47 },
  { name: "C", octave: "C3", freq: 130.81 },
  { name: "Db", octave: "Db3", freq: 138.59 },
  { name: "D", octave: "D3", freq: 146.83 },
  { name: "Eb", octave: "Eb3", freq: 155.56 },
  { name: "E", octave: "E3", freq: 164.81 },
  { name: "F", octave: "F3", freq: 174.61 },
  { name: "Gb", octave: "Gb3", freq: 185.00 },
  { name: "G", octave: "G3", freq: 196.00 },
  { name: "Ab", octave: "Ab3", freq: 207.65 },
  { name: "A", octave: "A3", freq: 220.00 },
  { name: "Bb", octave: "Bb3", freq: 233.08 },
  { name: "B", octave: "B3", freq: 246.94 },
  { name: "C", octave: "C4", freq: 261.63 },
  { name: "Db", octave: "Db4", freq: 277.18 },
  { name: "D", octave: "D4", freq: 293.66 },
  { name: "Eb", octave: "Eb4", freq: 311.13 },
  { name: "E", octave: "E4", freq: 329.63 },
  { name: "F", octave: "F4", freq: 349.23 },
  { name: "Gb", octave: "Gb4", freq: 369.99 },
  { name: "G", octave: "G4", freq: 392.00 },
];

const NOTE_NAMES_CHROMATIC = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function getAdjacentNotes(currentName: string) {
  const clean = currentName.replace(/[^A-Ga-g#b]/g, "").toUpperCase();
  const idx = NOTE_NAMES_CHROMATIC.indexOf(clean);
  if (idx === -1) return { prev: "", next: "" };
  const prevIdx = (idx - 1 + 12) % 12;
  const nextIdx = (idx + 1) % 12;
  return {
    prev: NOTE_NAMES_CHROMATIC[prevIdx],
    next: NOTE_NAMES_CHROMATIC[nextIdx],
  };
}

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.015) return -1;

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [pitch, setPitch] = useState<number | null>(null);
  const [note, setNote] = useState<{ name: string; octave: string; cents: number } | null>({
    name: "E",
    octave: "E2",
    cents: 0,
  });

  const [preset, setPreset] = useState<PresetKey>("E_STANDARD");
  const [customStrings, setCustomStrings] = useState<GuitarString[]>([...BASE_PRESETS.E_STANDARD]);
  
  // STATO PER I PRESET UTENTE SALVATI IN LOCALSTORAGE
  const [savedPresets, setSavedPresets] = useState<SavedCustomPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");

  const [displayMode, setDisplayMode] = useState<"cents" | "hz">("cents");
  const [handView, setHandView] = useState<"LEFT" | "RIGHT">("LEFT");

  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<Float32Array | null>(null);

  // Carica i preset salvati al primo avvio
  useEffect(() => {
    try {
      const stored = localStorage.getItem("shred_custom_tunings");
      if (stored) {
        setSavedPresets(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Mappa completa di tutti i preset disponibili (base + custom salvati)
  const getAllPresets = (): Record<string, GuitarString[]> => {
    const all = { ...BASE_PRESETS };
    savedPresets.forEach((p) => {
      all[p.id] = p.strings;
    });
    return all;
  };

  const activeStrings = preset === "CUSTOM" ? customStrings : (getAllPresets()[preset] || BASE_PRESETS.E_STANDARD);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const triggerSilentReset = (newPreset: PresetKey) => {
    setPreset(newPreset);
    setIsDropdownOpen(false);
    const stringsMap = getAllPresets();
    const firstStr = stringsMap[newPreset]?.[0];
    if (firstStr) {
      setNote({ name: firstStr.name, octave: firstStr.octave, cents: 0 });
      smoothedCentsRef.current = 0;
    }

    if (started && tunerActive) {
      setIsResetting(true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPitch(null);
      setTimeout(() => {
        setIsResetting(false);
      }, 300);
    }
  };

  const handleCustomNoteChange = (index: number, selectedOctave: string) => {
    const found = CUSTOM_NOTE_OPTIONS.find((opt) => opt.octave === selectedOctave);
    if (!found) return;
    const updated = [...customStrings];
    updated[index] = found;
    setCustomStrings(updated);
    if (index === 0) {
      setNote({ name: found.name, octave: found.octave, cents: 0 });
      smoothedCentsRef.current = 0;
    }

    if (started && tunerActive) {
      setIsResetting(true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPitch(null);
      setTimeout(() => {
        setIsResetting(false);
      }, 300);
    }
  };

  // Funzione per salvare il Custom Tuning attuale
  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) return;
    const newId = `CUSTOM_${Date.now()}`;
    const newPreset: SavedCustomPreset = {
      id: newId,
      name: newPresetName.trim(),
      strings: [...customStrings],
    };

    const updatedList = [...savedPresets, newPreset];
    setSavedPresets(updatedList);
    try {
      localStorage.setItem("shred_custom_tunings", JSON.stringify(updatedList));
    } catch {}

    setNewPresetName("");
    setPreset(newId);
  };

  // Funzione per eliminare un preset salvato
  const handleDeleteCustomPreset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedList = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updatedList);
    try {
      localStorage.setItem("shred_custom_tunings", JSON.stringify(updatedList));
    } catch {}
    if (preset === id) {
      setPreset("E_STANDARD");
    }
  };

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
    if (!tunerActive || isResetting) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (!tunerActive) {
        setPitch(null);
        setNote(null);
      }
      smoothedCentsRef.current = 0;
    } else if (started && isAudioReady && analyserRef.current) {
      loop();
    }
  }, [tunerActive, isResetting, started, isAudioReady, preset, customStrings]);

  function loop() {
    if (!tunerActive || isResetting) return;
    const analyser = analyserRef.current,
      ctx = ctxRef.current,
      buf = bufRef.current;
    if (!analyser || !ctx || !buf) return;
    analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    const f = autoCorrelate(buf, ctx.sampleRate);
    
    if (f > 15 && f < 4000) {
      const { string, cents: rawCents } = nearestString(f, activeStrings);
      
      const prev = smoothedCentsRef.current;
      const jumpDiff = Math.abs(rawCents - prev);
      const smoothingFactor = jumpDiff > 25 ? 0.05 : 0.2;

      let smoothed = prev + (rawCents - prev) * smoothingFactor;

      if (Math.abs(smoothed) < 2.0) {
        smoothed = 0;
      }

      smoothedCentsRef.current = smoothed;

      setPitch(f);
      setNote({ name: string.name, octave: string.octave, cents: smoothed });
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

  const cents = note?.cents ?? 0;
  const inTune = Math.abs(cents) < 4;
  
  const barPos = Math.max(-50, Math.min(50, cents));
  const dotPercent = 50 + barPos;

  const formatNoteClean = (n: string) => n.replace("b", "♭").replace("#", "♯");
  const adjacent = note ? getAdjacentNotes(note.name) : { prev: "C#", next: "D#" };

  const isDropdownPreset = ["EB_STANDARD", "C_STANDARD", "OPEN_G"].includes(preset) || savedPresets.some(p => p.id === preset);

  // Trova il nome da mostrare nel menu a tendina se è attivo un preset salvato
  const getDropdownLabel = () => {
    if (["EB_STANDARD", "C_STANDARD", "OPEN_G"].includes(preset)) {
      return preset.replace("_", " ");
    }
    const foundCustom = savedPresets.find(p => p.id === preset);
    if (foundCustom) return foundCustom.name;
    return t("moreTunings");
  };

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-12 max-w-4xl mx-auto">
      {tunerActive && (
        <style font-mono>{`
          nav, [role="navigation"], .floating-menu, footer {
            display: !important;
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

      {/* TUNER PANEL - NEURAL DSP STYLE */}
      <section className="rounded-2xl border border-zinc-800 bg-[#161618] p-6 shadow-2xl text-zinc-200 select-none">
        
        {/* Top Control Bar inside Tuner */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mr-2">Tuner</span>

            {/* Pulsanti rapidi principali */}
            {(["E_STANDARD", "DROP_D", "D_STANDARD", "DROP_C"] as const).map((k) => (
              <button
                key={k}
                onClick={() => triggerSilentReset(k)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  preset === k
                    ? "bg-zinc-700 text-white shadow"
                    : "bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                {k.replace("_", " ")}
              </button>
            ))}

            {/* MENU A TENDINA PER ACCORDATURE ALTERNATIVE EXTRA + CUSTOM SALVATI */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  isDropdownPreset
                    ? "bg-zinc-700 text-white shadow"
                    : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                }`}
              >
                <span>{getDropdownLabel()}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl backdrop-blur-xl flex flex-col gap-1">
                  <button
                    onClick={() => triggerSilentReset("EB_STANDARD")}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                      preset === "EB_STANDARD" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    Eb Standard
                  </button>
                  <button
                    onClick={() => triggerSilentReset("C_STANDARD")}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                      preset === "C_STANDARD" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    C Standard
                  </button>
                  <button
                    onClick={() => triggerSilentReset("OPEN_G")}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                      preset === "OPEN_G" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    Open G
                  </button>

                  {/* Mostra eventuali preset personalizzati salvati dall'utente */}
                  {savedPresets.length > 0 && (
                    <div className="border-t border-zinc-800 my-1 pt-1">
                      <span className="px-3 text-[10px] font-bold uppercase text-zinc-500">Custom Salvati</span>
                      {savedPresets.map((p) => (
                        <div key={p.id} className="flex items-center justify-between group">
                          <button
                            onClick={() => triggerSilentReset(p.id)}
                            className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-semibold transition-all truncate ${
                              preset === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                            }`}
                          >
                            {p.name}
                          </button>
                          <button
                            onClick={(e) => handleDeleteCustomPreset(e, p.id)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Elimina"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Tuning Button */}
            <button
              onClick={() => {
                setPreset("CUSTOM");
                setIsDropdownOpen(false);
                const firstCustom = customStrings[0];
                if (firstCustom) {
                  setNote({ name: firstCustom.name, octave: firstCustom.octave, cents: 0 });
                }
                if (started && tunerActive) {
                  setIsResetting(true);
                  if (rafRef.current) cancelAnimationFrame(rafRef.current);
                  setPitch(null);
                  setTimeout(() => setIsResetting(false), 300);
                }
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                preset === "CUSTOM"
                  ? "bg-zinc-700 text-white shadow"
                  : "bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              {t("custom")}
            </button>
          </div>

          {/* ON / OFF Switch Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400">Tuner</span>
            <button
              onClick={handleToggleTuner}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                tunerActive
                  ? "bg-emerald-600 text-white shadow-[0_0_10px_rgba(52,211,153,0.4)]"
                  : "bg-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.7)] hover:bg-red-700 animate-pulse"
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              {tunerActive ? t("tunerOn") : t("tunerOff")}
            </button>
          </div>
        </div>

        {/* CUSTOM TUNING SELECTORS & SAVE PRESET BAR */}
        {preset === "CUSTOM" && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl bg-zinc-900/80 p-3 border border-zinc-800">
            <div className="grid grid-cols-6 gap-2">
              {customStrings.map((str, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">{t("stringLabel")} {6 - idx}</span>
                  <select
                    value={str.octave}
                    onChange={(e) => handleCustomNoteChange(idx, e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 text-center text-xs font-bold py-1 text-zinc-200 focus:border-emerald-500 focus:outline-none"
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

            {/* Barra di salvataggio personalizzata */}
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
              <input
                type="text"
                placeholder={t("presetNamePlaceholder")}
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={handleSaveCustomPreset}
                disabled={!newPresetName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none transition-all"
              >
                <Save className="h-3.5 w-3.5" />
                {t("savePreset")}
              </button>
            </div>
          </div>
        )}

        {/* SUGGERIMENTO MICROFONO */}
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
          <Info className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{t("tunerTip")}</span>
        </div>

        {/* MAIN VISUAL TUNER SCREEN */}
        <div className="flex flex-col items-center py-2">
          
          {/* Top Indicators & Directional Arrows */}
          <div className="w-full max-w-xl flex justify-between items-center px-4 mb-3 text-xs font-mono text-zinc-500">
            <span>-50</span>
            <span className={`font-bold transition-colors select-none ${cents < -2 ? "text-emerald-400 font-black text-2xl" : "text-zinc-600 text-xl"}`}>&gt;</span>
            <span className="text-zinc-300 font-semibold">
              {displayMode === "cents" 
                ? (cents !== 0 ? (cents > 0 ? `+${cents.toFixed(1)}` : cents.toFixed(1)) : "0.0")
                : (pitch ? `${pitch.toFixed(1)} Hz` : "0.0 Hz")}
            </span>
            <span className={`font-bold transition-colors select-none ${cents > 2 ? "text-emerald-400 font-black text-2xl" : "text-zinc-600 text-xl"}`}>&lt;</span>
            <span>+50</span>
          </div>

          {/* Central Line & Moving Ball Meter */}
          <div className="relative w-full max-w-xl h-12 flex items-center px-2">
            <div className="absolute inset-x-2 h-0.5 bg-zinc-700" />
            <div
              className="absolute -translate-x-1/2 flex items-center justify-center transition-all duration-75"
              style={{ left: `${dotPercent}%` }}
            >
              <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all shadow-lg ${
                inTune 
                  ? "border-emerald-400 bg-emerald-500 shadow-[0_0_15px_rgba(52,211,153,0.6)]" 
                  : "border-zinc-500 bg-zinc-300"
              }`}>
                <div className="h-2 w-2 rounded-full bg-zinc-900" />
              </div>
            </div>
          </div>

          {/* Notes display: Prev (small) - Main Note (Large Center) - Next (small) */}
          <div className="w-full max-w-xl flex items-center justify-between px-8 mt-6">
            <div className="w-24 text-left">
              <span className="text-xl font-bold text-zinc-500 tracking-wider">
                {formatNoteClean(adjacent.prev)}
              </span>
            </div>

            <div className="text-center">
              {tunerActive && note ? (
                <div className="font-display text-7xl font-black tracking-tight text-white drop-shadow-md">
                  {formatNoteClean(note.name)}
                </div>
              ) : (
                <div className="text-sm font-semibold text-zinc-500">
                  {!tunerActive ? t("tunerDisabled") : t("awaiting")}
                </div>
              )}
            </div>

            <div className="w-24 text-right">
              <span className="text-xl font-bold text-zinc-500 tracking-wider">
                {formatNoteClean(adjacent.next)}
              </span>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Cents/Hz switch & Reference Hz */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 mt-4 border-t border-zinc-800 text-xs">
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setDisplayMode("cents")}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                displayMode === "cents" ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              Cents
            </button>
            <button
              onClick={() => setDisplayMode("hz")}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                displayMode === "hz" ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              Hz {pitch && `(${pitch.toFixed(1)})`}
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg font-mono text-zinc-400">
            440.0 Hz
          </div>
        </div>

      </section>

      {/* POSTURE GUIDE SECTION */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-primary shrink-0" />
          <span className="uppercase tracking-wider font-display">{t("postureTitle")}</span>
        </h2>

        <div className="flex flex-col gap-3">
          {handView === "LEFT" ? (
            <>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">1.</span>
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip1Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip1Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">2.</span>
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip2Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip2Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">3.</span>
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("leftTip3Title")}: </span>
                  <span className="text-muted-foreground">{t("leftTip3Text")}</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">1.</span>
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("rightTip1Title")}: </span>
                  <span className="text-muted-foreground">{t("rightTip1Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">2.</span>
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-bold text-foreground">{t("rightTip2Title")}: </span>
                  <span className="text-muted-foreground">{t("rightTip2Text")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-4 flex items-start gap-3">
                <span className="font-bold text-primary shrink-0">3.</span>
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

export default TunerPage;