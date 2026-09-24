import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { applyAppearance, readCachedAppearance } from './lib/theme';

// The look last used in this browser, before anything is drawn; the signed-in
// person's own is read from the server once they are known.
applyAppearance(readCachedAppearance());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
