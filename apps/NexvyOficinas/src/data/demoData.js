// AutoFlow AI — Dados Demo Realistas
export const demoEmpresa = {
  nome: "Auto Center Supremo",
  slogan: "Excelência em manutenção automotiva",
  telefone: "(11) 99234-5678",
  email: "contato@autocentrosupremo.com.br",
  endereco: "Av. das Indústrias, 1.420 — São Paulo, SP",
  cor_primaria: "#F59E0B",
  plano: "Profissional",
};

export const demoClientes = [
  { id: "c1", nome: "Ricardo Almeida", telefone: "(11) 98765-4321", email: "ricardo.almeida@email.com", ultima_visita: "2026-03-18", total_gasto: 4780.0, veiculos: 2, status: "ativo", tags: ["VIP", "Recorrente"], observacoes: "Cliente desde 2022. Prefere ligar antes de trazer o carro." },
  { id: "c2", nome: "Fernanda Costa", telefone: "(11) 97654-3210", email: "fernanda.costa@email.com", ultima_visita: "2026-01-05", total_gasto: 1230.0, veiculos: 1, status: "inativo", tags: ["Inativo"], observacoes: "Não retornou após troca de óleo em janeiro." },
  { id: "c3", nome: "Marcelo Souza", telefone: "(11) 91234-5678", email: "marcelo.souza@email.com", ultima_visita: "2026-03-28", total_gasto: 6320.0, veiculos: 1, status: "ativo", tags: ["VIP"], observacoes: "Frota empresarial. Prioridade no atendimento." },
  { id: "c4", nome: "Juliana Martins", telefone: "(11) 95555-9999", email: "juliana.martins@email.com", ultima_visita: "2026-02-14", total_gasto: 890.0, veiculos: 1, status: "ativo", tags: [], observacoes: "" },
  { id: "c5", nome: "Carlos Eduardo Ramos", telefone: "(11) 94444-8888", email: "carlos.ramos@email.com", ultima_visita: "2025-11-20", total_gasto: 2100.0, veiculos: 1, status: "inativo", tags: ["Inativo"], observacoes: "Revisão programada não realizada." },
  { id: "c6", nome: "Patricia Lima", telefone: "(11) 93333-7777", email: "patricia.lima@email.com", ultima_visita: "2026-04-01", total_gasto: 3450.0, veiculos: 2, status: "ativo", tags: ["Recorrente"], observacoes: "" },
];

export const demoVeiculos = [
  { id: "v1", cliente_id: "c1", cliente_nome: "Ricardo Almeida", marca: "Toyota", modelo: "Corolla", ano: 2021, placa: "BRA-2E19", cor: "Prata", quilometragem: 48200, ultima_revisao: "2026-03-18", proxima_revisao: "2026-09-18", historico_servicos: 6, observacoes: "Revisão a cada 6 meses ou 10.000 km" },
  { id: "v2", cliente_id: "c1", cliente_nome: "Ricardo Almeida", marca: "Honda", modelo: "HR-V", ano: 2022, placa: "GHI-4J22", cor: "Branco", quilometragem: 22100, ultima_revisao: "2026-01-10", proxima_revisao: "2026-07-10", historico_servicos: 2, observacoes: "" },
  { id: "v3", cliente_id: "c2", cliente_nome: "Fernanda Costa", marca: "Volkswagen", modelo: "Polo", ano: 2020, placa: "DEF-5K20", cor: "Vermelho", quilometragem: 61000, ultima_revisao: "2026-01-05", proxima_revisao: "2026-07-05", historico_servicos: 4, observacoes: "Frequente problema no ar-condicionado" },
  { id: "v4", cliente_id: "c3", cliente_nome: "Marcelo Souza", marca: "Chevrolet", modelo: "S10", ano: 2023, placa: "JKL-7M23", cor: "Preto", quilometragem: 35400, ultima_revisao: "2026-03-28", proxima_revisao: "2026-09-28", historico_servicos: 3, observacoes: "Frota empresarial. Revisão mensal." },
  { id: "v5", cliente_id: "c4", cliente_nome: "Juliana Martins", marca: "Fiat", modelo: "Pulse", ano: 2023, placa: "MNO-8P23", cor: "Azul", quilometragem: 18700, ultima_revisao: "2026-02-14", proxima_revisao: "2026-08-14", historico_servicos: 1, observacoes: "" },
  { id: "v6", cliente_id: "c6", cliente_nome: "Patricia Lima", marca: "Jeep", modelo: "Compass", ano: 2022, placa: "PQR-9S22", cor: "Cinza", quilometragem: 42000, ultima_revisao: "2026-04-01", proxima_revisao: "2026-10-01", historico_servicos: 5, observacoes: "" },
];

