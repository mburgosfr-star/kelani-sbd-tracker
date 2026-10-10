import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kelani.sbdtracker',
  appName: 'Kelani SBD Tracker',
  webDir: 'build',
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
  },
};

export default config;
