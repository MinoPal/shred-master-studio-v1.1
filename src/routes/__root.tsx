import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Flame, Music2, Mic } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { LanguageProvider } from "../context/LanguageContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { NamBar } from "../components/NamBar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0505" },
      { title: "SHRED — Rock & Metal Guitar Trainer" },
      { name: "description", content: "Progressive metronome, hard rock riffs and pitch detection tuner. Crank the gain and shred." },
      { property: "og:title", content: "SHRED — Rock & Metal Guitar Trainer" },
      { property: "og:description", content: "Progressive metronome, riff library and real-time tuner for rock and metal guitarists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col pb-24 px-4 pt-2">
          {/* Header superiore */}
          <header className="flex items-center justify-between py-2 border-b border-border/30 mb-4">
            <span className="font-bold text-xs tracking-wider text-muted-foreground uppercase">Shred Studio</span>
            <LanguageSelector />
          </header>

          {/* Barra del DSP Neurale (SHRED NAM STUDIO) persistente su tutte le pagine */}
          <NamBar />

          <Outlet />
        </div>
        <BottomNav />
      </LanguageProvider>
    </QueryClientProvider>
  );
}

function BottomNav() {
  const items = [
    { to: "/", label: "Training", icon: Flame },
    { to: "/riffs", label: "Riffs", icon: Music2 },
    { to: "/tuner", label: "Cam & Tuner", icon: Mic },
  ] as const;

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/70 bg-background/90 shadow-ember backdrop-blur-xl transition-all duration-300"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch gap-1 px-2 py-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="group flex min-w-[84px] flex-col items-center gap-0.5 rounded-full px-2 py-2 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors"
            activeProps={{ className: "text-primary bg-primary/10" }}
          >
            <Icon className="h-5 w-5 transition-transform group-hover:scale-110" strokeWidth={2.2} />
            <span className="whitespace-nowrap leading-none">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}