export const demoOrcamentos = [
  { id: "o1", numero: "ORC-2026-041", cliente_id: "c3", cliente_nome: "Marcelo Souza", veiculo_id: "v4", veiculo_desc: "Chevrolet S10 2023 — JKL-7M23", data: "2026-04-01", validade: "2026-04-15", status: "aprovado", total: 1850.0, itens: [{ descricao: "Troca de óleo + filtros", valor: 280.0, quantidade: 1 }, { descricao: "Revisão freios dianteiros", valor: 620.0, quantidade: 1 }, { descricao: "Alinhamento e balanceamento", valor: 180.0, quantidade: 1 }, { descricao: "Mão de obra geral", valor: 300.0, quantidade: 1 }], observacoes: "Cliente autorizou via WhatsApp.", convertido_em_os: true, os_id: "os1" },
  { id: "o2", numero: "ORC-2026-042", cliente_id: "c1", cliente_nome: "Ricardo Almeida", veiculo_id: "v1", veiculo_desc: "Toyota Corolla 2021 — BRA-2E19", data: "2026-04-02", validade: "2026-04-16", status: "pendente", total: 2340.0, itens: [{ descricao: "Troca correia dentada", valor: 980.0, quantidade: 1 }, { descricao: "Troca bomba d'água", valor: 460.0, quantidade: 1 }, { descricao: "Mão de obra", valor: 570.0, quantidade: 1 }], observacoes: "Aguardando retorno do cliente.", convertido_em_os: false, os_id: null },
  { id: "o3", numero: "ORC-2026-039", cliente_id: "c6", cliente_nome: "Patricia Lima", veiculo_id: "v6", veiculo_desc: "Jeep Compass 2022 — PQR-9S22", data: "2026-03-28", validade: "2026-04-11", status: "aprovado", total: 780.0, itens: [{ descricao: "Troca de óleo sintético 5W30", valor: 320.0, quantidade: 1 }, { descricao: "Filtro de ar", valor: 110.0, quantidade: 1 }, { descricao: "Mão de obra", valor: 255.0, quantidade: 1 }], observacoes: "", convertido_em_os: true, os_id: "os2" },
  { id: "o4", numero: "ORC-2026-038", cliente_id: "c4", cliente_nome: "Juliana Martins", veiculo_id: "v5", veiculo_desc: "Fiat Pulse 2023 — MNO-8P23", data: "2026-03-25", validade: "2026-04-08", status: "recusado", total: 1200.0, itens: [{ descricao: "Reparo ar-condicionado", valor: 850.0, quantidade: 1 }, { descricao: "Mão de obra", valor: 150.0, quantidade: 1 }], observacoes: "Cliente achou caro.", convertido_em_os: false, os_id: null },
];

export const demoOrdens = [
  { id: "os1", numero: "OS-2026-091", orcamento_id: "o1", cliente_id: "c3", cliente_nome: "Marcelo Souza", veiculo_id: "v4", veiculo_desc: "Chevrolet S10 2023 — JKL-7M23", data_abertura: "2026-04-02", data_prevista: "2026-04-04", data_conclusao: null, status: "em_andamento", tecnico: "Paulo Henrique", prioridade: "alta", total: 1850.0, itens: [{ descricao: "Troca de óleo + filtros", valor: 280.0, status: "concluido" }, { descricao: "Revisão freios dianteiros", valor: 620.0, status: "em_andamento" }, { descricao: "Alinhamento e balanceamento", valor: 180.0, status: "pendente" }], observacoes: "Cliente solicitou prioridade. Veículo de frota.", pagamento_status: "pendente" },
  { id: "os2", numero: "OS-2026-090", orcamento_id: "o3", cliente_id: "c6", cliente_nome: "Patricia Lima", veiculo_id: "v6", veiculo_desc: "Jeep Compass 2022 — PQR-9S22", data_abertura: "2026-03-29", data_prevista: "2026-03-30", data_conclusao: "2026-03-30", status: "concluida", tecnico: "Diego Ferreira", prioridade: "normal", total: 780.0, itens: [{ descricao: "Troca de óleo sintético 5W30", valor: 320.0, status: "concluido" }, { descricao: "Filtro de ar", valor: 110.0, status: "concluido" }], observacoes: "Serviço concluído no prazo.", pagamento_status: "pago" },
  { id: "os3", numero: "OS-2026-088", orcamento_id: null, cliente_id: "c1", cliente_nome: "Ricardo Almeida", veiculo_id: "v2", veiculo_desc: "Honda HR-V 2022 — GHI-4J22", data_abertura: "2026-04-03", data_prevista: "2026-04-05", data_conclusao: null, status: "aguardando_peca", tecnico: "Paulo Henrique", prioridade: "normal", total: 1420.0, itens: [{ descricao: "Troca kit embreagem", valor: 980.0, status: "aguardando_peca" }, { descricao: "Mão de obra", valor: 250.0, status: "pendente" }], observacoes: "Aguardando chegada da embreagem.", pagamento_status: "pendente" },
  { id: "os4", numero: "OS-2026-086", orcamento_id: null, cliente_id: "c4", cliente_nome: "Juliana Martins", veiculo_id: "v5", veiculo_desc: "Fiat Pulse 2023 — MNO-8P23", data_abertura: "2026-04-04", data_prevista: "2026-04-04", data_conclusao: "2026-04-04", status: "concluida", tecnico: "Diego Ferreira", prioridade: "baixa", total: 180.0, itens: [{ descricao: "Diagnóstico eletrônico", valor: 120.0, status: "concluido" }], observacoes: "Luz de motor apagada após limpeza do sensor.", pagamento_status: "pago" },
];

