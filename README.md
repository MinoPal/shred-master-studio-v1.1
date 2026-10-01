# Shred Master Studio

Crea una Web-App (Single Page Application) responsiva per smartphone dedicata a chitarristi rock e metal. 

Il design deve essere "Dark Mode" di default, con un'estetica aggressiva e moderna (usa colori come nero profondo, grigio scuro, dettagli in rosso neon o arancione, font accattivanti). 

La web-app deve contenere una barra di navigazione inferiore con 3 sezioni principali:

1. SCHERMATA "ALLENAMENTO" (Metronomo Progressivo):

- Inserisci un metronomo visivo e acustico.

- L'utente deve poter impostare i BPM di partenza con un selettore.

- Includi una funzione "Modalità Speed Tracker": un bottone che, se attivo, aumenta automaticamente il metronomo di +2 BPM ogni 4 misure (ipotizzando un tempo di 4/4), mostrando a schermo un grafico o un contatore dei BPM attuali raggiunti.

2. SCHERMATA "RIFFS" (Libreria in stile AC/DC):

- Crea una lista con 3 riff originali dai nomi fittizi che richiamano lo stile Hard Rock (es. "Thunder Riff", "Highway To Rock", "Back in Metal").

- Per ogni riff, mostra a schermo una tablatura schematica molto semplice (es. indicando le corde e i tasti da premere come Mi minore, Re, La).

- Inserisci un player audio finto (un tasto Play) che riproduce un suono di chitarra rock distorto (usa un oscillatore sintetizzato o una traccia audio di libreria se possibile) per far sentire il ritmo all'utente.

3. SCHERMATA "FOTOCAMERA & AUDIO" (Il prototipo di controllo):

- Questa è la schermata core per il nostro test. Richiedi l'accesso al microfono dello smartphone e alla fotocamera frontale.

- Nella parte alta, mostra lo streaming video della fotocamera frontale (l'utente deve potersi vedere mentre tiene la chitarra). Sovrapponi al video una griglia grafica fissa o delle linee guida colorate con la scritta: "Allinea il manico e la mano qui per il controllo della postura".

- Nella parte bassa, implementa un sistema di "Audio Pitch Detection" in tempo reale usando una libreria JavaScript leggera (come Pitchfinder o l'API Web Audio nativa). L'app deve ascoltare dal microfono e mostrare a schermo, con un testo grande e un indicatore colorato, la nota che l'utente sta suonando (concentrati sul riconoscere almeno le note delle corde a vuoto: MI, LA, RE, SOL, SI, MI). Se la nota è calante o crescente, mostra una barra colorata (verde se centrata, rossa se errata).

Rendi il tutto estremamente fluido, scannabile e con un linguaggio che parli di "Gain", "Shred" e "Riff".

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/53454419-4ddc-426b-9ca6-abe7003f5ec7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
