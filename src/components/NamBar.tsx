import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Zap, CheckCircle2, AlertCircle, HardDrive, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// ==========================================
// 1. LISTA MODELLI E TRADUZIONI GLOBALI
// ==========================================
const realModels = [
  { name: "800 Clean", file: "800 clean.nam" },
  { name: "Welcome To The Jungle", file: "Welcome To The Jungle.nam" },
  { name: "...And Justice For All", file: "...And Justice For All.nam" },
  { name: "Black Album", file: "Black Album.nam" },
  { name: "Master Of Puppets", file: "Master Of Puppets.nam" },
  { name: "Phantom Lord Clean", file: "Phantom Lord Clean.nam" },
  { name: "TKIMP RH v3 pos1", file: "TKIMP RH v3 pos1.nam" },
  { name: "TKIMP RH v3 pos2", file: "TKIMP RH v3 pos2.nam" },
  { name: "TKIMP RH v4 pos1", file: "TKIMP RH v4 pos1.nam" },
  { name: "TKIMP RH v4 pos2", file: "TKIMP RH v4 pos2.nam" },
  { name: "TKIMP RH v5 pos1", file: "TKIMP RH v5 pos1.nam" },
  { name: "TKIMP RH v5 pos2", file: "TKIMP RH v5 pos2.nam" },
  { name: "Vox AC15CH Crunch Normal", file: "Vox AC15CH Crunch Normal.nam" },
  { name: "Vox AC15CH Crunch TB", file: "Vox AC15CH Crunch TB.nam" },
  { name: "Vox AC15CH Crystal Clean Normal", file: "Vox AC15CH Crystal Clean Normal.nam" },
  { name: "Vox AC15CH Crystal Clean TB", file: "Vox AC15CH Crystal Clean TB.nam" },
  { name: "Vox AC15CH Edge of Breakup Normal", file: "Vox AC15CH Edge of Breakup Normal.nam" },
  { name: "Vox AC15CH Edge of Breakup TB", file: "Vox AC15CH Edge of Breakup TB.nam" },
  { name: "Vox AC15CH Overdriven Normal", file: "Vox AC15CH Overdriven Normal.nam" },
  { name: "Vox AC15CH Overdriven TB", file: "Vox AC15CH Overdriven TB.nam" },
];

const translations = {
  it: {
    standby: "In Standby",
    active: "Attivo",
    clickToOpen: "👆 CLICCA QUI PER APRIRE I CONTROLLI NAM",
    device: "Periferica",
    detecting: "Rilevamento periferiche in corso...",
    noDevice: "Nessuna periferica audio rilevata",
    audioInterface: "Interfaccia Audio In",
    ampProfile: "Profilo Testata (.nam)",
    connectGuitar: "Collega Chitarra & Avvia NAM",
    disconnectAudio: "Disconnetti Audio",
    errorAlert: "Impossibile avviare il motore NAM.",
    rescan: "Aggiorna dispositivi",
    prevModel: "Profilo precedente",
    nextModel: "Profilo successivo"
  },
  en: {
    standby: "Standby",
    active: "Active",
    clickToOpen: "👆 CLICK HERE TO OPEN NAM CONTROLS",
    device: "Device",
    detecting: "Detecting audio devices...",
    noDevice: "No audio device detected",
    audioInterface: "Audio Input Interface",
    ampProfile: "Amp Profile (.nam)",
    connectGuitar: "Connect Guitar & Start NAM",
    disconnectAudio: "Disconnect Audio",
    errorAlert: "Unable to start the NAM engine.",
    rescan: "Refresh devices",
    prevModel: "Previous profile",
    nextModel: "Next profile"
  },
  es: {
    standby: "En Espera",
    active: "Activo",
    clickToOpen: "👆 HAZ CLIC AQUÍ PARA ABRIR CONTROLES NAM",
    device: "Dispositivo",
    detecting: "Detectando dispositivos de audio...",
    noDevice: "No se detectó ningún dispositivo de audio",
    audioInterface: "Interfaz de Audio Entrante",
    ampProfile: "Perfil de Amplificador (.nam)",
    connectGuitar: "Conectar Guitarra e Iniciar NAM",
    disconnectAudio: "Desconectar Audio",
    errorAlert: "No se pudo iniciar el motor NAM.",
    rescan: "Actualizar dispositivos",
    prevModel: "Perfil anterior",
    nextModel: "Perfil siguiente"
  },
};

