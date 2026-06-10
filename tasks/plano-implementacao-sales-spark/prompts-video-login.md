# Prompts — Vídeo de fundo do login (institucional ritmado)

> **Estilo decidido:** conteúdo de oficina viva (identificação, como as referências Mandarine/Sapienz), ritmo controlado — takes de 1,5–3s, loop final de 12–18s, cortes por frames escuros, grade escura unificada, sem rostos nem marcas.
> **Como funciona:** as ferramentas de IA geram **1 take por vez** (5–10s cada). Você gera os takes abaixo, me manda os arquivos, e **eu monto o loop** (ffmpeg: cortes, transições por escuro, selagem do loop, compressão pra ~3–5MB 1080p/24fps), hospedo no bucket `platform-assets` e plugo no `BRAND.backgroundVideo`.
> **Ferramentas:** prompts em inglês (os modelos respondem melhor). Funcionam em Veo, Sora, Kling, Runway. Config por take: **16:9 · 1080p · 5s** (uso 2–3s de cada).

---

## Bloco de estilo global (cole ANTES de cada take, garante consistência)

```
Cinematic commercial footage inside a premium dark auto repair shop at night.
Moody low-key lighting: warm amber/orange rim lights and work lamps against
deep dark teal shadows. High contrast, shallow depth of field, filmic grain,
24fps motion blur. Camera moves are smooth and deliberate (slow push, slider,
or locked-off). NO human faces, NO readable logos or text, NO shaky handheld.
Dark frames at start and end of the shot.
```

## Os 8 takes — NexvyOficinas

| # | Take | Prompt (após o bloco global) |
|---|---|---|
| 1 | Carro no elevador | `A modern sports sedan slowly descending on a two-post car lift, dramatic underlight glow, sparks of dust in the light beams.` |
| 2 | Faísca (energia) | `Close-up of an angle grinder briefly touching metal, a short burst of orange sparks flying in slow motion against darkness.` |
| 3 | Torque na roda | `Macro shot of an impact wrench tightening lug nuts on a glossy alloy wheel, tool light reflections, fast rotational motion.` |
| 4 | Diagnóstico | `Gloved hands plugging an OBD diagnostic scanner under a dashboard, scanner screen glow illuminating the dark cabin.` |
| 5 | Capô abrindo | `A car hood opening slowly revealing a clean engine bay lit by a single warm work light, light rays through light haze.` |
| 6 | Detalhe de roda | `Slow camera slide along a premium wheel and brake caliper, reflections of warm shop lights moving across the rim.` |
| 7 | Painel acende | `Car dashboard and headlights powering on in a dark garage, instrument cluster glowing, lens flare from headlights.` |
| 8 | Selo do loop | `Wide shot of the dark workshop, a single warm light flickering on over a car silhouette, volumetric light, then fading toward dark.` |

> **Dica de geração:** gere 2 variações dos seus 6 favoritos e me mande tudo — na montagem eu escolho os melhores 6–8. Takes que terminarem claros demais eu resolvo com fade no corte.

---

## STATUS (2026-06-10) — modelo escolhido: **VEO** · MCP bloqueado, geração via site

- **Magnific MCP:** entitlement bugado (conta Premium+ mas API diz "non-premium"). Pipeline = Marcelo gera no **site** magnific.com → manda arquivos → eu monto local (ffmpeg). MCP em aberto com suporte deles.
- **Take ① (elevador): FEITO.** Piloto VEO escolhido (venceu o Kling: mais escuro/âmbar, sem marca). Processado em `apps/NexvyOficinas/public/login-bg.mp4` (1.1MB, loop c/ fade) + `login-poster.jpg`. Plugado em `Login.tsx` (BRAND.backgroundVideo/Image). **Ainda não deployado** — aguardando os 7 restantes p/ subir o loop completo de uma vez.
- **Regra anti-marca (lição do Kling):** VEO às vezes renderiza carro de marca real + placa. Prompts abaixo reescritos p/ **silhueta/parcial, sem logo/placa/texto**. Se escapar, corto/desfoco na montagem.

### Prompts VEO prontos (takes ②–⑧) — 16:9 · 1080p · 5s

② Faísca: `Cinematic commercial macro footage inside a premium dark auto repair shop at night. Extreme close-up of an angle grinder briefly touching a metal part, a short burst of bright orange sparks arcing in slow motion against deep black shadows. Warm amber work-lamp glow rims the metal, fine sparks trailing through the air, shallow depth of field, filmic grain, subtle 24fps motion blur, locked-off camera. No people, no faces, no readable text or logos. The shot begins and ends on darker frames.`

