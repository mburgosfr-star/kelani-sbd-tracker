import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Local phone patch: force black Android system bars
if (Capacitor.isNativePlatform()) {
  document.documentElement.style.setProperty("--kelani-native-top-offset", "18px");
  StatusBar.show().catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  StatusBar.setBackgroundColor({ color: "#000000" }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => reg.unregister());
    });
  });
}
