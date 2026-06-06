export const demoAcademy = {
  id: "demo-academy-1",
  name: "FitZone Performance",
  logo: null,
  primary_color: "#F97316",
  phone: "(11) 99999-0000",
  email: "contato@fitzoneperformance.com.br",
  address: "Av. Paulista, 1000 - São Paulo/SP",
  hours: "Seg-Sex: 06h-22h | Sáb: 08h-18h | Dom: 08h-14h",
  plan_name: "Pro",
  plan_status: "ativo",
  plan_expires: "2026-12-31",
  onboarding_step: 9,
  onboarding_complete: true,
  status: "ativo",
};

export const demoStudents = [
  { id: "s1", name: "Lucas Ferreira", phone: "(11) 98888-1111", email: "lucas@email.com", birthdate: "1995-03-15", plan_id: "p1", plan_name: "Mensal Musculação", status: "ativo", start_date: "2025-01-15", expiry_date: "2026-04-30", last_checkin: "2026-04-04", checkin_count_month: 18, tags: ["recorrente"] },
  { id: "s2", name: "Mariana Costa", phone: "(11) 97777-2222", email: "mariana@email.com", birthdate: "1998-07-22", plan_id: "p2", plan_name: "Trimestral Funcional", status: "ativo", start_date: "2026-01-10", expiry_date: "2026-04-09", last_checkin: "2026-04-03", checkin_count_month: 10, tags: ["plano vencendo"] },
  { id: "s3", name: "Rafael Souza", phone: "(11) 96666-3333", email: "rafael@email.com", birthdate: "1990-11-05", plan_id: "p1", plan_name: "Mensal Musculação", status: "inativo", start_date: "2025-06-01", expiry_date: "2026-03-01", last_checkin: "2026-02-14", checkin_count_month: 0, tags: ["inativo"] },
  { id: "s4", name: "Fernanda Lima", phone: "(11) 95555-4444", email: "fernanda@email.com", birthdate: "2000-01-30", plan_id: "p3", plan_name: "Mensal Pilates", status: "ativo", start_date: "2026-02-01", expiry_date: "2026-05-01", last_checkin: "2026-04-04", checkin_count_month: 14, tags: ["novo"] },
  { id: "s5", name: "Carlos Mendes", phone: "(11) 94444-5555", email: "carlos@email.com", birthdate: "1985-09-18", plan_id: "p4", plan_name: "Anual Completo", status: "ativo", start_date: "2025-04-01", expiry_date: "2026-04-01", last_checkin: "2026-03-20", checkin_count_month: 5, tags: ["queda frequência"] },
  { id: "s6", name: "Juliana Rocha", phone: "(11) 93333-6666", email: "juliana@email.com", birthdate: "1993-05-12", plan_id: "p2", plan_name: "Trimestral Funcional", status: "ativo", start_date: "2026-03-01", expiry_date: "2026-06-01", last_checkin: "2026-04-04", checkin_count_month: 16, tags: ["recorrente"] },
  { id: "s7", name: "Bruno Alves", phone: "(11) 92222-7777", email: "bruno@email.com", birthdate: "1997-12-08", plan_id: "p1", plan_name: "Mensal Musculação", status: "inativo", start_date: "2025-09-01", expiry_date: "2026-02-28", last_checkin: "2026-01-30", checkin_count_month: 0, tags: ["inativo"] },
  { id: "s8", name: "Patrícia Nunes", phone: "(11) 91111-8888", email: "patricia@email.com", birthdate: "1988-04-25", plan_id: "p3", plan_name: "Mensal Pilates", status: "ativo", start_date: "2026-01-15", expiry_date: "2026-04-07", last_checkin: "2026-04-02", checkin_count_month: 8, tags: ["plano vencendo"] },
  { id: "s9", name: "Diego Martins", phone: "(11) 90000-9999", email: "diego@email.com", birthdate: "2001-08-14", plan_id: "p5", plan_name: "Semestral Studio", status: "ativo", start_date: "2026-01-01", expiry_date: "2026-07-01", last_checkin: "2026-04-04", checkin_count_month: 20, tags: ["recorrente"] },
  { id: "s10", name: "Amanda Vieira", phone: "(11) 98765-0101", email: "amanda@email.com", birthdate: "1996-02-19", plan_id: "p1", plan_name: "Mensal Musculação", status: "ativo", start_date: "2026-03-15", expiry_date: "2026-04-15", last_checkin: "2026-04-01", checkin_count_month: 6, tags: ["novo", "plano vencendo"] },
  { id: "s11", name: "Thiago Oliveira", phone: "(11) 99876-0202", email: "thiago@email.com", birthdate: "1992-06-30", plan_id: "p4", plan_name: "Anual Completo", status: "ativo", start_date: "2025-07-01", expiry_date: "2026-07-01", last_checkin: "2026-04-03", checkin_count_month: 12, tags: ["recorrente"] },
  { id: "s12", name: "Camila Santos", phone: "(11) 97654-0303", email: "camila@email.com", birthdate: "1999-10-05", plan_id: "p2", plan_name: "Trimestral Funcional", status: "inativo", start_date: "2025-11-01", expiry_date: "2026-02-01", last_checkin: "2026-01-15", checkin_count_month: 0, tags: ["inativo"] },
];

