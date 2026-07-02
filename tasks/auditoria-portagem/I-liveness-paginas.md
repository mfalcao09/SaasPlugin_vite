# Dossiê I — Liveness página-a-página: Bizon Sales (lovable `0cbaf443`) × Módulo Vendas (`gestao.*`)

> **2026-07-02.** Varredura visual COMPLETA, tela a tela, dos dois lados. Modelo navegado autenticado via preview standalone (`id-preview--…lovable.app`, auto-login do lovable) com endereçamento direto `?tab=<seção>` (descoberto em `Admin.tsx:174-175`); port navegado logado em `gestao.nexvybeauty.com.br`. **48 telas do modelo** (40 `/admin` + 8 `/super-admin`) e **32 do port** examinadas.

## Tabela página-a-página (`/admin` modelo × Módulo Vendas port)

| # | Seção (`?tab=`) | Modelo (Bizon) | Port (gestao) | Veredito |
|---|---|---|---|---|
| 1 | dashboard | Central de Operação, 7 KPIs, Prioridades/Performance/Radar IA, Operação em Tempo Real | idem (com dados reais) | ✅ 1:1 |
| 2 | mia | Briefing + **5 abas** (Conversar/Contexto/Pendências/Comunicações/**Memória**) + "prepara ações e aguarda confirmação" + Wake word | Briefing (com recomendações reais) + **2 abas** (Conversar/Contexto) | ⚠️ port sem Pendências/Comunicações/Memória/ação (E) |
| 3 | pipeline | **Por produto** ("crie um produto para gerenciar seu pipeline") | **Único global** com KPIs+etapas (dados reais) | ⚠️ decisão estrutural (F) — validar |
| 4 | leads | Central de Leads, 6 abas: Todos/Minha Carteira/Sem Atendimento/**Por Squad**/**Por Produto** | Gestão de Leads, 4 abas: Todos/Minha Carteira/**Meu Squad**/Sem Atendimento | ⚠️ falta visão gerencial Por Squad; Por Produto=drop-ok (F) |
| 5 | calendar | Agenda & Agendamentos, 5 abas + Google Calendar | idem | ✅ 1:1 |
| 6 | inbox-chat | Central de Atendimento (ATENDENDO/AGENTES/EM FILA + 3 dicas) | idem (conversa real) | ✅ 1:1 |
| 7 | inbox-panel | Painel de Atendimentos (FILA/AGENTES IA/HUMANOS, realtime) | idem (atendente real) | ✅ 1:1 |
| 8 | inbox-radar | Radar IA (Rodar Análise/Agendamentos/Histórico + filtros) | idem | ✅ 1:1 |
| 9 | inbox-followup | Follow-ups (6 KPIs + 3 gráficos) | idem | ✅ 1:1 |
| 10 | inbox-reports | Atendimentos (KPIs + Status + Desempenho) | idem (dados reais) | ✅ 1:1 |
| 11 | agents | Agentes de IA: **Hierarquia/Lista** + Supervisor + Importar; "globais e por produto (Orquestrador/Suporte/SDR/Closer)" | Agentes de IA: Supervisor + Importar + Criar presentes; **sem toggle Hierarquia/Lista**, sem vínculo por-produto | ⚠️ superfície ~80%; profundidade do editor = gap (E) |
| 12 | campaigns | Campanhas Inteligentes, **4 abas** (+Biblioteca de Contextos+**Throughput**) | **3 abas** (sem Throughput) | ⚠️ falta aba Throughput |
| 13 | cadences | Cadências Inteligentes, **4 abas** (+**Biblioteca de Contextos**+API) | **3 abas** (sem Biblioteca de Contextos; API presente=shell) | ⚠️ falta Biblioteca; API shell (G) |
| 14 | webhooks | Webhooks (contador Requisições/mês + busca) | idem | ✅ 1:1 (painéis internos Actions/Requests = gap H) |
| 15 | capture-channels | (fallback → dashboard; é só header de grupo) | port tem manager próprio "Captação" (Funis/Formulários/Widgets) | ➕ port organiza melhor |
| 16 | capture-quiz | Quiz (busca+filtro produto) | Quiz → abre manager Captação/Funis com filtro Quiz | 🔸 consolidado (B) |
| 17 | capture-forms | Formulários (tela dedicada) | **cai na aba Funis** (não troca pra Formulários) | 🐞 bug pequeno de aba inicial |
| 18 | capture-seller-form | Form Vendedores (campos padrão+personalizados) | idem 1:1 (ampliado) | ✅ 1:1 |
| 19 | capture-chatbot | ChatBot (fluxos conversacionais dedicado) | consolidado no manager | 🔸 consolidado (B) |
| 20 | capture-widget | Widget de Site (snippet `<script>`) | consolidado no manager (aba Widgets) | 🔸 consolidado (B) |
| 21 | capture-whatsapp | WhatsApp (fluxos 1ª msg Evolution) | idem 1:1 + **banner honesto "canal não conectado — ativa quando plugar"** | ✅ 1:1 (banner = transparência do TODO-canal) |
| 22 | capture-templates | **Templates de Quiz — galeria rica** (8 categorias, cards com tempo/perguntas) | item Templates existe (não-eyeballed; code-audit B = seções próprias) | 🔸 conferir profundidade da galeria |
| 23 | capture-results | Resultados (dado-dependente; rendeu vazio no preview) | item Resultados existe (não-eyeballed) | 🔸 |
| 24 | capture-analytics | Analytics de Captação (4 KPIs + 2 gráficos) | idem 1:1 | ✅ 1:1 |
| 25 | products | Negócios (catálogo próprio de negócios/serviços) | **Planos** (PlansManager: Trial/Essencial/Premium/Ultra c/ limites) | 🔁 decisão Marcelo (A): Negócios→planos do ERP |
| 26 | sectors | tela em branco no preview | Setores (filas de atendimento) renderiza | ➕ port renderiza melhor |
| 27 | team | Equipe (busca+filtros perfis/squads/produtos) | Equipes com **abas Usuários/Squads** | ✅ equivalente (port organiza em abas) |
| 28 | operation | → mesma Central de Operação | idem | ✅ 1:1 |
| 29 | financial | **Dashboard Financeiro**: 4 KPIs de vendas/comissões + abas Pendentes/Aprovadas/Negócios (aprovar p/ liberar pagamento) | **Só Comissões (Regras/Comissões) + Metas** — sem dashboard de aprovação | ⚠️ gap confirmado (H #3) |
| 30 | payments | Pagamentos (5 abas; Cakto/Doppus; pedidos) | — (mapeado ERP) | 🔁 ERP by design |
| 31 | connections | **Suas Conexões** (3 canais; badge "0/1 usadas") | idem 1:1 (sem gate de limite — removido de propósito) + instância real `nexvy-operacao-vendas`+QR | ✅ 1:1 |
| 32 | integrations | Integrações (catálogo 32 em 7 categorias: IA/Pagamentos/Email/Agenda/Mkt/ERP/Ferramentas) | — (mapeado ERP) | 🔁 ERP by design |
| 33 | quick-replies | Respostas Rápidas ({{nome}}/{{produto}}) | idem 1:1 | ✅ 1:1 |
| 34 | custom-fields | Campos Personalizados | idem 1:1 | ✅ 1:1 |
| 35 | tags | Etiquetas (Catálogo/Automações) | idem 1:1 | ✅ 1:1 |
| 36 | notifications | Central de Notificações (Manual/Automáticas + 3 KPIs + histórico) | idem 1:1 | ✅ 1:1 |
| 37 | schedules | Horários de funcionamento (agenda semanal + fuso + "Agora: Aberto") | idem 1:1 | ✅ 1:1 |
| 38 | company | Empresa (dados fiscais/logo/endereço) | — (mapeado ERP) | 🔁 ERP by design |
| 39 | plan | Escolha seu Plano (mensal/anual) | — (mapeado ERP) | 🔁 ERP by design |
| 40 | support | Suporte (chamados) | — (mapeado ERP) | 🔁 ERP by design |

**+ Agenda profunda (capturada antes no port):** Reuniões/Tipos de Evento (editor c/ aba Notificações+preview WhatsApp)/Disponibilidade/Links da Equipe = ✅ 1:1 com A.

## `/super-admin` do modelo (8 telas — análogo do Módulo ERP)

Dashboard (MRR/ARR/Deals/Leads/Saúde) · Empresas (Ver/Editar/**Implantação**/Suspender) · Usuários (KPIs+tabela) · Planos (catálogo c/ limites usuários/conexões/IA) · **IA da Plataforma** (chaves por provedor + roteador) · **Consumo de IA** (tokens/custo por empresa) · Assinaturas · Faturamento (MRR/recebido/pendente/faturas).
→ Insumo pro **Módulo ERP** (sessão conjunta): o modelo tem IA-da-Plataforma/Consumo/Implantação que nosso ERP ainda não tem.

## Consolidado

- **✅ 1:1 pixel-perfeito (estrutura):** 19 telas — Dashboard, Agenda(+4 abas booking), Chat, Painel, Radar, Follow-Up, Relatórios, Webhooks, Form Vendedores, WhatsApp, Analytics, Conexões, Respostas, Campos, Etiquetas, Notificações, Horários, Central de Operação, Equipes.
- **⚠️ Deltas reais confirmados no olho:** Mia (2/5 abas, read-only), Pipeline (único×por-produto), Leads (sem Por Squad gerencial), Agentes (sem Hierarquia/por-produto; profundidade), Campanhas (sem Throughput), Cadências (sem Biblioteca de Contextos), Financeiro (sem dashboard de aprovação).
- **🐞 Bug pequeno:** menu "Formulários" da Captação cai na aba Funis.
- **🔁 By design:** products→Planos (decisão Marcelo), payments/integrations/company/plan/support→ERP.
- **🔸 Consolidação:** Quiz/ChatBot/Widget/Formulários = 1 manager com abas (modelo = telas dedicadas); Templates/Resultados port não-eyeballed (code-audit B cobre).
- **➕ Port melhor:** Setores renderiza (modelo em branco), banner de canal honesto, Equipes com abas, dados reais em tudo.
- **Único delta puramente visual:** tema verde-escuro (modelo) × rosa-claro (port, herdado do tenant beauty).
