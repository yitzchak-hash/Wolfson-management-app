import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Navigation must be URGENT — the dead-buttons fix.
 *
 * react-router v7 wraps every navigation state update in
 * `React.startTransition` (no opt-out), and a transition render is restarted
 * by any urgent update. This app ticks every second (countdown widgets, wall
 * clocks, presence), so on a slow machine the router's render never finishes:
 * the URL changes and the screen does not — the office's dead sidebar and the
 * TV bar's dead buttons. This plugin points react-router's OWN imports of
 * 'react' at a shim whose startTransition runs inline, restoring v6's
 * synchronous navigation. Everything else in the app gets the real React.
 *
 * See src/shims/react-inline-transition.ts for the full story.
 */
function routerUrgentNav(): Plugin {
  // A .js file on purpose: @types/react is an `export =` module, which tsc
  // refuses to `export *` from — and no app code imports this, only the
  // bundler injects it, so it has no business inside the typecheck.
  const shim = path.resolve(here, 'src/shims/react-inline-transition.js')
  return {
    name: 'router-urgent-nav',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'react' && importer && importer.includes('react-router')) return shim
    },
  }
}

export default defineConfig({
  plugins: [routerUrgentNav(), react()],
  optimizeDeps: {
    // Pre-bundled deps resolve their imports at prebundle time, past every
    // plugin — react-router must be served as source or the shim above never
    // sees its 'react' imports in dev (the build always goes through it).
    exclude: ['react-router', 'react-router-dom'],
    // …but its own CJS sub-dependencies still need the prebundle's ESM
    // interop, or `import { parse } from 'cookie'` throws in dev.
    include: ['react-router > cookie', 'react-router > set-cookie-parser'],
  },
})
