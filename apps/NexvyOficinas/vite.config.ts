import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs'],
  },
  build: {
    // Raise warning threshold slightly — any remaining chunk above this is genuinely large
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Split node_modules into stable, cacheable vendor chunks.
         * Groups by "change frequency family" so a supabase upgrade doesn't
         * bust the react bundle cache, and vice-versa.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Extract package name — handles scoped (@supabase/supabase-js) and
          // unscoped (lucide-react) packages correctly
          const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
          if (!match) return
          const pkg = match[1]

          // ── React core ──────────────────────────────────────────────────
          // Dependency chain that must all live in the same chunk to avoid cycles:
          //   react-router-dom → react-router → @remix-run/router → (none)
          //   react-router-dom → react-router → react (peer)
          // @hookform/resolvers excluded: it imports zod which is in vendor-misc
          if (
            ['react', 'react-dom', 'scheduler', 'react-router-dom',
             'react-router', '@remix-run/router', 'react-hook-form'].includes(pkg)
          ) return 'vendor-react'

          // ── Supabase client ─────────────────────────────────────────────
          if (pkg.startsWith('@supabase/')) return 'vendor-supabase'

          // ── Icon library ────────────────────────────────────────────────
          if (pkg === 'lucide-react') return 'vendor-icons'

          // ── Radix UI primitives (30+ packages) ──────────────────────────
          if (pkg.startsWith('@radix-ui/')) return 'vendor-radix'

          // ── TanStack (React Query) ───────────────────────────────────────
          if (pkg.startsWith('@tanstack/')) return 'vendor-query'

          // ── Animation ───────────────────────────────────────────────────
          if (pkg === 'framer-motion') return 'vendor-motion'

          // ── Charts ──────────────────────────────────────────────────────
          if (pkg === 'recharts') return 'vendor-charts'

          // ── 3D / WebGL ───────────────────────────────────────────────────
          if (pkg === 'three') return 'vendor-3d'

          // ── PDF generation ───────────────────────────────────────────────
          if (['jspdf', 'html2canvas'].includes(pkg)) return 'vendor-pdf'

          // ── Payments ─────────────────────────────────────────────────────
          if (pkg.startsWith('@stripe/')) return 'vendor-stripe'

          // ── Everything else in node_modules ──────────────────────────────
          return 'vendor-misc'
        },
      },
    },
  },
})
