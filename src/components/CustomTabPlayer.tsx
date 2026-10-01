import { useEffect, useRef, useState, ChangeEvent } from "react";
import { Play, Pause, Square, Upload, Loader2, ChevronDown } from "lucide-react";
import * as alphaTab from "@coderline/alphatab";
import { useLanguage } from "../context/LanguageContext";
//import workerUrl from '@coderline/alphatab/dist/alphaTab.worker.mjs?url';

const translations = {
  en: {
    back: "Back",
    playerStudio: "/ Studio Player",
    defaultTitle: "Custom Tab Player",
    openBtn: "Open File",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    instrument: "Instrument / Track:",
    speed: "Speed:",
    noFileTitle: "No file selected",
    noFileDesc: 'Click "Open File" in the top right to load your file (.gp, .gp3, .gp4, .gp5, .gpx) and start practicing.',
    errorRead: "Error reading local file.",
    errorTab: "Error reading the score.",
    errorInit: "Unable to initialize AlphaTab engine.",
  },
  it: {
    back: "Torna indietro",
    playerStudio: "/ Studio Player",
    defaultTitle: "Player Tab Personalizzata",
    openBtn: "Apri File",
    play: "Play",
    pause: "Pausa",
    stop: "Stop",
    instrument: "Strumento / Traccia:",
    speed: "Velocità:",
    noFileTitle: "Nessun file selezionato",
    noFileDesc: 'Clicca su "Apri File" in alto a destra per caricare il tuo file (.gp, .gp3, .gp4, .gp5, .gpx) e iniziare a esercitarti.',
    errorRead: "Errore nella lettura del file locale.",
    errorTab: "Errore durante la lettura dello spartito.",
    errorInit: "Impossibile inizializzare il motore di AlphaTab.",
  },
  es: {
    back: "Volver",
    playerStudio: "/ Studio Player",
    defaultTitle: "Reproductor de Tab Personalizada",
    openBtn: "Abrir Archivo",
    play: "Reproducir",
    pause: "Pausa",
    stop: "Detener",
    instrument: "Instrumento / Pista:",
    speed: "Velocidad:",
    noFileTitle: "Ningún archivo seleccionado",
    noFileDesc: 'Haz clic en "Abrir Archivo" arriba a la derecha para cargar tu archivo (.gp, .gp3, .gp4, .gp5, .gpx) y empezar a practicar.',
    errorRead: "Error al leer el archivo local.",
    errorTab: "Error al leer la partitura.",
    errorInit: "No se pudo inicializar el motor AlphaTab.",
  },
};

