import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app';
import { AuthProvider } from './providers/auth-provider';
import { SettingsProvider } from './providers/settings-provider';
import { ToastProvider } from './providers/toast-provider';
import { UploadProvider } from './providers/upload-provider';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <UploadProvider>
              <App />
            </UploadProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