export const demoPlans = [
  { id: "p1", name: "Mensal Musculação", duration: "1 mês", value: 149.90, modality: "Musculação", recurrence: "mensal", status: "ativo", observations: "Acesso à área de musculação + cardio." },
  { id: "p2", name: "Trimestral Funcional", duration: "3 meses", value: 379.90, modality: "Funcional", recurrence: "trimestral", status: "ativo", observations: "Treinamento funcional em grupo." },
  { id: "p3", name: "Mensal Pilates", duration: "1 mês", value: 199.90, modality: "Pilates", recurrence: "mensal", status: "ativo", observations: "Studio de pilates, turmas reduzidas." },
  { id: "p4", name: "Anual Completo", duration: "12 meses", value: 1499.90, modality: "Completo", recurrence: "anual", status: "ativo", observations: "Acesso total a todas as modalidades." },
  { id: "p5", name: "Semestral Studio", duration: "6 meses", value: 799.90, modality: "Studio", recurrence: "semestral", status: "ativo", observations: "Studio premium com personal incluso." },
];

export const demoTeam = [
  { id: "t1", name: "Ana Paula Ramos", email: "ana@fitzoneperformance.com.br", role: "admin", specialty: "Gestão", active: true },
  { id: "t2", name: "Ricardo Gomes", email: "ricardo@fitzoneperformance.com.br", role: "professor", specialty: "Musculação e Hipertrofia", active: true },
  { id: "t3", name: "Bruna Farias", email: "bruna@fitzoneperformance.com.br", role: "professor", specialty: "Pilates e Core", active: true },
  { id: "t4", name: "Marcos Lima", email: "marcos@fitzoneperformance.com.br", role: "recepcao", specialty: "Atendimento", active: true },
  { id: "t5", name: "Tatiane Souza", email: "tatiane@fitzoneperformance.com.br", role: "financeiro", specialty: "Financeiro e Cobrança", active: true },
];

export const demoCheckins = [
  { id: "c1", student_id: "s1", student_name: "Lucas Ferreira", date: "2026-04-05", time: "07:15", professor: "Ricardo Gomes", modality: "Musculação" },
  { id: "c2", student_id: "s4", student_name: "Fernanda Lima", date: "2026-04-05", time: "08:00", professor: "Bruna Farias", modality: "Pilates" },
  { id: "c3", student_id: "s6", student_name: "Juliana Rocha", date: "2026-04-05", time: "09:30", professor: "Ricardo Gomes", modality: "Funcional" },
  { id: "c4", student_id: "s9", student_name: "Diego Martins", date: "2026-04-05", time: "06:45", professor: "Ricardo Gomes", modality: "Studio" },
  { id: "c5", student_id: "s11", student_name: "Thiago Oliveira", date: "2026-04-05", time: "07:00", professor: "Ricardo Gomes", modality: "Musculação" },
  { id: "c6", student_id: "s2", student_name: "Mariana Costa", date: "2026-04-04", time: "08:30", professor: "Ricardo Gomes", modality: "Funcional" },
  { id: "c7", student_id: "s1", student_name: "Lucas Ferreira", date: "2026-04-04", time: "07:10", professor: "Ricardo Gomes", modality: "Musculação" },
  { id: "c8", student_id: "s8", student_name: "Patrícia Nunes", date: "2026-04-03", time: "09:00", professor: "Bruna Farias", modality: "Pilates" },
  { id: "c9", student_id: "s9", student_name: "Diego Martins", date: "2026-04-03", time: "06:50", professor: "Ricardo Gomes", modality: "Studio" },
  { id: "c10", student_id: "s6", student_name: "Juliana Rocha", date: "2026-04-03", time: "09:45", professor: "Ricardo Gomes", modality: "Funcional" },
];

