# Prospecção — reconciliação read-only

**Data:** 2026-09-23  
**Escopo:** arquivo v4, log/injector e schema local  
**Estado:** auditoria local e remota concluídas; nenhum dado foi alterado  
**Projeto Gestão:** `fzhlbwhdejumkyqosuvq`  
**Produto:** `806b5975-e268-402e-a65c-9e9503271041`

## 1. Fontes examinadas

- `Downloads/prospectagram_BASE_FINAL_v4.json`
- `Downloads/nexvy-inject-classified-v4.log`
- `Downloads/nexvy-inject-classified-v4.state.json`
- `Downloads/nexvy-inject-classified-v4.py`
- migrations locais de `platform_crm_leads` e `platform_crm_extracted_leads`

Nenhuma escrita foi feita no banco nesta auditoria.

## 2. Números confirmados no arquivo v4

| Item | Quantidade |
|---|---:|
| Registros totais | 40.181 |
| Principal | 29.689 |
| Semente | 2.433 |
| Remoção confirmada | 4.693 |
| Não classificado | 3.366 |
| Elegíveis para processamento dos três baldes classificados | 36.815 |
| Registros com telefone nos três baldes classificados | 23.164 |
| Registros sem telefone nos três baldes classificados | 13.651 |
| Duplicatas exatas `(handle, telefone)` | 0 |
| Handles repetidos no arquivo | 0 |
| Telefones presentes em mais de um handle | 146 |
| Linhas envolvidas nesses agrupamentos | 303 |
| Linhas excedentes que deveriam compartilhar card | 157 |

Distribuição dos 146 grupos de telefone:

- 142 grupos com 2 handles;
- 2 grupos com 3 handles;
- 1 grupo com 4 handles;
- 1 grupo com 9 handles.

## 3. Causa comprovada do erro

No injector, a ordem atual é equivalente a:

```python
if handle in handles or (phone and phone in phones):
    skip_already_seen()
    continue

if phone and phone in batch_phones:
    link_same_phone()
```

O segundo ramo nunca recebe o segundo handle com o mesmo telefone, porque o primeiro `if` já o descarta. O `link_same_phone` é código morto para esse caso.

Consequência observada no log:

- primeira simulação: 36.647 candidatos;
- depois das retomadas, o mesmo extraction id foi completado;
- os 157 casos de telefone compartilhado foram tratados como skip, não como perfis ligados ao mesmo card.

O arquivo não contém duplicatas exatas de handle + telefone. Portanto, o problema não é repetição integral de lead; é perda de perfis distintos que deveriam compartilhar um lead.

## 4. Regra que deve substituir a lógica atual

Para cada linha normalizada:

1. localizar handle + telefone exatos;
2. se existir, não criar novo perfil/card;
3. senão, localizar telefone existente;
4. se existir, reutilizar o mesmo `platform_crm_lead_id` e criar/ligar um perfil de handle distinto;
5. senão, localizar handle existente sem telefone e atualizar/enriquecer;
6. senão, criar novo lead somente se o balde permitir promoção;
7. se o telefone estiver em supressão ativa, manter o perfil suprimido e fora da fila.

O agrupamento deve ser representado por várias linhas em `platform_crm_extracted_leads` com o mesmo `imported_to_lead_id`. O card não deve armazenar uma lista serializada de handles em texto.

## 5. Observação sobre remoção confirmada

`remocao_confirmada` precisa continuar sendo uma lista persistida e reversível. Não deve ser apagada nem tratada como descarte irreversível.

Enquanto o estado estiver ativo:

- bloqueia promoção e campanha;
- impede reentrada automática;
- permanece pesquisável;
- pode ser restaurado para `principal` ou `nao_classificado` por ação humana;
- a restauração deve gerar histórico de ator, data e motivo.

## 6. Limite atual da comprovação

Após autenticação da CLI, a fotografia remota confirmou:

- `platform_crm_leads`: 36.668 cards; 23.022 com telefone;
- `platform_crm_extracted_leads`: 36.668 perfis, todos vinculados a um `imported_to_lead_id`;
- `triagem` persistida: 29.584 `principal`, 2.409 `semente`, 4.675 `remocao_confirmada`;
- nenhum dos 3.366 registros `nao_classificado` está persistido no banco atual;
- nenhum grupo remoto de telefone compartilhado por múltiplos handles;
- nenhuma duplicidade exata de `handle + telefone`.

Assim, o banco confirma que a regra de agrupamento por telefone ainda não foi aplicada e que os não classificados ficaram fora do CRM. Não foram encontrados:

- cards existentes;
- linhas de `extracted_leads` por `imported_to_lead_id`;
- grupos reais de múltiplos handles;
- distribuição remota por `triagem`;
- elegibilidade atual para outbound.

Esses checks são obrigatórios antes de qualquer migration ou reprocessamento.

## 7. Próximo passo

Executadas consultas read-only para produzir:

```text
cards totais / cards v4 / cards originais
linhas extraídas v4
linhas por triagem
linhas sem imported_to_lead_id
cards com 2+ handles
telefones com 2+ handles
duplicatas exatas handle + telefone
remoções fora da lista de supressão
fila outbound atual
```

O reprocessamento idempotente dos 157 casos foi executado em 23/09/2026 pelo modo `--repair-shared-handles` do injector. Resultado remoto:

- 146 cards com múltiplos handles;
- 303 perfis distribuídos nesses cards;
- 157 perfis excedentes vinculados a cards já existentes;
- 0 novos cards criados;
- 0 duplicidades exatas `handle + telefone`.

A ausência remota desses grupos era a evidência de que o importador precisava ser corrigido, não apenas a tela. O reparo foi feito no importador; a UI deve agora agregar os perfis por `imported_to_lead_id`.
