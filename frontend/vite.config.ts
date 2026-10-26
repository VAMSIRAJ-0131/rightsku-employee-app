import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' lets the built app work inside the Android (Capacitor) package.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: './',
  // Tests only (Vitest runs in mode "test"): do not read .env files, so the
  // laptop address in VITE_API_BASE_URL is not used and API calls stay
  // relative (e.g. /api/auth/login), as the tests expect. `npm run dev` and
  // `npm run build` still read .env as before.
  envDir: mode === 'test' ? false : undefined,
  build: {
    rollupOptions: {
      output: {
        // The pdf.js reader (payslip View) ships as an .mjs file; some Android
        // web views don't serve ".mjs" as JavaScript, so it is named ".js".
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    // Development only: forward /api calls to the Spring Boot backend, so the
    // browser sees one origin and no CORS setup is needed.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
}))