export const demoSchedule = [
  { id: "ag1", student_id: "s4", student_name: "Fernanda Lima", type: "Avaliação Inicial", date: "2026-04-05", time: "10:00", professor: "Bruna Farias", status: "agendado" },
  { id: "ag2", student_id: "s10", student_name: "Amanda Vieira", type: "Retorno de Avaliação", date: "2026-04-05", time: "11:00", professor: "Ricardo Gomes", status: "agendado" },
  { id: "ag3", student_id: "s5", student_name: "Carlos Mendes", type: "Retorno de Avaliação", date: "2026-04-06", time: "09:00", professor: "Ricardo Gomes", status: "agendado" },
  { id: "ag4", student_id: "s2", student_name: "Mariana Costa", type: "Avaliação Inicial", date: "2026-04-02", time: "08:00", professor: "Bruna Farias", status: "concluído" },
];

export const demoFinancial = [
  { id: "f1", type: "receita", category: "Mensalidade", description: "Lucas Ferreira - Mensal Musculação", student_id: "s1", value: 149.90, date: "2026-04-01", status: "pago" },
  { id: "f2", type: "receita", category: "Mensalidade", description: "Mariana Costa - Trimestral Funcional", student_id: "s2", value: 379.90, date: "2026-04-01", status: "pago" },
  { id: "f3", type: "receita", category: "Mensalidade", description: "Fernanda Lima - Mensal Pilates", student_id: "s4", value: 199.90, date: "2026-04-01", status: "pago" },
  { id: "f4", type: "receita", category: "Mensalidade", description: "Carlos Mendes - Anual Completo", student_id: "s5", value: 1499.90, date: "2026-01-01", status: "pago" },
  { id: "f5", type: "receita", category: "Mensalidade", description: "Juliana Rocha - Trimestral Funcional", student_id: "s6", value: 379.90, date: "2026-03-01", status: "pago" },
  { id: "f6", type: "receita", category: "Mensalidade", description: "Diego Martins - Semestral Studio", student_id: "s9", value: 799.90, date: "2026-01-01", status: "pago" },
  { id: "f7", type: "receita", category: "Mensalidade", description: "Thiago Oliveira - Anual Completo", student_id: "s11", value: 1499.90, date: "2025-07-01", status: "pago" },
  { id: "f8", type: "receita", category: "Mensalidade", description: "Patrícia Nunes - Mensal Pilates", student_id: "s8", value: 199.90, date: "2026-04-01", status: "pendente" },
  { id: "f9", type: "receita", category: "Mensalidade", description: "Amanda Vieira - Mensal Musculação", student_id: "s10", value: 149.90, date: "2026-04-01", status: "pendente" },
  { id: "f10", type: "receita", category: "Mensalidade", description: "Rafael Souza - Mensal Musculação", student_id: "s3", value: 149.90, date: "2026-03-01", status: "pendente" },
  { id: "f11", type: "despesa", category: "Aluguel", description: "Aluguel do espaço - Abril/2026", value: 3500.00, date: "2026-04-01", status: "pago" },
  { id: "f12", type: "despesa", category: "Equipe", description: "Salários equipe - Março/2026", value: 4200.00, date: "2026-03-31", status: "pago" },
  { id: "f13", type: "despesa", category: "Marketing", description: "Anúncios Instagram/Meta - Março", value: 800.00, date: "2026-03-15", status: "pago" },
  { id: "f14", type: "despesa", category: "Manutenção", description: "Equipamentos - revisão geral", value: 350.00, date: "2026-03-20", status: "pago" },
  { id: "f15", type: "despesa", category: "Despesas Gerais", description: "Produtos de limpeza e insumos", value: 180.00, date: "2026-04-02", status: "pago" },
];

