import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/mafia-game/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
})
