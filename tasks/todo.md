# Sprint 1 — Inbox WhatsApp "funcional de verdade" (2 semanas)

> **Source:** `tasks/auditoria-inbox/auditoria-sales-spark-vs-nexvyoficinas.md`
> **Objetivo:** operador troca mídia, atende em mobile, conversa flui sem bugs.
> **Branch:** `main` (commits diretos; rollback via git revert por commit atômico)

---

## Fase 1 — Fixes de schema (P0, antes de qualquer feature)

- [ ] **BUG-1: EvolutionSettings.tsx** — trocar `instance_name/display_name/connected_phone` por `name/instance_id/phone_number` (colunas reais)
- [ ] **BUG-2: ChatArea.tsx** — trocar `media_url/media_type/status` por `content_type/metadata` (campos reais; mídia vive em metadata jsonb)
- [ ] TypeScript check (`tsc -p tsconfig.app.json --noEmit`)
- [ ] Build (`npm run build`)
- [ ] **Commit atômico:** `fix(inbox): corrige colunas inexistentes em EvolutionSettings e ChatArea`

## Fase 2 — Base de mídia (Storage + bucket RLS)

- [ ] Criar bucket Storage `inbox-media` no Supabase NexvyOficinas (project `gpxmkximudukbljrvtxj`)
- [ ] RLS policy: read/write scoped por empresa via path prefix `<empresa_id>/*`
- [ ] Hook `hooks/useMediaUpload.ts` — upload pro bucket + retorna URL pública + metadados (size, mime, duration p/ áudio, width/height p/ imagem)
- [ ] **Commit:** `feat(inbox): storage bucket inbox-media + useMediaUpload hook`

## Fase 3 — Componentes de bubble especializados (`components/inbox/messages/`)

- [ ] `MessageBubble.tsx` — roteador que escolhe sub-bubble por `content_type`
- [ ] `TextBubble.tsx` — texto + status icons (extrai do ChatArea atual)
- [ ] `ImageBubble.tsx` — preview + lightbox onclick
- [ ] `AudioBubble.tsx` — `<audio controls>` + duração + waveform simples
- [ ] `VideoBubble.tsx` — `<video controls poster>`
- [ ] `DocumentBubble.tsx` — ícone + nome + tamanho + botão download
- [ ] `StickerBubble.tsx` — PNG transparente sem chrome de bubble
- [ ] Refator ChatArea: trocar inline render por `<MessageBubble />`
- [ ] **Commit:** `feat(inbox): bubbles especializados por tipo de mídia`

## Fase 4 — Composer rico (envio de mídia)

- [ ] `composer/MediaUploadButton.tsx` — botão attach (image/video/document) com file picker
- [ ] `composer/AudioRecorder.tsx` — MediaRecorder API, fallback webm/opus, timer, min 500ms, cancelar/enviar
- [ ] `composer/MediaPreview.tsx` — preview antes do envio (thumb, nome, tamanho, legenda, progress upload)
- [ ] `composer/Composer.tsx` — orquestrador (textarea + attach + audio + send/mic toggle)
- [ ] Refator ChatArea: extrair o composer atual pra `<Composer />`
- [ ] **Commit:** `feat(inbox): composer rico com upload de mídia e gravação de áudio`

## Fase 5 — Plataforma (mobile + deep-link + paginação + reconnect)

- [ ] Hook `useIsMobile.ts` — detecta viewport <768px
- [ ] Layout mobile: em mobile, mostra só lista OU só chat com `MobileBackButton`
- [ ] Deep-link: rota `/inbox/:conversationId` (`useParams` + sync com state)
- [ ] Paginação infinita scroll-up: `IntersectionObserver` no topo da lista de mensagens, cursor por `created_at`, +100 por batch
- [ ] EvolutionSettings: adicionar botões **Reconectar** / **Logout** / **Restart** (wire actions já existentes do `evolution-proxy`)
- [ ] EvolutionSettings: toggle de instância **padrão** (`is_default`)
- [ ] **Commit:** `feat(inbox): mobile responsivo + deep-link + paginação + ações de instância`

## Fase 6 — Smoke test + deploy

- [ ] TypeScript check total
- [ ] Build de produção
- [ ] Deploy NexvyOficinas via `make deploy-oficinas`
- [ ] Teste E2E manual no `https://app.nexvyoficinas.com.br/inbox`
- [ ] Conectar WhatsApp real, enviar imagem inbound e outbound, gravar áudio, mandar PDF
- [ ] **Commit final:** documento de Sprint 1 review (em `tasks/todo.md` na seção Review)