export const demoDashboardStats = {
  active_students: 9,
  inactive_students: 3,
  new_students_month: 2,
  plans_expiring_soon: 3,
  checkins_today: 5,
  avg_frequency: 13.2,
  receivable: 499.70,
  revenue_month: 3059.30,
  ai_alerts: 4,
};

export const demoAIOpportunities = [
  { id: "ai1", type: "inativo", priority: "alta", title: "Rafael Souza sumiu há 49 dias", description: "Último check-in em 14/02. Histórico de boa frequência antes da lesão. Alto potencial de reativação.", student_id: "s3", student_name: "Rafael Souza", metric: "49 dias sem presença", action: "Enviar mensagem de reativação" },
  { id: "ai2", type: "inativo", priority: "alta", title: "Bruno Alves sem presença há 65 dias", description: "Cancelou após mudança de emprego. Plano vencido. Oportunidade de reconquistar com oferta especial.", student_id: "s7", student_name: "Bruno Alves", metric: "65 dias sem presença", action: "Enviar mensagem de reconquista" },
  { id: "ai3", type: "vencendo", priority: "alta", title: "Mariana Costa — plano vence em 4 dias", description: "Trimestral Funcional vence em 09/04. Frequência boa. Chance real de renovação.", student_id: "s2", student_name: "Mariana Costa", metric: "Vence em 4 dias", action: "Oferecer renovação" },
  { id: "ai4", type: "vencendo", priority: "alta", title: "Patrícia Nunes — plano vence em 2 dias", description: "Mensal Pilates vence em 07/04. Mencionou interesse em plano semestral. Ótima oportunidade.", student_id: "s8", student_name: "Patrícia Nunes", metric: "Vence em 2 dias", action: "Oferecer upgrade semestral" },
  { id: "ai5", type: "queda", priority: "media", title: "Carlos Mendes com queda de 65% na frequência", description: "Plano anual ativo, mas frequência caiu de 18 para 5 visitas/mês. Risco de não renovar.", student_id: "s5", student_name: "Carlos Mendes", metric: "Queda de 65% no mês", action: "Contato preventivo" },
  { id: "ai6", type: "horario", priority: "baixa", title: "Horário 13h–15h com baixa ocupação", description: "Período com média de 2 check-ins/dia. Oportunidade para campanha de turma ou aula especial.", student_id: null, student_name: null, metric: "~2 check-ins/dia nesse período", action: "Criar campanha para esse horário" },
];

export const demoMasterAcademies = [
  { id: "demo-academy-1", name: "FitZone Performance", plan: "Pro", status: "ativo", onboarding: 9, students: 12, last_activity: "2026-04-05", admin: "Ana Paula Ramos" },
  { id: "demo-academy-2", name: "Studio Corpo em Movimento", plan: "Starter", status: "ativo", onboarding: 7, students: 28, last_activity: "2026-04-04", admin: "Felipe Torres" },
  { id: "demo-academy-3", name: "CrossFit Noroeste", plan: "Pro", status: "ativo", onboarding: 9, students: 45, last_activity: "2026-04-05", admin: "Gabriela Castro" },
  { id: "demo-academy-4", name: "Academia Viver Bem", plan: "Starter", status: "bloqueado", onboarding: 4, students: 8, last_activity: "2026-03-20", admin: "Roberto Dias" },
  { id: "demo-academy-5", name: "Pilates Central", plan: "Pro", status: "ativo", onboarding: 9, students: 19, last_activity: "2026-04-03", admin: "Simone Alves" },
];