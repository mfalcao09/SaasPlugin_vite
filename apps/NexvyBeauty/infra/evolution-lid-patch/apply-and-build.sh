#!/usr/bin/env bash
# ============================================================================
# NEXVY — Patch Evolution 2.3.7: expor `lid` no POST /chat/whatsappNumbers
# ============================================================================
# PROBLEMA: first-touch frio da Camila falha com WhatsApp 463
# (NackCallerReachoutTimelocked) ao enviar por PN; só entrega estável por @lid,
# que a Evolution STOCK só conhece DEPOIS que o lead responde.
#
# ESTE PATCH: no whatsappNumber(), resolve PN→LID via USync
# (signalRepository.lidMapping.getLIDsForPNs — já presente no baileys 7.0.0-rc.9
# embarcado na 2.3.7) e preenche o campo `lid` do OnWhatsAppDto (que já existe
# mas vem `undefined` na verificação fresca). Com isso, whatsappNumbers passa a
# devolver o LID de número FRIO, sem interação prévia.
#
# Fonte: doc problema-pn-463-camila-whatsapp.md (COMPLEMENTO) · Evolution #2629 ·
#        Baileys #2441/#2683. Ancoragem por string única (resiste a drift).
#
# ⚠️  NÃO faz deploy. Só clona, aplica o patch, valida e (opcional) builda a imagem.
#     O push da imagem e o restart do container no VPS são ATOS DE PRODUÇÃO,
#     gated na aprovação do Marcelo (ver README.md desta pasta).
# ----------------------------------------------------------------------------
set -euo pipefail

EVO_TAG="${EVO_TAG:-2.3.7}"
WORKDIR="${WORKDIR:-/tmp/evolution-lid-patch}"
IMAGE_TAG="${IMAGE_TAG:-nexvy/evolution-api:2.3.7-lidpatch}"
DO_BUILD="${DO_BUILD:-0}"   # 1 = roda docker build ao final
SVC="src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts"

echo "==> Evolution tag=$EVO_TAG  workdir=$WORKDIR  image=$IMAGE_TAG  build=$DO_BUILD"
rm -rf "$WORKDIR"
git clone --quiet --depth 1 --branch "$EVO_TAG" \
  https://github.com/EvolutionAPI/evolution-api.git "$WORKDIR"
cd "$WORKDIR"

# --- Pré-condições (fail-closed) -------------------------------------------
grep -q '"baileys": "7.0.0-rc.9"' package.json \
  || { echo "!! baileys != 7.0.0-rc.9 no package.json — abortando (patch validado só p/ rc.9)"; exit 3; }
ANCHOR_RETURN='contacts.find((c) => c.remoteJid === numberJid)?.pushName,'
[ "$(grep -c "$ANCHOR_RETURN" "$SVC")" = "1" ] \
  || { echo "!! anchor de retorno não é único — o service mudou; revise o patch"; exit 4; }
grep -q 'verify = await this.client.onWhatsApp(...normalNumbersNotInCache);' "$SVC" \
  || { echo "!! anchor do onWhatsApp fresco ausente — abortando"; exit 4; }
grep -q 'NEXVY PATCH' "$SVC" && { echo "!! patch já aplicado — abortando"; exit 5; }

# --- Edit A: bloco de resolução PN→LID após o onWhatsApp fresco -------------
perl -0777 -i -pe '
  my $ins = <<'"'"'JS'"'"';
      verify = await this.client.onWhatsApp(...normalNumbersNotInCache);
    }

    // [NEXVY PATCH v1 | PN->LID pre-reply] Resolve o LID (USync) dos numeros
    // normais para que whatsappNumbers exponha `lid` e o first-touch frio possa
    // ir por @lid (sem 463). Fonte: doc problema-pn-463 + Evolution #2629.
    // No-op via try/catch se a API do baileys mudar -> degrada p/ stock (lid undefined).
    const nexvyLidByPn: Record<string, string> = {};
    // Chave por MSISDN COMPLETO canonicalizado (nao por cauda de 8 digitos): dois
    // numeros de DDDs diferentes com mesmo sufixo NAO podem colidir. Canon remove o
    // 9o digito movel BR (55+DDD+9+8=13 -> 12) p/ casar a variante que o getLIDsForPNs
    // devolve vs o numberJid verificado. Nao-BR: digitos como estao.
    const nexvyCanon = (d: string): string => {
      const s = String(d || "").replace(/\D/g, "");
      return (s.length === 13 && s.startsWith("55") && s[4] === "9")
        ? s.slice(0, 4) + s.slice(5)
        : s;
    };
    try {
      const sr: any = (this.client as any)?.signalRepository;
      if (sr?.lidMapping?.getLIDsForPNs && jids.users.length > 0) {
        const pnJids = jids.users
          .map(({ jid }) => jid)
          .filter((j) => j.includes("@s.whatsapp.net"));
        const mappings = pnJids.length ? await sr.lidMapping.getLIDsForPNs(pnJids) : [];
        for (const m of mappings || []) {
          const pnDigits = String(m?.pn || "").split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || "";
          const lid = String(m?.lid || "");
          if (pnDigits.length >= 10 && lid) nexvyLidByPn[nexvyCanon(pnDigits)] = lid;
        }
      }
    } catch (e) {
      this.logger.warn(`[NEXVY PATCH] getLIDsForPNs failed: ${e}`);
    }
JS
  s{      verify = await this\.client\.onWhatsApp\(\.\.\.normalNumbersNotInCache\);\n    \}}{$ins}s;
' "$SVC"

# --- Edit B: injeta o lid no OnWhatsAppDto da verificação fresca ------------
perl -0777 -i -pe '
  s{(contacts\.find\(\(c\) => c\.remoteJid === numberJid\)\?\.pushName,\n\s*)undefined,}
   {${1}nexvyLidByPn[nexvyCanon(numberJid.split("@")[0]?.split(":")[0]?.replace(/\\D/g, "") || "")] || undefined,}s;
' "$SVC"

# --- Validação estática do patch -------------------------------------------
grep -q 'NEXVY PATCH v1' "$SVC" || { echo "!! Edit A não aplicou"; exit 6; }
grep -q 'nexvyLidByPn\[nexvyCanon(numberJid' "$SVC" || { echo "!! Edit B não aplicou"; exit 6; }
echo "==> Patch aplicado. Trechos:"
grep -n 'NEXVY PATCH\|nexvyLidByPn\[nexvyCanon(numberJid' "$SVC"

# --- Build opcional (NÃO deploya) ------------------------------------------
if [ "$DO_BUILD" = "1" ]; then
  echo "==> docker build $IMAGE_TAG (sem push, sem deploy)"
  docker build -t "$IMAGE_TAG" .
  echo "==> Imagem buildada: $IMAGE_TAG (NÃO enviada ao VPS)"
else
  echo "==> DO_BUILD=0 — patch aplicado em $WORKDIR, sem docker build."
  echo "    Para buildar: DO_BUILD=1 $0"
fi
echo "==> OK. Deploy ao VPS é ato separado e gated (ver README.md)."
