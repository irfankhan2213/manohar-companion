import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';
import './styles/tokens.css';
import './styles/base.css';
import './i18n/index.js';

// Route standard window.print() through AndroidBridge when running inside the Android Companion App
if (typeof window !== 'undefined') {
  const origPrint = window.print;
  window.print = function () {
    const androidBridge = (window as any).AndroidBridge;
    if (androidBridge && typeof androidBridge.print === 'function') {
      androidBridge.print();
    } else if (origPrint) {
      origPrint.call(window);
    }
  };
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
