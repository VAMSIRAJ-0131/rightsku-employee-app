import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' lets the built app work inside the Android (Capacitor) package.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
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
})
