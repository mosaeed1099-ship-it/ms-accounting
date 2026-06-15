import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startSocket } from './core/realtime/socket'
import { startSyncEngine } from './core/offline/sync'
import { attachInterceptors } from './core/api/interceptors'

// Boot core systems
attachInterceptors()
startSyncEngine()
if (localStorage.getItem('token')) startSocket()

// Re-start socket after login
window.addEventListener('ms:auth:login', () => startSocket())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
