# Secrets / Environment Variables

> Apenas **nomes** — valores precisam ser configurados manualmente no novo ambiente.
> Lista extraída de `Deno.env.get(...)` em todas as edge functions do projeto.

## Auto-injetadas pela Supabase (não precisa criar manualmente)
| Nome | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | Chave pública (anon) |
| `SUPABASE_PUBLISHABLE_KEY` | Alias da anon nas funções novas |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service-role (usada por funções admin, cron, queue) |

## Lovable / IA
| Nome | Uso |
|---|---|
| `LOVABLE_API_KEY` | Lovable AI Gateway (LLM padrão usado pelo agente/copiloto/cadência/funil/quiz). Gerenciado pelo Lovable em projetos Cloud. |
| `LOVABLE_SEND_URL` | Endpoint usado pelo `process-email-queue` para enviar emails via Lovable Emails. |
| `OPENAI_API_KEY` | Provider OpenAI direto (usado quando `org_ai_routing` aponta para `openai` em vez do gateway) |

## Email
| Nome | Uso |
|---|---|
| `RESEND_API_KEY` | Envio de email transacional/auth via Resend (fallback opcional ao Lovable Emails) |

## Voz / Áudio
| Nome | Uso |
|---|---|
| `ELEVENLABS_API_KEY` | Transcrição (Scribe v2) e voz nas chamadas e Copilot multimodal |

## Scraping / Conhecimento
| Nome | Uso |
|---|---|
| `FIRECRAWL_API_KEY` | Crawl/scrape de sites para alimentar a Brain dos produtos (funções `firecrawl-*` e `process-knowledge-source`) |

## WhatsApp
| Nome | Uso |
|---|---|
| `BOTCONVERSA_API_KEY` | Integração BotConversa (provedor WhatsApp legacy, somente API). Por organização normalmente, mas pode ter fallback global. |
| `ISICHAT_TOKEN` | Token genérico para integração Isichat (provedor WhatsApp alternativo) |

## Bootstrap / Operacional
| Nome | Uso |
|---|---|
| `SUPER_ADMIN_EMAIL` | Email que `bootstrap-super-admin` / `auto-promote-super-admin` / `ensure-default-super-admin` promovem a `super_admin` ao logar |
| `SITE_URL` | URL pública do app, usada em links em emails e webhooks |
| `VITE_SUPABASE_URL` | Apenas referenciada em uma função; mesmo valor de `SUPABASE_URL` |

## Secrets esperados, mas **não usados em código** atualmente
> O usuário citou Anthropic, Gemini, Cakto, Hotmart, Doppus, Sankhya, Google OAuth, Facebook.
> Verificação: nenhuma `Deno.env.get(...)` para essas credenciais. As respectivas integrações leem
> as credenciais por organização nas tabelas:
> - `org_ai_credentials` → Anthropic, Gemini, OpenAI (por org)
> - `cakto_credentials` → Cakto (por org)
> - `hotmart_credentials` → Hotmart (por org)
> - `evolution_instances` → Evolution Go API key (por instância)
> - `google_calendar_connections` → tokens OAuth Google por usuário
> - `facebook_lead_integrations` → tokens Facebook por org
> - `platform_settings.evolution_go_global_api_key` → Evolution global
>
> Portanto **não há secret global** para essas; tudo é configurado por org/usuário via UI.
>
> Google OAuth client_id/secret é configurado dentro do dashboard Supabase (Auth → Providers), não como secret do projeto.
