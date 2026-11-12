import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.mude.cabine',
  appName: 'Cabine Mude!',
  webDir: 'dist',
  backgroundColor: '#17181c',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
