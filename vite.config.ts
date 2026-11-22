import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sirve el sitio en /<repo>/ → el workflow define BASE_PATH
  base: process.env.BASE_PATH ?? '/',
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 4000 },
  // los assets de tldraw (fuentes/íconos/traducciones) se importan con ?url:
  // no hay que pre-empaquetarlos o Vite pierde las URLs
  optimizeDeps: { exclude: ['@tldraw/assets'] },
})
