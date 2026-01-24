import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import App from './App';
import './styles.css';

// Register service worker for thumbnail caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use absolute path from base URL to ensure correct registration
    const swPath = new URL('./sw.js', window.location.href).href;
    navigator.serviceWorker
      .register(swPath)
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((err) => {
        console.log('SW registration failed:', err);
      });
  });
}

// Match cccbib's simple setup exactly
const container = document.getElementById('app');
const root = createRoot(container);

// Custom theme for TV viewing - larger fonts for readability (+30%)
const tvTheme = {
  colorScheme: 'dark',
  primaryColor: 'pink',
  fontSizes: {
    xs: '1.45rem',
    sm: '1.65rem',
    md: '1.85rem',
    lg: '2.1rem',
    xl: '2.5rem',
  },
  headings: {
    sizes: {
      h1: { fontSize: '3.4rem' },
      h2: { fontSize: '2.9rem' },
      h3: { fontSize: '2.5rem' },
      h4: { fontSize: '2.1rem' },
    },
  },
};

root.render(
  <MantineProvider theme={tvTheme}>
    <HashRouter>
      <App />
    </HashRouter>
  </MantineProvider>
);
