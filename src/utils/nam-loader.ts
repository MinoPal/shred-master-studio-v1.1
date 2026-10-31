// Wrapper sicuro per caricare il motore NAM a runtime ed evitare i blocchi di Rolldown/Vite
export async function loadNamEngine(audioContext: AudioContext) {
  try {
    // Usiamo un import dinamico esplicito con ignorazione del bundler
    const moduleName = 'neural-amp-modeler-wasm';
    const namModule = await import(/* @vite-ignore */ moduleName);
    
    if (!namModule || !namModule.NamEngine) {
      throw new Error("Modulo NAM non trovato o non valido");
    }

    const engine = await namModule.NamEngine.attach(audioContext);
    return engine;
  } catch (err) {
    console.error("Errore nel caricamento dinamico del motore NAM:", err);
    throw err;
  }
}