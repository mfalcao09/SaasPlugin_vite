# Evolution 2.3.7 — patch PN→LID (first-touch frio da Camila)

## Por quê

O envio frio da Camila por PN falha com **WhatsApp 463** (`NackCallerReachoutTimelocked`).
Entrega estável só por `@lid` — que a Evolution **stock** só conhece **depois** que o lead responde.
Este patch faz o `POST /chat/whatsappNumbers` **devolver o `lid` de número frio** (resolvido via USync
`getLIDsForPNs`, já presente no baileys `7.0.0-rc.9` embarcado na 2.3.7). Com o `lid` no response, o
`platform-evolution-send` roteia o first-touch por `@lid`.

Referências: `docs`/Downloads `problema-pn-463-camila-whatsapp.md` (COMPLEMENTO) · Evolution
[#2629](https://github.com/evolution-foundation/evolution-api/issues/2629) · Baileys
[#2441](https://github.com/WhiskeySockets/Baileys/issues/2441) / [#2683](https://github.com/WhiskeySockets/Baileys/issues/2683).

## O que o patch faz (2 edits, ancorados por string única)

- **Edit A** — após o `onWhatsApp()` fresco em `whatsappNumber()`, resolve PN→LID em lote via
  `this.client.signalRepository.lidMapping.getLIDsForPNs()` e monta `nexvyLidByPn` (mapa por **MSISDN
  completo canonicalizado** via `nexvyCanon`, que remove o 9º dígito móvel BR — chave por número
  inteiro, nunca por cauda de 8, para não colidir entre DDDs). Envolvido em `try/catch` → **no-op se a
  API do baileys mudar** (degrada para o comportamento stock, `lid: undefined`).
- **Edit B** — preenche o 5º parâmetro (`lid`) do `OnWhatsAppDto` na verificação fresca, que hoje é
  `undefined`.

O campo `lid` **já existe** no DTO — o patch só para de descartá-lo.

## Como aplicar (NÃO deploya)

```bash
# só clona + aplica + valida:
bash infra/evolution-lid-patch/apply-and-build.sh

# clona + aplica + docker build (imagem local, ainda sem push/deploy):
DO_BUILD=1 bash infra/evolution-lid-patch/apply-and-build.sh
```

Pré-condições fail-closed: aborta se `baileys != 7.0.0-rc.9`, se o anchor não for único, ou se já
estiver aplicado. O `docker build` é o compile-gate completo do fonte patchado.

## Deploy ao VPS — ATO DE PRODUÇÃO, GATED (aprovação do Marcelo)

O pipeline da Evolution é manual (ver memória `reference_deploy_pipeline_nexvybeauty_vps`). Sequência
sugerida, a executar **só após aprovação** e **anunciando à controladora antes**:

1. `DO_BUILD=1 … apply-and-build.sh` → imagem `nexvy/evolution-api:2.3.7-lidpatch`.
2. Levar a imagem ao VPS (registry ou `docker save | ssh vps-hostinger docker load`).
3. Apontar o container da Evolution para a nova tag e subir — **em janela**, com a instância
   `camila-prospecativa-v5` já `connected` (o patch não mexe em pareamento).
4. **Smoke pós-deploy**: sonda `POST /chat/whatsappNumbers/camila-prospecativa-v5` com número frio →
   response deve conter `lid`. (Antes do patch: campo ausente.)

## Check binário do first-touch (o teste que fecha o épico)

Com a imagem patchada no ar **e** o `platform-evolution-send` deployado:

> lead **frio** (sem conversa) → `POST platform-evolution-send` type=text →
> resposta com `used_lid: true` e o Evolution devolve **`DELIVERY_ACK`**, **zero 463**.

Rodar primeiro com **um número controlado do próprio Marcelo**, não com lead real. Lembrete: o
reach-out timelock existe mesmo endereçando certo — **manter volume baixo** (rampa do doc).

## Rollback

Trocar a tag do container de volta para a imagem stock `2.3.7` e subir. O patch é inerte fora do fluxo
Camila; o `platform-evolution-send` já degrada para 409 `lid_required` se o `lid` não vier — nenhuma
dependência dura na imagem patchada.