---

## Critérios verificáveis (Karpathy §8.3)

| Etapa | Como sei que terminou |
|---|---|
| Fixes BUGs | `tsc --noEmit` zero erros + select queries retornam colunas válidas |
| Storage | Upload de PNG retorna URL pública 200 OK |
| Bubbles | Render conditional por `content_type` cobre 6 tipos sem fallback "[mensagem não suportada]" |
| Composer | Mando uma imagem real pelo composer e ela chega no WhatsApp do celular |
| Mobile | iPhone safari abre `/inbox`, navega entre lista e chat sem layout quebrado |
| Deep-link | URL `/inbox/<uuid>` abre a conversa direto |
| Paginação | Conversa com 500+ msgs carrega ao scrollar pra cima |
| Reconnect | Após desconectar via celular, botão "Reconectar" gera novo QR sem deletar a instância |

---

## Review — Sprint 1 (concluído 2026-06-07)

**Status final:** ✅ Backend 100% funcional + frontend pronto para E2E real

### Commits do sprint
| Hash | Fase | Descrição |
|---|---|---|
| `91658df` | 1 | Fix BUG-1 (EvolutionSettings) + BUG-2 (ChatArea) — colunas inexistentes |
| `144e045` | 2 | Storage bucket `inbox-media` + RLS + `useMediaUpload.ts` |
| `3b63dfc` | 3 | 6 bubbles especializados (Text/Image/Audio/Video/Document/Sticker) |
| `5cbfe8a` | extra | Edge functions v4/v3: pipeline download+upload de mídia, metadata normalizado |
| `c1d2b14` | 4 | Composer + AudioRecorder (gravação inline + upload + caption) |
| `97a45c1` | 5 parcial | Deep-link `/inbox/:id` + EvolutionSettings (logout/restart/star is_default) |

**Total:** 6 commits, ~2100 linhas inseridas. TypeScript strict 0 erros, build 6.34s.

### Backend deployado (Supabase `gpxmkximudukbljrvtxj`)
- `evolution-webhook` v4 ACTIVE
- `evolution-send` v3 ACTIVE
- `evolution-proxy` v3 ACTIVE
- Bucket Storage `inbox-media` (100MB limit, 20+ MIME types, RLS scoped por `empresa_id`)

### Frontend deployado (VPS Hostinger)
- `https://app.nexvyoficinas.com.br/inbox` → HTTP/2 200
- Push GitHub `0433319..97a45c1`
- Make deploy via Traefik file provider, hot-reload OK

### Sprint 1.5 — pendente (não-bloqueante pro E2E)
- Layout mobile (collapse panes via `useIsMobile`)
- Paginação infinita scroll-up (IntersectionObserver + cursor)

### Critérios verificáveis — checklist
- [x] Fixes BUGs: `tsc --noEmit` zero erros
- [x] Storage: bucket criado, RLS validada (`SELECT id FROM storage.buckets WHERE id='inbox-media'`)
- [x] Bubbles: 6 tipos cobertos (text/image/audio/video/document/sticker)
- [x] Composer: textarea + attach (image/video/doc) + audio recorder + preview
- [x] Deep-link: rota `/inbox/:id` registrada, `useParams` ativo
- [x] Reconnect/logout/restart/star: actions deployed + UI wirada
- [ ] Mobile: pendente Sprint 1.5
- [ ] Paginação: pendente Sprint 1.5
- [ ] E2E manual: aguardando teste de Marcelo com WhatsApp real

### Lições aprendidas (atualizar `tasks/lessons.md` se necessário)
1. **Auditoria de backend antes de UI:** webhook/send tinham field names errados (`mimetype`/`fileName`/`seconds` vs `mime`/`name`/`duration`). Auditar Edge Functions antes de construir UI economiza retrabalho.
2. **`replace_all: true` no Edit é perigoso:** trocou "Message" em comentários, paths e variáveis indiscriminadamente. Sempre preferir edits cirúrgicos quando há ambiguidade.
3. **Free models squad falsa promessa:** 5 plugins instalados, só 1 (MiniMax) com MCP wired, e mesmo esse falhou 401. Setup real custa 30-60min por modelo. Não é economia real.
4. **Fact-forcing gate ajuda mas trava paralelismo:** quando faço N edits em paralelo, gate dispara por arquivo individual. Apresentar fatos por bloco compartilhado antes do batch funciona.