export const demoFinanceiro = {
  faturamento_mes: 28640.0,
  ticket_medio: 1190.0,
  total_receber: 6820.0,
  total_recebido_mes: 21820.0,
  lucro_bruto_estimado: 11456.0,
  os_concluidas_mes: 24,
  lancamentos: [
    { id: "f1", descricao: "Pagamento OS-2026-090 — Patricia Lima", tipo: "entrada", valor: 780.0, data: "2026-03-30", status: "confirmado", forma: "PIX" },
    { id: "f2", descricao: "Pagamento OS-2026-086 — Juliana Martins", tipo: "entrada", valor: 180.0, data: "2026-04-04", status: "confirmado", forma: "Cartão de crédito" },
    { id: "f3", descricao: "Pagamento OS-2026-091 — Marcelo Souza", tipo: "entrada", valor: 1850.0, data: "2026-04-05", status: "pendente", forma: "A definir" },
    { id: "f4", descricao: "Compra de peças — Distribuidora AutoParts", tipo: "saida", valor: 3200.0, data: "2026-04-01", status: "confirmado", forma: "Transferência" },
    { id: "f5", descricao: "Aluguel do espaço — Abril", tipo: "saida", valor: 4800.0, data: "2026-04-05", status: "confirmado", forma: "Boleto" },
  ],
  faturamento_semanal: [
    { semana: "Sem 1", valor: 7200 },
    { semana: "Sem 2", valor: 8400 },
    { semana: "Sem 3", valor: 6800 },
    { semana: "Sem 4", valor: 6240 },
  ],
};

export const demoAIInsights = [
  { id: "ai1", tipo: "retorno", prioridade: "alta", titulo: "Fernanda Costa está há 90 dias sem retornar", descricao: "Fernanda visitou pela última vez em 05/01/2026 e possui histórico de revisões regulares. É um bom momento para contato proativo.", acao_sugerida: "Enviar mensagem de retorno com oferta de revisão gratuita de diagnóstico", cliente: "Fernanda Costa", cliente_id: "c2", veiculo: "Volkswagen Polo 2020", mensagem_sugerida: "Olá Fernanda! Percebemos que já faz um tempo desde sua última visita ao Auto Center Supremo. Seu Polo merece um check-up! Que tal agendar uma revisão rápida? Temos horários disponíveis essa semana. 😊" },
  { id: "ai2", tipo: "orcamento", prioridade: "alta", titulo: "Orçamento ORC-2026-042 sem resposta há 4 dias", descricao: "Ricardo Almeida recebeu o orçamento de R$ 2.340 para troca de correia dentada. Sem resposta. Alta urgência — risco técnico real.", acao_sugerida: "Follow-up de orçamento com reforço da urgência técnica", cliente: "Ricardo Almeida", cliente_id: "c1", veiculo: "Toyota Corolla 2021", mensagem_sugerida: "Oi Ricardo! Passando para lembrar do orçamento que enviamos para o seu Corolla (troca de correia dentada). Esse serviço é de segurança importante — pode confirmar sua agenda?" },
  { id: "ai3", tipo: "revisao", prioridade: "media", titulo: "Honda HR-V de Ricardo próximo dos 25.000 km", descricao: "O HR-V possui 22.100 km rodados. Em breve atingirá o limite de revisão programada. Oportunidade de agendamento preventivo.", acao_sugerida: "Agendar revisão preventiva dos 25.000 km", cliente: "Ricardo Almeida", cliente_id: "c1", veiculo: "Honda HR-V 2022", mensagem_sugerida: "Ricardo, seu HR-V está chegando perto dos 25.000 km! É a revisão do fabricante — essencial para manter a garantia. Quer deixar já agendado?" },
  { id: "ai4", tipo: "inativo", prioridade: "alta", titulo: "Carlos Eduardo Ramos inativo há +130 dias", descricao: "Carlos foi cliente ativo em 2025 mas não retornou desde novembro. Já está fora do ciclo esperado.", acao_sugerida: "Campanha de reativação com oferta especial", cliente: "Carlos Eduardo Ramos", cliente_id: "c5", veiculo: "Veículo não identificado", mensagem_sugerida: "Carlos, sentimos sua falta! Faz algum tempo que não te vemos por aqui. Preparamos uma condição especial para você voltar: diagnóstico eletrônico grátis na sua próxima visita. Que tal?" },
  { id: "ai5", tipo: "os_parada", prioridade: "media", titulo: "OS-2026-088 aguardando peça há 2 dias", descricao: "A OS do Honda HR-V de Ricardo está parada aguardando embreagem. Cliente não foi atualizado.", acao_sugerida: "Atualizar cliente sobre status da peça", cliente: "Ricardo Almeida", cliente_id: "c1", veiculo: "Honda HR-V 2022", mensagem_sugerida: "Ricardo, atualização sobre seu HR-V: a embreagem foi solicitada ao fornecedor e chega até amanhã. Assim que chegar, finalizamos no mesmo dia!" },
];