// ==========================================
// 2. COMPONENTE NAMBAR
// ==========================================
export function NamBar() {
  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();
  const currentLang = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";
  const t = translations[currentLang as keyof typeof translations] || translations.en;

  const [audioConnected, setAudioConnected] = useState(false);
  const [detectedDevices, setDetectedDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedModelIndex, setSelectedModelIndex] = useState<number>(0);
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string>('');
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const namNodeRef = useRef<any>(null);
  const engineRef = useRef<any>(null);

  const currentModelObj = realModels[selectedModelIndex];

  async function refreshAudioDevices(autoSelectNew = false) {
    setIsScanning(true);
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      tempStream.getTracks().forEach((track) => track.stop());

      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setDetectedDevices(inputs);

      if (inputs.length > 0) {
        const preferred = inputs.find(
          (d) =>
            d.label.toLowerCase().includes('m-audio') ||
            d.label.toLowerCase().includes('fast track') ||
            d.label.toLowerCase().includes('rig') ||
            d.label.toLowerCase().includes('scarlett') ||
            d.label.toLowerCase().includes('usb') ||
            d.label.toLowerCase().includes('line')
        );

        setSelectedDeviceId((prevId) => {
          if (autoSelectNew || !prevId || !inputs.some((d) => d.deviceId === prevId)) {
            return preferred ? preferred.deviceId : inputs[0].deviceId;
          }
          return prevId;
        });
      }
    } catch (err) {
      console.error("Errore durante la scansione dei dispositivi audio:", err);
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    refreshAudioDevices();

    const handleDeviceChange = () => {
      refreshAudioDevices(true);
    };

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      disconnectAudioLine();
    };
  }, []);

  async function connectAudioLine() {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass({ latencyHint: 'interactive' });
      if (ctx.state === "suspended") await ctx.resume();
      audioCtxRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
          latency: 0,
        },
      });
      mediaStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      setActiveDeviceLabel(track.label || "Audio Interface");

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const namModule = await import('neural-amp-modeler-wasm/engine');
      const NamEngine = namModule.NamEngine || namModule.default;

      const engine = await NamEngine.attach(ctx);
      engineRef.current = engine;

      const namNode = await engine.createNode();
      namNodeRef.current = namNode;

      sourceNode.connect(namNode);
      namNode.connect(ctx.destination);

      await loadModel(currentModelObj.file, namNode);

      setAudioConnected(true);
    } catch (err) {
      console.error("Errore connessione audio:", err);
      alert(t.errorAlert);
      disconnectAudioLine();
    }
  }

  async function loadModel(fileName: string, nodeInstance?: any) {
    const targetNode = nodeInstance || namNodeRef.current;
    if (!targetNode) return;

    try {
      const url = `/models/${encodeURIComponent(fileName)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`File non trovato`);
      
      const arrayBuffer = await res.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const modelJsonString = decoder.decode(arrayBuffer);

      await targetNode.loadModel(modelJsonString);
    } catch (err) {
      console.error("Errore caricamento modello:", err);
    }
  }

  function disconnectAudioLine() {
    if (namNodeRef.current) {
      try { namNodeRef.current.dispose(); } catch {}
      namNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    engineRef.current = null;
    setAudioConnected(false);
    setActiveDeviceLabel('');
  }

  function handlePrevModel(e: React.MouseEvent) {
    e.stopPropagation();
    const newIndex = (selectedModelIndex - 1 + realModels.length) % realModels.length;
    setSelectedModelIndex(newIndex);
    if (audioConnected) {
      loadModel(realModels[newIndex].file);
    }
  }

  function handleNextModel(e: React.MouseEvent) {
    e.stopPropagation();
    const newIndex = (selectedModelIndex + 1) % realModels.length;
    setSelectedModelIndex(newIndex);
    if (audioConnected) {
      loadModel(realModels[newIndex].file);
    }
  }

  return (
    <div className="w-full mb-4">
      <div className="rounded-2xl border border-amber-500/40 bg-neutral-900 shadow-2xl overflow-hidden transition-all duration-300">
        
        {/* Intestazione Barra */}
        <div 
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="px-4 py-3.5 bg-gradient-to-r from-neutral-900 via-neutral-900 to-amber-950/30 hover:bg-neutral-850 flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-neutral-950 font-black text-xs shadow-lg shadow-amber-500/20">
              NAM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-wider text-amber-400">SHRED NAM STUDIO</span>
                {audioConnected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> {currentModelObj.name}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/90 border border-amber-700 px-2.5 py-0.5 rounded-full animate-pulse">
                    <AlertCircle className="h-3 w-3" /> {t.standby}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-amber-200 mt-0.5 tracking-wide">
                {audioConnected ? `${t.device}: ${activeDeviceLabel}` : t.clickToOpen}
              </p>
            </div>
          </div>

          <button className="text-amber-400 hover:text-white p-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
            {isPanelOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {/* CONTENUTO DELLA TENDINA */}
        {isPanelOpen && (
          <div className="p-4 space-y-4 bg-neutral-900/95 border-t border-neutral-800 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            
            {/* Selezione Scheda Audio + Pulsante Riscansione */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-amber-500" /> {t.audioInterface}
                </label>
                <button
                  type="button"
                  onClick={() => refreshAudioDevices(true)}
                  disabled={audioConnected || isScanning}
                  title={t.rescan}
                  className="flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>{t.rescan}</span>
                </button>
              </div>

              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={audioConnected}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none cursor-pointer disabled:opacity-50"
              >
                {detectedDevices.length === 0 ? (
                  <option value="">{t.detecting}</option>
                ) : (
                  detectedDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Audio Interface (${d.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Selezione Profilo .nam con Freccette */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-amber-500" /> {t.ampProfile}
              </label>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevModel}
                  title={t.prevModel}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-white border border-neutral-700 transition-colors cursor-pointer active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <select
                  value={selectedModelIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedModelIndex(idx);
                    if (audioConnected) loadModel(realModels[idx].file);
                  }}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {realModels.map((m, idx) => (
                    <option key={m.file} value={idx}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleNextModel}
                  title={t.nextModel}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-white border border-neutral-700 transition-colors cursor-pointer active:scale-95"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Pulsante Collega / Disconnetti */}
            <div className="pt-1">
              {!audioConnected ? (
                <button
                  onClick={connectAudioLine}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-display text-sm uppercase text-neutral-950 font-black shadow-lg transition-transform active:scale-95 cursor-pointer hover:from-amber-400 hover:to-amber-500"
                >
                  <Zap className="h-4 w-4" /> {t.connectGuitar}
                </button>
              ) : (
                <button
                  onClick= {disconnectAudioLine}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 py-3 font-display text-sm uppercase text-red-400 hover:bg-red-500/20 transition-all active:scale-95 cursor-pointer"
                >
                  {t.disconnectAudio}
                </button>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default NamBar;