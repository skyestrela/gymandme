import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import { useStore } from './store/useStore.js'
import { startMediaSync } from './lib/media-sync.js'
import { startNativeKeyboard } from './lib/native-keyboard.js'
import './index.css'

// App.jsx restores per-route scroll itself; the browser's own attempt races it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// The photos and videos of custom exercises, in every build (the phone and the demo included):
// uploads of what the server lacks, the local clean-up, and the plan's files kept offline.
startMediaSync(useStore)

// Android 15 does not resize the page for the soft keyboard; the app says how much it covers and
// this keeps the focused field above it. Idle everywhere else.
startNativeKeyboard()

// Against the dev server the offline worker is not merely unwanted, it is harmful. Its cache is
// named 'opengym-rt-__BUILD__' and the hash is stamped only by a real build, so in dev that name
// never changes and the cache the worker falls back to is whatever the last session left behind.
// Its fetch is network-first, but only for 3 s (NET_WAIT_MS in public/sw.js): a dev server slower
// than that under load is answered from that old cache, so a reload keeps serving yesterday's app
// and the change you just made never reaches the page. So dev unregisters whatever is installed
// and drops the app-shell cache with it. opengym-device holds the device id and opengym-media-v1
// the offline media; neither is the code that just changed, so a dev reload costs neither.
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations?.()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {})
  }
  if (window.caches) {
    caches.keys()
      .then(ks => ks.filter(k => k.startsWith('opengym-rt-')).forEach(k => caches.delete(k)))
      .catch(() => {})
  }
} else if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  // Not in the mobile build: the native shell already serves everything from disk.
  navigator.serviceWorker.register('sw.js').catch(() => {})
  // The plan's exercise media, kept by the worker for a workout opened without a network (#281).
  // It only fetches ahead while the page runs as the installed app; a tab keeps what it has shown.
  import('./lib/media-prefetch.js').then(m => m.startMediaPrefetch(useStore)).catch(() => {})
}