export const demoDashboardStats = {
  os_abertas: 2,
  os_concluidas_hoje: 1,
  orcamentos_pendentes: 1,
  veiculos_em_atendimento: 3,
  clientes_inativos: 2,
  faturamento_mes: 28640.0,
  contas_receber: 6820.0,
  ticket_medio: 1190.0,
  taxa_aprovacao: 74,
  os_semana: [
    { dia: "Seg", abertas: 2, concluidas: 3 },
    { dia: "Ter", abertas: 1, concluidas: 4 },
    { dia: "Qua", abertas: 3, concluidas: 2 },
    { dia: "Qui", abertas: 1, concluidas: 3 },
    { dia: "Sex", abertas: 2, concluidas: 1 },
    { dia: "Sáb", abertas: 0, concluidas: 2 },
  ],
  servicos_top: [
    { servico: "Troca de Óleo", quantidade: 38 },
    { servico: "Freios", quantidade: 22 },
    { servico: "Suspensão", quantidade: 17 },
    { servico: "Elétrica", quantidade: 14 },
    { servico: "Ar-condicionado", quantidade: 9 },
  ],
};

export const demoEquipe = [
  { id: "t1", nome: "Paulo Henrique Silva", papel: "Técnico / Mecânico", email: "paulo.henrique@autocentrosupremo.com.br", telefone: "(11) 98001-1111", os_ativas: 2, os_concluidas_mes: 11, status: "ativo", especialidade: "Mecânica Geral e Suspensão" },
  { id: "t2", nome: "Diego Ferreira", papel: "Técnico / Mecânico", email: "diego.ferreira@autocentrosupremo.com.br", telefone: "(11) 98002-2222", os_ativas: 0, os_concluidas_mes: 9, status: "ativo", especialidade: "Elétrica Automotiva" },
  { id: "t3", nome: "Aline Rocha", papel: "Atendimento / Recepção", email: "aline.rocha@autocentrosupremo.com.br", telefone: "(11) 98003-3333", os_ativas: 0, os_concluidas_mes: 0, status: "ativo", especialidade: "Atendimento ao cliente" },
  { id: "t4", nome: "Roberto Nascimento", papel: "Admin da Oficina", email: "roberto@autocentrosupremo.com.br", telefone: "(11) 98004-4444", os_ativas: 0, os_concluidas_mes: 0, status: "ativo", especialidade: "Gestão e administração" },
];

export const demoMasterData = {
  total_oficinas: 14,
  oficinas_ativas: 12,
  oficinas_trial: 2,
  mrr: 4186.0,
  oficinas: [
    { id: "emp1", nome: "Auto Center Supremo", cidade: "São Paulo, SP", plano: "Profissional", status: "ativo", os_mes: 24, faturamento: 28640, onboarding: 100, data_inicio: "2025-01-10" },
    { id: "emp2", nome: "Mecânica do Zé", cidade: "Campinas, SP", plano: "Básico", status: "ativo", os_mes: 11, faturamento: 9800, onboarding: 100, data_inicio: "2025-03-05" },
    { id: "emp3", nome: "ElétricaCar Premium", cidade: "Ribeirão Preto, SP", plano: "Profissional", status: "ativo", os_mes: 18, faturamento: 21400, onboarding: 100, data_inicio: "2025-02-20" },
    { id: "emp4", nome: "AutoPro Revisões", cidade: "Belo Horizonte, MG", plano: "Trial", status: "trial", os_mes: 3, faturamento: 2100, onboarding: 60, data_inicio: "2026-03-28" },
    { id: "emp5", nome: "Centro Automotivo Norte", cidade: "Manaus, AM", plano: "Básico", status: "ativo", os_mes: 9, faturamento: 7200, onboarding: 100, data_inicio: "2025-06-15" },
  ],
};