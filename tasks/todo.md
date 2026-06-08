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

## Review (preenchido ao final do Sprint)

(pendente)
