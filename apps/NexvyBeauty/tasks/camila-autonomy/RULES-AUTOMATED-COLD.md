# Regras de segurança/funcionamento — cold 100% automatizado

Atualizado: 2026-09-15  
Escopo: Camila / cold outreach + atendimento pós-abordagem.

---

## R1 — Retomada no dia seguinte se a abordagem ficou incompleta

### Quando
O lead recebeu **só parte** das bolhas do Estágio 1 (ex.: 1/4, como Renata): opening saiu, bolhas 2–4 não.

### O que fazer (D+1, na janela comercial)
1. Detectar conversa com `apresentar_sequence` incompleta **ou** outs da abordagem < 4 e sem opt-out.
2. Enviar **uma** mensagem de retomada (sugestiva — o agente ajusta se tumultuar o fio):

> Oi, {usuário}! Desculpe, acabei não conseguindo te responder dentro da minha janela de atendimento de ontem. Mas vamos retomar por aqui!

3. Em seguida, enviar **somente as bolhas que faltaram** (não reenviar a 1ª).
4. Se, olhando o histórico, esse texto de “ontem / janela” **não couber** (ex.: lead já conversou de manhã), o agente **reescreve** a ponte e retoma — objetivo = completar o script, não forçar o texto literal.

### Não fazer
- Não reiniciar a abordagem do zero se a 1ª já foi entregue.
- Não empilhar retomada se o lead pediu opt-out.
- Não disparar fora da janela comercial.

### Estado / implementação futura
- Persistir `pending` das bolhas (já em `metadata.apresentar_sequence`).
- Job D+1: `resume_incomplete_approach` sob `TEST`/`LIVE` + kernel.

---

## R2 — Opt-out “não tenho interesse” → site + remarketing

### Quando
Lead diz explicitamente que não tem interesse (ou equivalente classificado como `opt_out`).

### O que fazer
1. Responder (uma bolha):

> Sem problemas, {usuário}! Vou deixar aqui o nosso site para você dar uma olhada com calma, e se tiver interesse é só nos chamar no whatsapp novamente. Combinado?

2. Enviar o link **https://nexvybeauty.com.br** (preview OG da página — título + imagem hero atuais).
3. Marcar **opt-out** + **remarketing** (WHEN remarcar = TBD).
4. Parar cadência / silenciar brain após esse fechamento educado.

### Não fazer
- Não insistir com FU de cold.
- Não reabrir abordagem no mesmo dia.

Ver também: `RULE-OPT-OUT-REMARKETING.md`.
