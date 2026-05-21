import React from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
