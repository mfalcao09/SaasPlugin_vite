import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if demo companies already exist
    const existingCompanies = await base44.entities.Company.filter({});
    const slugs = existingCompanies.map(c => c.slug);

    const companies = [];

    // Burger Express Sul
    if (!slugs.includes('burger-express-sul')) {
      const company1 = await base44.entities.Company.create({
        name: 'Burger Express Sul',
        slug: 'burger-express-sul',
        phone: '(51) 3333-3333',
        address: 'Av. Getúlio Vargas, 1000 — Porto Alegre, RS',
        status: 'ativo',
        plan_name: 'profissional',
        onboarding_completed: true,
        onboarding_step: 6,
        business_hours: {
          monday: '10:00-23:00',
          tuesday: '10:00-23:00',
          wednesday: '10:00-23:00',
          thursday: '10:00-23:00',
          friday: '10:00-00:00',
          saturday: '11:00-00:00',
          sunday: '11:00-23:00'
        },
        average_prep_time: 20,
        primary_color: '#C8102E',
        secondary_color: '#F4E4C1'
      });
      companies.push(company1);

      // Categories for Burger Express Sul
      const cat1_1 = await base44.entities.MenuCategory.create({
        company_id: company1.id,
        name: 'Hambúrgueres',
        sort_order: 0,
        active: true
      });
      const cat1_2 = await base44.entities.MenuCategory.create({
        company_id: company1.id,
        name: 'Acompanhamentos',
        sort_order: 1,
        active: true
      });

      // Menu Items for Burger Express Sul
      const item1_1 = await base44.entities.MenuItem.create({
        company_id: company1.id,
        category_id: cat1_1.id,
        name: 'Smash Burger Duplo',
        description: 'Dois hambúrgueres smash com queijo, alface, tomate e molho especial',
        price: 32.50,
        active: true,
        available: true,
        featured: true,
        allow_notes: true,
        estimated_prep_time: 15
      });
      const item1_2 = await base44.entities.MenuItem.create({
        company_id: company1.id,
        category_id: cat1_1.id,
        name: 'Burger Clássico',
        description: 'Hambúrguer com queijo, alface, tomate e cebola roxa',
        price: 22.90,
        active: true,
        available: true,
        featured: false,
        allow_notes: true,
        estimated_prep_time: 12
      });
      const item1_3 = await base44.entities.MenuItem.create({
        company_id: company1.id,
        category_id: cat1_2.id,
        name: 'Batata Frita Premium',
        description: 'Batata frita crocante com sal temperado',
        price: 12.00,
        active: true,
        available: true,
        featured: false,
        allow_notes: false,
        estimated_prep_time: 8
      });

      // Extras for Burger Express Sul
      await base44.entities.MenuItemExtra.create({
        company_id: company1.id,
        menu_item_id: item1_1.id,
        name: 'Bacon Extra',
        extra_price: 5.00,
        active: true,
        sort_order: 0
      });
      await base44.entities.MenuItemExtra.create({
        company_id: company1.id,
        menu_item_id: item1_2.id,
        name: 'Ovo',
        extra_price: 3.00,
        active: true,
        sort_order: 0
      });

      // Customers for Burger Express Sul
      const cust1_1 = await base44.entities.Customer.create({
        company_id: company1.id,
        name: 'João Silva',
        phone: '(51) 98765-4321',
        address: 'Rua A, 123 — Moinhos de Vento',
        neighborhood: 'Moinhos de Vento',
        status: 'ativo',
        total_orders: 5,
        last_order_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      });
      const cust1_2 = await base44.entities.Customer.create({
        company_id: company1.id,
        name: 'Maria Oliveira',
        phone: '(51) 99876-5432',
        address: 'Av. Borges, 456 — Jardim Botânico',
        neighborhood: 'Jardim Botânico',
        status: 'ativo',
        total_orders: 3,
        last_order_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Delivery Zones for Burger Express Sul
      const zone1_1 = await base44.entities.DeliveryZone.create({
        company_id: company1.id,
        name: 'Moinhos de Vento',
        fee: 5.00,
        estimated_minutes: 20,
        active: true
      });
      const zone1_2 = await base44.entities.DeliveryZone.create({
        company_id: company1.id,
        name: 'Jardim Botânico',
        fee: 7.50,
        estimated_minutes: 25,
        active: true
      });

      // Orders for Burger Express Sul
      const order1_1 = await base44.entities.Order.create({
        company_id: company1.id,
        customer_id: cust1_1.id,
        customer_name: 'João Silva',
        customer_phone: '(51) 98765-4321',
        order_number: 'PED-001-BES',
        type: 'delivery',
        status: 'entregue',
        subtotal: 55.00,
        delivery_fee: 5.00,
        total: 60.00,
        payment_method: 'pix',
        payment_status: 'pago',
        address: 'Rua A, 123 — Moinhos de Vento',
        neighborhood: 'Moinhos de Vento',
        notes: 'Sem alface no burger',
        items_summary: JSON.stringify([
          { name: 'Smash Burger Duplo', qty: 1, price: 32.50, extras: [{ name: 'Bacon Extra', price: 5.00 }], extras_total: 5.00, notes: 'Sem alface', total: 37.50 },
          { name: 'Batata Frita Premium', qty: 1, price: 12.00, extras: [], extras_total: 0, notes: '', total: 12.00 }
        ]),
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        delivered_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString()
      });

      const order1_2 = await base44.entities.Order.create({
        company_id: company1.id,
        customer_id: cust1_2.id,
        customer_name: 'Maria Oliveira',
        customer_phone: '(51) 99876-5432',
        order_number: 'PED-002-BES',
        type: 'delivery',
        status: 'novo',
        subtotal: 45.00,
        delivery_fee: 7.50,
        total: 52.50,
        payment_method: 'dinheiro',
        payment_status: 'pendente',
        address: 'Av. Borges, 456 — Jardim Botânico',
        neighborhood: 'Jardim Botânico',
        notes: '',
        items_summary: JSON.stringify([
          { name: 'Burger Clássico', qty: 2, price: 22.90, extras: [], extras_total: 0, notes: '', total: 45.80 }
        ]),
        created_at: new Date().toISOString()
      });

      // Riders for Burger Express Sul
      const rider1_1 = await base44.entities.Rider.create({
        company_id: company1.id,
        name: 'Carlos Mendes',
        phone: '(51) 99111-1111',
        vehicle_type: 'moto',
        active: true
      });

      // Financial Entries for Burger Express Sul
      await base44.entities.FinancialEntry.create({
        company_id: company1.id,
        type: 'entrada',
        category: 'Vendas',
        description: 'Pedido PED-001-BES - Burger Express',
        amount: 60.00,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concluido',
        reference_order_id: order1_1.id
      });
    }

    // Pizza Norte Delivery
    if (!slugs.includes('pizza-norte-delivery')) {
      const company2 = await base44.entities.Company.create({
        name: 'Pizza Norte Delivery',
        slug: 'pizza-norte-delivery',
        phone: '(92) 3333-4444',
        address: 'Av. Noel Nutels, 2000 — Manaus, AM',
        status: 'ativo',
        plan_name: 'basico',
        onboarding_completed: true,
        onboarding_step: 6,
        business_hours: {
          monday: '17:00-23:30',
          tuesday: '17:00-23:30',
          wednesday: '17:00-23:30',
          thursday: '17:00-23:30',
          friday: '17:00-00:30',
          saturday: '17:00-00:30',
          sunday: '17:00-23:30'
        },
        average_prep_time: 30,
        primary_color: '#FF6B35',
        secondary_color: '#FFF3B0'
      });
      companies.push(company2);

      // Categories for Pizza Norte Delivery
      const cat2_1 = await base44.entities.MenuCategory.create({
        company_id: company2.id,
        name: 'Pizzas',
        sort_order: 0,
        active: true
      });
      const cat2_2 = await base44.entities.MenuCategory.create({
        company_id: company2.id,
        name: 'Bebidas',
        sort_order: 1,
        active: true
      });

      // Menu Items for Pizza Norte Delivery
      const item2_1 = await base44.entities.MenuItem.create({
        company_id: company2.id,
        category_id: cat2_1.id,
        name: 'Pizza Calabresa',
        description: 'Pizza grande com molho, calabresa, cebola e queijo derretido',
        price: 45.00,
        active: true,
        available: true,
        featured: true,
        allow_notes: true,
        estimated_prep_time: 30
      });
      const item2_2 = await base44.entities.MenuItem.create({
        company_id: company2.id,
        category_id: cat2_1.id,
        name: 'Pizza Margherita',
        description: 'Pizza com molho, tomate, queijo e manjericão fresco',
        price: 38.00,
        active: true,
        available: true,
        featured: false,
        allow_notes: true,
        estimated_prep_time: 28
      });
      const item2_3 = await base44.entities.MenuItem.create({
        company_id: company2.id,
        category_id: cat2_2.id,
        name: 'Refrigerante 2L',
        description: 'Refrigerante gelado em garrafa de 2 litros',
        price: 9.90,
        active: true,
        available: true,
        featured: false,
        allow_notes: false,
        estimated_prep_time: 2
      });

      // Extras for Pizza Norte Delivery
      await base44.entities.MenuItemExtra.create({
        company_id: company2.id,
        menu_item_id: item2_1.id,
        name: 'Borda Recheada',
        extra_price: 8.00,
        active: true,
        sort_order: 0
      });

      // Customers for Pizza Norte Delivery
      const cust2_1 = await base44.entities.Customer.create({
        company_id: company2.id,
        name: 'Pedro Souza',
        phone: '(92) 98888-7777',
        address: 'Rua B, 789 — Centro',
        neighborhood: 'Centro',
        status: 'ativo',
        total_orders: 8,
        last_order_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      });
      const cust2_2 = await base44.entities.Customer.create({
        company_id: company2.id,
        name: 'Ana Costa',
        phone: '(92) 99999-8888',
        address: 'Av. Principal, 555 — Ponta Negra',
        neighborhood: 'Ponta Negra',
        status: 'ativo',
        total_orders: 2,
        last_order_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Delivery Zones for Pizza Norte Delivery
      const zone2_1 = await base44.entities.DeliveryZone.create({
        company_id: company2.id,
        name: 'Centro',
        fee: 4.00,
        estimated_minutes: 25,
        active: true
      });
      const zone2_2 = await base44.entities.DeliveryZone.create({
        company_id: company2.id,
        name: 'Ponta Negra',
        fee: 6.00,
        estimated_minutes: 30,
        active: true
      });

      // Orders for Pizza Norte Delivery
      const order2_1 = await base44.entities.Order.create({
        company_id: company2.id,
        customer_id: cust2_1.id,
        customer_name: 'Pedro Souza',
        customer_phone: '(92) 98888-7777',
        order_number: 'PED-001-PND',
        type: 'delivery',
        status: 'pronto',
        subtotal: 53.00,
        delivery_fee: 4.00,
        total: 57.00,
        payment_method: 'cartao',
        payment_status: 'pago',
        address: 'Rua B, 789 — Centro',
        neighborhood: 'Centro',
        notes: 'Deixar com porteiro',
        items_summary: JSON.stringify([
          { name: 'Pizza Calabresa', qty: 1, price: 45.00, extras: [{ name: 'Borda Recheada', price: 8.00 }], extras_total: 8.00, notes: '', total: 53.00 }
        ]),
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      });

      const order2_2 = await base44.entities.Order.create({
        company_id: company2.id,
        customer_id: cust2_2.id,
        customer_name: 'Ana Costa',
        customer_phone: '(92) 99999-8888',
        order_number: 'PED-002-PND',
        type: 'delivery',
        status: 'novo',
        subtotal: 47.90,
        delivery_fee: 6.00,
        total: 53.90,
        payment_method: 'pix',
        payment_status: 'pendente',
        address: 'Av. Principal, 555 — Ponta Negra',
        neighborhood: 'Ponta Negra',
        notes: '',
        items_summary: JSON.stringify([
          { name: 'Pizza Margherita', qty: 1, price: 38.00, extras: [], extras_total: 0, notes: '', total: 38.00 },
          { name: 'Refrigerante 2L', qty: 1, price: 9.90, extras: [], extras_total: 0, notes: '', total: 9.90 }
        ]),
        created_at: new Date().toISOString()
      });

      // Riders for Pizza Norte Delivery
      const rider2_1 = await base44.entities.Rider.create({
        company_id: company2.id,
        name: 'Roberto Lima',
        phone: '(92) 99222-2222',
        vehicle_type: 'moto',
        active: true
      });

      // Financial Entries for Pizza Norte Delivery
      await base44.entities.FinancialEntry.create({
        company_id: company2.id,
        type: 'entrada',
        category: 'Vendas',
        description: 'Pedido PED-001-PND - Pizza Norte',
        amount: 57.00,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concluido',
        reference_order_id: order2_1.id
      });
    }

    return Response.json({
      success: true,
      message: `Seed completed. Created ${companies.length} demo companies.`,
      companies: companies.map(c => ({ id: c.id, name: c.name, slug: c.slug }))
    });
  } catch (error) {
    console.error('Seed error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});