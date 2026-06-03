import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/DMS_GALLIENI_BTS/',   // ← nom EXACT du dépôt GitHub (sensible à la casse)
})
