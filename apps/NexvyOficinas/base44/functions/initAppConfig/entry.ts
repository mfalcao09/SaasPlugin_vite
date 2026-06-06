/**
 * Função para inicializar AppConfig com super admin emails
 * Executar uma única vez na primeira execução
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verificar se já existe AppConfig
    const existing = await base44.entities.AppConfig.list();
    if (existing.length > 0) {
      return Response.json({ message: "AppConfig já existe" });
    }

    // Criar AppConfig inicial
    const appConfig = await base44.entities.AppConfig.create({
      app_name: "AutoFlow AI",
      super_admin_emails: ["luis.bedinot@gmail.com", "lp_bedinot@hotmail.com"],
      system_settings: {
        version: "1.0.0",
        initialized_at: new Date().toISOString(),
      },
    });

    return Response.json({
      success: true,
      message: "AppConfig criado com sucesso",
      data: appConfig,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});