/**
 * Função para criar 2 Oficinas de teste com dados isolados
 * Executar: POST /functions/seedTestData
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // ========== OFICINA A: Turbo Sul ==========
    const empresaA = await base44.entities.Empresa.create({
      nome: "Oficina Turbo Sul",
      slug: "turbo-sul",
      plano: "profissional",
      status: "ativo",
      email: "contato@turbosul.com.br",
      telefone: "(51) 3333-1111",
      endereco: "Rua dos Pinheiros, 100 — Porto Alegre, RS",
      slogan: "Excelência em manutenção automotiva",
      onboarding_concluido: true,
      onboarding_step: 4,
    });

    // Clientes A
    const clientesA = await base44.entities.Cliente.bulkCreate([
      {
        nome: "João Silva",
        email: "joao@email.com",
        telefone: "(51) 99999-1111",
        status: "ativo",
        empresa_id: empresaA.id,
        observacoes: "Cliente VIP — múltiplos veículos",
      },
      {
        nome: "Maria Santos",
        email: "maria@email.com",
        telefone: "(51) 99999-2222",
        status: "ativo",
        empresa_id: empresaA.id,
      },
      {
        nome: "Pedro Costa",
        email: "pedro@email.com",
        telefone: "(51) 99999-3333",
        status: "ativo",
        empresa_id: empresaA.id,
      },
    ]);

    // Veículos A
    const veiculosA = await base44.entities.Veiculo.bulkCreate([
      {
        cliente_id: clientesA[0].id,
        cliente_nome: clientesA[0].nome,
        marca: "Honda",
        modelo: "Civic",
        ano: 2020,
        placa: "ABC1234",
        cor: "Prata",
        quilometragem: 45000,
        empresa_id: empresaA.id,
      },
      {
        cliente_id: clientesA[0].id,
        cliente_nome: clientesA[0].nome,
        marca: "Volkswagen",
        modelo: "Gol",
        ano: 2018,
        placa: "DEF5678",
        cor: "Branco",
        quilometragem: 62000,
        empresa_id: empresaA.id,
      },
      {
        cliente_id: clientesA[1].id,
        cliente_nome: clientesA[1].nome,
        marca: "Toyota",
        modelo: "Corolla",
        ano: 2022,
        placa: "GHI9999",
        cor: "Preto",
        quilometragem: 18000,
        empresa_id: empresaA.id,
      },
    ]);

    // Orçamentos A
    const orcamentosA = await base44.entities.Orcamento.bulkCreate([
      {
        numero: "ORC-001-A",
        cliente_id: clientesA[0].id,
        cliente_nome: clientesA[0].nome,
        veiculo_id: veiculosA[0].id,
        veiculo_desc: `${veiculosA[0].marca} ${veiculosA[0].modelo}`,
        data: new Date().toISOString().split('T')[0],
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "pendente",
        total: 2500,
        itens: [
          { descricao: "Revisão 10mil km", quantidade: 1, valor: 1200 },
          { descricao: "Filtro de ar", quantidade: 1, valor: 180 },
          { descricao: "Mão de obra", quantidade: 1, valor: 1120 },
        ],
        empresa_id: empresaA.id,
      },
      {
        numero: "ORC-002-A",
        cliente_id: clientesA[1].id,
        cliente_nome: clientesA[1].nome,
        veiculo_id: veiculosA[2].id,
        veiculo_desc: `${veiculosA[2].marca} ${veiculosA[2].modelo}`,
        data: new Date().toISOString().split('T')[0],
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "aprovado",
        total: 3800,
        itens: [
          { descricao: "Troca de óleo e filtro", quantidade: 1, valor: 450 },
          { descricao: "Alinhamento", quantidade: 1, valor: 350 },
          { descricao: "Balanceamento", quantidade: 4, valor: 800 },
          { descricao: "Mão de obra", quantidade: 1, valor: 2200 },
        ],
        empresa_id: empresaA.id,
      },
    ]);

    // Ordens de Serviço A
    const ordensA = await base44.entities.OrdemServico.bulkCreate([
      {
        numero: "OS-001-A",
        orcamento_id: orcamentosA[1].id,
        cliente_id: clientesA[1].id,
        cliente_nome: clientesA[1].nome,
        veiculo_id: veiculosA[2].id,
        veiculo_desc: `${veiculosA[2].marca} ${veiculosA[2].modelo}`,
        data_abertura: new Date().toISOString().split('T')[0],
        data_prevista: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "em_andamento",
        prioridade: "normal",
        total: 3800,
        itens: [
          { descricao: "Troca de óleo e filtro", valor: 450, status: "concluido" },
          { descricao: "Alinhamento", valor: 350, status: "em_andamento" },
          { descricao: "Balanceamento", valor: 800, status: "pendente" },
        ],
        empresa_id: empresaA.id,
      },
      {
        numero: "OS-002-A",
        cliente_id: clientesA[0].id,
        cliente_nome: clientesA[0].nome,
        veiculo_id: veiculosA[1].id,
        veiculo_desc: `${veiculosA[1].marca} ${veiculosA[1].modelo}`,
        data_abertura: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_prevista: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_conclusao: new Date().toISOString().split('T')[0],
        status: "concluida",
        prioridade: "alta",
        total: 4200,
        itens: [
          { descricao: "Troca de embreagem", valor: 3800, status: "concluido" },
          { descricao: "Ajuste de freios", valor: 400, status: "concluido" },
        ],
        empresa_id: empresaA.id,
      },
    ]);

    // ========== OFICINA B: Auto Center Norte ==========
    const empresaB = await base44.entities.Empresa.create({
      nome: "Auto Center Norte",
      slug: "auto-center-norte",
      plano: "basico",
      status: "ativo",
      email: "contato@autocentronorte.com.br",
      telefone: "(92) 3333-2222",
      endereco: "Avenida Principal, 500 — Manaus, AM",
      slogan: "Serviços de qualidade para seu carro",
      onboarding_concluido: true,
      onboarding_step: 4,
    });

    // Clientes B
    const clientesB = await base44.entities.Cliente.bulkCreate([
      {
        nome: "Carlos Mendes",
        email: "carlos@email.com",
        telefone: "(92) 98888-1111",
        status: "ativo",
        empresa_id: empresaB.id,
      },
      {
        nome: "Ana Oliveira",
        email: "ana@email.com",
        telefone: "(92) 98888-2222",
        status: "ativo",
        empresa_id: empresaB.id,
      },
      {
        nome: "Bruno Ferreira",
        email: "bruno@email.com",
        telefone: "(92) 98888-3333",
        status: "inativo",
        empresa_id: empresaB.id,
      },
    ]);

    // Veículos B
    const veiculosB = await base44.entities.Veiculo.bulkCreate([
      {
        cliente_id: clientesB[0].id,
        cliente_nome: clientesB[0].nome,
        marca: "Fiat",
        modelo: "Uno",
        ano: 2019,
        placa: "JKL3456",
        cor: "Vermelho",
        quilometragem: 58000,
        empresa_id: empresaB.id,
      },
      {
        cliente_id: clientesB[1].id,
        cliente_nome: clientesB[1].nome,
        marca: "Chevrolet",
        modelo: "Onix",
        ano: 2021,
        placa: "MNO7890",
        cor: "Cinza",
        quilometragem: 32000,
        empresa_id: empresaB.id,
      },
      {
        cliente_id: clientesB[2].id,
        cliente_nome: clientesB[2].nome,
        marca: "Hyundai",
        modelo: "HB20",
        ano: 2020,
        placa: "PQR1111",
        cor: "Azul",
        quilometragem: 41000,
        empresa_id: empresaB.id,
      },
    ]);

    // Orçamentos B
    const orcamentosB = await base44.entities.Orcamento.bulkCreate([
      {
        numero: "ORC-001-B",
        cliente_id: clientesB[0].id,
        cliente_nome: clientesB[0].nome,
        veiculo_id: veiculosB[0].id,
        veiculo_desc: `${veiculosB[0].marca} ${veiculosB[0].modelo}`,
        data: new Date().toISOString().split('T')[0],
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "recusado",
        total: 1800,
        itens: [
          { descricao: "Alinhamento e balanceamento", quantidade: 1, valor: 1200 },
          { descricao: "Mão de obra", quantidade: 1, valor: 600 },
        ],
        empresa_id: empresaB.id,
      },
      {
        numero: "ORC-002-B",
        cliente_id: clientesB[1].id,
        cliente_nome: clientesB[1].nome,
        veiculo_id: veiculosB[1].id,
        veiculo_desc: `${veiculosB[1].marca} ${veiculosB[1].modelo}`,
        data: new Date().toISOString().split('T')[0],
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "pendente",
        total: 950,
        itens: [
          { descricao: "Troca de óleo", quantidade: 1, valor: 250 },
          { descricao: "Revisão preventiva", quantidade: 1, valor: 500 },
          { descricao: "Mão de obra", quantidade: 1, valor: 200 },
        ],
        empresa_id: empresaB.id,
      },
    ]);

    // Ordens de Serviço B
    const ordensB = await base44.entities.OrdemServico.bulkCreate([
      {
        numero: "OS-001-B",
        cliente_id: clientesB[0].id,
        cliente_nome: clientesB[0].nome,
        veiculo_id: veiculosB[0].id,
        veiculo_desc: `${veiculosB[0].marca} ${veiculosB[0].modelo}`,
        data_abertura: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_prevista: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "aberta",
        prioridade: "normal",
        total: 780,
        itens: [
          { descricao: "Alinhamento", valor: 350, status: "pendente" },
          { descricao: "Balanceamento", valor: 430, status: "pendente" },
        ],
        empresa_id: empresaB.id,
      },
      {
        numero: "OS-002-B",
        cliente_id: clientesB[1].id,
        cliente_nome: clientesB[1].nome,
        veiculo_id: veiculosB[1].id,
        veiculo_desc: `${veiculosB[1].marca} ${veiculosB[1].modelo}`,
        data_abertura: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_prevista: new Date().toISOString().split('T')[0],
        status: "em_andamento",
        prioridade: "alta",
        total: 640,
        itens: [
          { descricao: "Troca de óleo", valor: 250, status: "concluido" },
          { descricao: "Filtro ar", valor: 120, status: "em_andamento" },
          { descricao: "Mão de obra", valor: 270, status: "pendente" },
        ],
        empresa_id: empresaB.id,
      },
    ]);

    return Response.json({
      success: true,
      message: "Dados de teste criados com sucesso",
      data: {
        empresaA: { id: empresaA.id, nome: empresaA.nome, clientes: clientesA.length, veiculos: veiculosA.length, ordensA: ordensA.length },
        empresaB: { id: empresaB.id, nome: empresaB.nome, clientes: clientesB.length, veiculos: veiculosB.length, ordensB: ordensB.length },
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});