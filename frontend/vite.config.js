import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // server: {
  //   host: true,
  //   port: 5173,
  //   strictPort: true,
  //   allowedHosts: ['gigiquotes.com', 'www.gigiquotes.com'],
  //   hmr: {
  //     host: 'gigiquotes.com',
  //     protocol: 'wss',
  //     clientPort: 443
  //   },
  //   watch: {
  //     usePolling: true,
  //   },
  //   proxy: {
  //     '/api': {
  //       target: 'http://backend:5000',
  //       // target: 'http://127.0.0.1:5000',
  //       changeOrigin: true,
  //     }
  //   }
  // }
})