export default function CustomTabPlayer() {
  const context = useLanguage() as any;

  // Leggiamo la lingua salvata nel contesto o nel localStorage
  const activeLang = 
    context?.language || 
    context?.lang || 
    localStorage.getItem("app_lang") || 
    localStorage.getItem("language") || 
    "it";

  const rawLang = activeLang.toString().toLowerCase();

  const currentLang: "it" | "es" | "en" = rawLang.includes("it") 
    ? "it" 
    : rawLang.includes("es") 
    ? "es" 
    : "en";

  const t = translations[currentLang];

  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [showUploadBtn, setShowUploadBtn] = useState(true);

  // Mantiene il localStorage sincronizzato con la lingua corrente
  useEffect(() => {
    localStorage.setItem("app_lang", currentLang);
    localStorage.setItem("language", currentLang);
  }, [currentLang]);

  useEffect(() => {
    if (!hostRef.current || !scrollRef.current) return;

try {
  const api = new alphaTab.AlphaTabApi(hostRef.current, {
    core: {
      fontDirectory: "/alphatab/font/",
      scriptFile: "/alphatab/alphaTab.core.mjs",
      workerFile: "/alphatab/alphaTab.worker.mjs",
    },
    display: { 
      scale: 0.85, 
      layoutMode: alphaTab.LayoutMode.Page,
      padding: [30, 10, 20, 10],
    },
    player: {
    enablePlayer: true,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableElementHighlighting: true,
    enableUserInteraction: true,
    scrollElement: scrollRef.current,
    scrollMode: alphaTab.ScrollMode.Continuous, 
    soundFont: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2",
  },
});

      apiRef.current = api;

      api.scoreLoaded.on((score: any) => {
        if (score && score.tracks) {
          setTracks(score.tracks);

          let defaultIndex = score.tracks.findIndex((tr: any) => {
            const name = (tr.name || "").toLowerCase();
            return (
              name.includes("guitar") ||
              name.includes("chitarra") ||
              name.includes("lead") ||
              name.includes("solo") ||
              name.includes("rhythm")
            );
          });

          if (defaultIndex === -1) {
            defaultIndex = score.tracks.findIndex((tr: any) => !tr.isPercussion);
          }
          if (defaultIndex === -1) defaultIndex = 0;

          setSelectedTrackIndex(defaultIndex);
          api.renderTracks([score.tracks[defaultIndex]]);
        }
        setReady(true);
      });

      api.playerStateChanged.on((e: any) => {
        setPlaying(e.state === 1);
        if (e.state === 0 && api.timePosition === 0) {
          if (scrollRef.current) scrollRef.current.scrollTop = 0;
        }
      });

      api.error.on((err: any) => {
        console.warn("AlphaTab Warning:", err);
      });
    } catch (err) {
      console.error("Critical AlphaTab Init Error:", err);
      setError(t.errorInit);
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.destroy();
        apiRef.current = null;
      }
    };
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !apiRef.current) return;

    setError(null);
    setReady(false);
    setFileName(file.name);
    setShowUploadBtn(false); 

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        apiRef.current.load(new Uint8Array(evt.target.result));
      }
    };
    reader.onerror = () => setError(t.errorRead);
    reader.readAsArrayBuffer(file);
  };

  const togglePlayPause = () => {
    if (apiRef.current) apiRef.current.playPause();
  };

  const handleStop = () => {
    if (apiRef.current) {
      apiRef.current.stop();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setShowUploadBtn(true); 
    }
  };

  const handleTrackChange = (index: number) => {
    setSelectedTrackIndex(index);
    if (apiRef.current && apiRef.current.score?.tracks[index]) {
      apiRef.current.renderTracks([apiRef.current.score.tracks[index]]);
    }
  };

  const handleSpeedChange = (v: number) => {
    setSpeed(v);
    if (apiRef.current) apiRef.current.playbackSpeed = v;
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between gap-4 shrink-0 min-h-[72px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{t.playerStudio}</p>
            <h1 className="font-display text-xl sm:text-2xl uppercase text-foreground truncate">
              {fileName ?? t.defaultTitle}
            </h1>
          </div>
        </div>

        <div className="shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.gpif"
            onChange={handleFileChange}
            className="hidden"
          />
          {showUploadBtn && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-2xl bg-fire px-4 py-2 text-xs font-bold uppercase text-primary-foreground shadow-neon active:scale-95 transition-transform cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">{t.openBtn}</span>
            </button>
          )}
        </div>
      </header>

      {/* CONTROLLI AUDIO E TRACCE */}
      <div className="border-b border-border bg-card/60 px-4 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayPause}
            disabled={!ready || !fileName}
            className="flex items-center gap-2 rounded-xl bg-fire px-5 py-2 text-xs font-bold uppercase text-primary-foreground shadow-neon active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            {!ready && fileName ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>{playing ? t.pause : t.play}</span>
          </button>

          <button
            onClick={handleStop}
            disabled={!ready || !fileName}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>

        {tracks.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-foreground">{t.instrument}</span>
            <div className="relative">
              <select
                value={selectedTrackIndex}
                onChange={(e) => handleTrackChange(Number(e.target.value))}
                className="rounded-xl border border-border bg-background px-4 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:border-primary appearance-none pr-8 cursor-pointer max-w-[150px] truncate"
              >
                {tracks.map((track, idx) => (
                  <option key={idx} value={idx}>
                    {track.name || `Traccia ${idx + 1}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground pointer-events-none" />
            </div>
          </div>
        )}

        {ready && fileName && (
          <div className="flex items-center gap-3 text-xs font-bold uppercase text-foreground">
            <span>{t.speed}</span>
            <input
              type="range"
              min={0.5}
              max={1.25}
              step={0.05}
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="h-1 w-20 sm:w-28 accent-[hsl(var(--primary))]"
            />
            <span className="tabular-nums text-primary w-10">{Math.round(speed * 100)}%</span>
          </div>
        )}
      </div>

      {/* AREA SPARTITO */}
      <main className="flex-1 bg-white relative flex flex-col min-h-0">
        {!fileName && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-center p-6 z-10">
            <Upload className="h-12 w-12 text-black/70 mb-3 animate-bounce" />
            <h2 className="font-display text-2xl uppercase text-black font-extrabold tracking-wide">
              {t.noFileTitle}
            </h2>
            <p className="text-sm font-semibold text-black max-w-md mt-2">
              {t.noFileDesc}
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-destructive text-sm font-bold uppercase z-20 bg-white">
            {error}
          </div>
        )}

        <div 
          ref={scrollRef} 
          className="absolute inset-0 overflow-y-auto overflow-x-hidden px-2 pb-28 bg-white flex justify-center"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}
        >
          <div ref={hostRef} className="w-full max-w-[500px]" />
        </div>
      </main>
    </div>
  );
}