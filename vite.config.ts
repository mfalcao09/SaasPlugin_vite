import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import apiDev from './src/server/api-dev.mjs'

// O plugin apiDev expõe /api/* no dev server. Em produção essas rotas viram
// Edge Functions do Supabase (PRD §7.2) — mesma lógica, outro transporte.
export default defineConfig({
  plugins: [react(), apiDev()],
})
