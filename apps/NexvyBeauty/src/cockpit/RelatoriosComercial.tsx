// Relatórios (comercial/atendimento) — extraído da aba "Relatórios" do Conversas.
// WebChatReportsTab traz: Total de Conversas, Aguardando, Tempo Médio de Resposta,
// Resolvido pelo Bot + Distribuição por Status. (Métricas extras — tempo de atendimento
// e tempo até fechamento — entram numa próxima leva de enriquecimento.)
import { WebChatReportsTab } from '@/components/admin/webchat/WebChatReportsTab'

export default function RelatoriosComercial() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Relatórios do atendimento comercial</p>
      </div>
      <WebChatReportsTab />
    </div>
  )
}
