import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, Camera, Mic, Lock } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SHRED App" },
      { name: "description", content: "Informativa sulla privacy per l'uso di fotocamera e microfono nell'app SHRED." },
    ],
  }),
  component: PrivacyPage,
});

const translations = {
  en: {
    back: "Back to App",
    title: "Privacy Policy",
    subtitle: "Your privacy and data security are our top priority.",
    lastUpdated: "Last updated: September 2026",
    sec1Title: "1. Camera and Microphone Access",
    sec1Desc: "SHRED requests access to your camera and microphone exclusively to power the posture overlay guide and live guitar pitch detection. No video or audio is ever recorded, stored on servers, or transmitted over the internet.",
    sec2Title: "2. Real-Time Local Processing",
    sec2Desc: "All video stream and pitch detection algorithms run 100% locally on your device in real-time. Once you close or switch pages, the camera and microphone stream terminate immediately.",
    sec3Title: "3. Data Analytics & Feedback",
    sec3Desc: "If you submit voluntary feedback via Google Forms, only the information you explicitly type into the form will be collected to help improve the app experience.",
  },
  it: {
    back: "Torna all'App",
    title: "Informativa sulla Privacy",
    subtitle: "La tua privacy e la sicurezza dei tuoi dati sono la nostra massima priorità.",
    lastUpdated: "Ultimo aggiornamento: Settembre 2026",
    sec1Title: "1. Accesso a Fotocamera e Microfono",
    sec1Desc: "SHRED richiede l'accesso alla fotocamera e al microfono esclusivamente per la guida alla postura e la rilevazione dell'accordatura. Nessun video o audio viene mai registrato, salvato su server esterni o trasmesso via internet.",
    sec2Title: "2. Elaborazione Locale in Tempo Reale",
    sec2Desc: "Tutti i calcoli per l'analisi visiva e dell'accordatura avvengono al 100% in locale sul tuo dispositivo. Appena chiudi l'app o cambi scheda, il flusso di fotocamera e microfono si interrompe all'istante.",
    sec3Title: "3. Dati di Feedback",
    sec3Desc: "Se decidi spontaneamente di inviare un modulo di feedback tramite Google Forms, verranno raccolte solo ed esclusivamente le informazioni da te scritte per aiutarci a migliorare l'applicazione.",
  },
  es: {
    back: "Volver a la App",
    title: "Política de Privacidad",
    subtitle: "Tu privacidad y la seguridad de tus datos son nuestra prioridad.",
    lastUpdated: "Última actualización: Septiembre de 2026",
    sec1Title: "1. Acceso a Cámara y Micrófono",
    sec1Desc: "SHRED solicita acceso a la cámara y micrófono exclusivamente para la guía de postura y el afinador. Ningún audio o video es grabado, almacenado ni transmitido por internet.",
    sec2Title: "2. Procesamiento Local en Tiempo Real",
    sec2Desc: "El análisis de visión y afinación se realiza 100% en tu dispositivo. Al cerrar la página, la cámara y el micrófono se desactivan inmediatamente.",
    sec3Title: "3. Recopilación de Feedback",
    sec3Desc: "Si envías comentarios a través del formulario de Google Forms, solo se recibirán los datos que proporciones voluntariamente para mejorar la app.",
  },
};

function PrivacyPage() {
  const { lang, language } = useLanguage() as any;
  const rawLang = (lang || language || "en").toString().toLowerCase();
  const currentLang = rawLang.includes("it") ? "it" : rawLang.includes("es") ? "es" : "en";
  const t = translations[currentLang as keyof typeof translations] || translations.en;

  return (
    <div className="flex flex-col gap-6 px-5 pt-8 pb-12 max-w-3xl mx-auto">
      <Link to="/" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t.back}
      </Link>

      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black">{t.title}</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t.subtitle}</p>
        <p className="mt-1 text-[11px] font-mono text-muted-foreground/70">{t.lastUpdated}</p>
      </header>

      <div className="flex flex-col gap-5 text-sm leading-relaxed">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 font-bold text-base text-foreground mb-2">
            <Camera className="h-5 w-5 text-primary" />
            <Mic className="h-5 w-5 text-primary" />
            <h2>{t.sec1Title}</h2>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{t.sec1Desc}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 font-bold text-base text-foreground mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2>{t.sec2Title}</h2>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{t.sec2Desc}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-muted-foreground text-xs leading-relaxed">
            <strong className="text-foreground">{t.sec3Title}: </strong>
            {t.sec3Desc}
          </p>
        </section>
      </div>
    </div>
  );
}