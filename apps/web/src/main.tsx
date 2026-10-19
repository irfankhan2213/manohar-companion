import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';
import './styles/tokens.css';
import './styles/base.css';
import './i18n/index.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
