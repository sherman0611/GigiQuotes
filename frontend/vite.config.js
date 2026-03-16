import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://161.35.46.239:5000',
        changeOrigin: true
      },
      '/static': {
        target: 'http://161.35.46.239:5000',
        changeOrigin: true
      },
    }
  }
})