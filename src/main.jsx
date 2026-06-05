import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// PWA : le service worker (généré par vite-plugin-pwa, registerSW.js injecté
// dans index.html) se met à jour en mode autoUpdate (skipWaiting + clientsClaim).
// Ici on recharge l'app dès qu'une NOUVELLE version prend le contrôle, pour que
// la mise à jour soit visible immédiatement au lancement (sans vider le cache).
// On ne recharge pas lors de la toute première installation (pas de contrôleur).
if ('serviceWorker' in navigator) {
  let refreshing = false
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return
    refreshing = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
