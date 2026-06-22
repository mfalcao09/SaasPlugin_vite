import Dashboard from './Dashboard'
import { DEMO_DASHBOARD } from './demo-seed'

// Rota /demo/salao (pública, sem auth): renderiza o Dashboard real em modo
// demonstração com dados-seed. Primeira das rotas demo.* (estilo beauty-flow).
export default function DemoDashboard() {
  return <Dashboard demo={DEMO_DASHBOARD} />
}
