# PRD-05 — Canal, Z-API, ACK e ownership

## Objetivo

Responder pelo chip correto e distinguir aceitação do provider de entrega real.

## Requisitos

- Vínculo instância→Camila ativo e único.
- Agente precisa estar `is_active + active_in_whatsapp`.
- Erro ao gravar channel stamp é fatal para o envio e gera alerta.
- Preflight exige `connected=true` e `smartphoneConnected=true`.
- Estados independentes: `accepted`, `sent`, `delivered`, `read`, `failed`.
- ACK atualiza mensagem e Action Ledger, com ou sem `campaign_id`.
- Reconciliador trata ACK duplicado, atrasado e ausente.
- Exposição de experimento conta apenas após `delivered`.
- Segredos nunca aparecem em log, ledger ou evidência.

## Cenários de teste

- Conexão saudável, ida e volta por número controlado.
- Smartphone desconectado.
- Owner divergente ou agente desativado.
- ACK duplicado e fora de ordem.
- Provider aceita sem entregar.
- Falha após reservation e retry idempotente.

## Check binário

PASS se o teste controlado percorrer `reserved → accepted → delivered`; todos
os cenários de falha negarem ou reconciliarem corretamente; e o kill-switch
provar zero provider call depois de acionado.

## Rollback

Desconectar provider e manter release state `OFF`. Restaurar versão anterior da
edge sem reativar o conductor.
