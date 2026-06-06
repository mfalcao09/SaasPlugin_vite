import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if AppConfig already exists
    const configs = await base44.entities.AppConfig.list();
    
    if (configs.length > 0) {
      return Response.json({
        success: true,
        message: 'AppConfig already exists',
        config: configs[0]
      });
    }

    // Create initial AppConfig
    const config = await base44.entities.AppConfig.create({
      app_name: 'FoodControl AI',
      super_admin_emails: ['luis.bedinot@gmail.com', 'lp_bedinot@hotmail.com'],
      system_settings: {}
    });

    return Response.json({
      success: true,
      message: 'AppConfig created successfully',
      config
    });
  } catch (error) {
    console.error('Seed error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});