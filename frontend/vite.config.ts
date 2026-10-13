import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' lets the built app work inside the Android (Capacitor) package.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
})
