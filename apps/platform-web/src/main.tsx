import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/skills-hub">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