③ Torque na roda: `Cinematic commercial macro footage inside a premium dark auto repair shop at night. Close-up of an impact wrench tightening a lug nut on a glossy dark alloy wheel, fast rotational motion, warm amber tool-light reflections sweeping across the rim and brake caliper. Deep teal shadows, high contrast, shallow depth of field, filmic grain, 24fps motion blur, smooth slow camera. Generic unbranded wheel, no logos, no people, no faces, no readable text. The shot begins and ends on darker frames.`

④ Diagnóstico: `Cinematic commercial footage inside a premium dark auto repair shop at night. Gloved hands plug an OBD diagnostic scanner connector under a car dashboard, the scanner screen glow softly lighting the dark cabin with cool light against warm amber ambience. Shallow depth of field, filmic grain, 24fps motion blur, slow push-in. No visible face, no readable text or brand logos on the screen, no recognizable car badge. The shot begins and ends on darker frames.`

⑤ Capô abrindo: `Cinematic commercial footage inside a premium dark auto repair shop at night. A car hood slowly opens, revealing a clean engine bay lit by a single warm amber work light, soft light rays cutting through faint haze, dust particles drifting. Deep dark teal background shadows, high contrast, shallow depth of field, filmic grain, 24fps motion blur, smooth deliberate upward camera. Generic engine, no people, no faces, no readable logos or text. The shot begins and ends on darker frames.`

⑥ Detalhe de roda: `Cinematic commercial footage inside a premium dark auto repair shop at night. Slow smooth camera slide along a premium dark alloy wheel and brake caliper, warm amber shop-light reflections gliding across the glossy rim, deep teal shadows behind. Shallow depth of field, filmic grain, 24fps motion blur. Unbranded wheel, no logos, no people, no faces, no readable text. The shot begins and ends on darker frames.`

⑦ Painel acende: `Cinematic commercial footage inside a premium dark auto repair shop at night. A car dashboard and instrument cluster power on in the dark, gauges and ambient lighting glowing warm amber, faint lens flare from the cluster, soft reflections on the windshield. Shallow depth of field, filmic grain, 24fps motion blur, slow push-in. No visible face, no readable text or brand logos, no recognizable badge. The shot begins and ends on darker frames.`

⑧ Selo do loop: `Cinematic commercial wide shot of a premium dark auto repair shop at night, a single warm amber work light flickers on over the silhouette of a car on a lift, volumetric light beams and drifting dust, then the light gently dims toward darkness. Deep teal shadows, high contrast, filmic grain, 24fps motion blur, very slow camera. Car as pure silhouette, no brand, no logos, no people, no faces, no readable text. The shot starts dark, briefly glows, and ends fading to black.`

**Arco de montagem:** ① elevador → ② faísca → ③ torque → ⑥ roda → ⑤ capô → ④ scanner → ⑦ painel → ⑧ selo (fecha no escuro, reemenda no ①). Alvo ~14–16s.

---

## Variações pros outros 4 SaaS (mesma régua, quando cascatear)

**BarbeiroPro** — bloco global: `premium vintage barbershop at night, warm tungsten light, leather and wood textures, deep shadows` · takes: navalha afiando na correia (faísca = spray d'água), cadeira girando lenta, tesoura em macro contraluz, toalha quente com vapor, máquina ligando com luz pontual, luminoso interno piscando.

**NexvyBeauty** — `elegant beauty salon at night, hollywood mirror bulbs, soft warm glow, dark interior, pink-tinged highlights` · takes: lâmpadas do espelho acendendo em sequência, secador com fios de cabelo em contraluz, esmalte em macro, cadeira de salão sob spot, produtos em prateleira com luz deslizando.

**NexvyFoods** — `professional dark kitchen, chiaroscuro lighting, flames and steam, stainless steel reflections` · takes: chama do fogão subindo, frigideira flambando, vapor sobre a passe, mãos finalizando prato (sem rosto), comanda impressa saindo, brasa acesa em macro.

**NexvyGYM** — `dark performance gym, hard single-source spotlights, lime-green accent glow, haze in the air` · takes: anilha encaixando na barra, corda batendo no chão em câmera lenta, giz explodindo nas mãos (sem rosto), esteira acendendo o painel, kettlebell em contraluz com poeira.

---

## Workflow após a geração

1. Você gera os takes e me manda os arquivos (qualquer formato; pode ser pelo Downloads).
2. Eu monto: corte nos frames escuros, ordem com arco (abre no elevador → energia → detalhe → fecha no selo do loop), loop sem emenda visível, compressão H.264 1080p/24 alvo 3–5MB.
3. Hospedo no bucket `platform-assets` (público, já existe) e plugo a URL no `BRAND.backgroundVideo` + um frame bom como `backgroundImage` (poster/fallback mobile).
4. Deploy → você vê no login real. Ajustes de ordem/ritmo são re-montagem local, minutos.
