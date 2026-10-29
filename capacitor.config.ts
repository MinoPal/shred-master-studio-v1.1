import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.minopal.shred',
  appName: 'SHRED Studio',
  webDir: 'public',
  // Evita schermate bianche al refresh:
  server: {
    androidScheme: 'https'
  }
};

export default config;
