# Nova Prospecção Ativa — Redesign do Dashboard

## Fase 1 — Primeiro viewport executivo

**Status:** implementada localmente, aguardando validação visual antes do deploy.  
**Escopo alterado:** apenas `NovaProspeccaoWorkspace.tsx`.  
**Contratos de dados/EFs:** não alterados.

## Alterações

- Cards de Base de Leads receberam hierarquia executiva:
  - título menor;
  - número maior e tabular;
  - ícone semântico;
  - tratamento cromático por categoria;
  - borda, sombra e hover discretos.
- As quatro categorias continuam visíveis:
  - Principal;
  - Semente;
  - Não classificados;
  - Remoção confirmada.
- A informação de telefone permanece apenas no card Principal, em linha
  secundária discreta.
- O total da Base permanece no cabeçalho da seção.
- O cabeçalho global e o refresh persistido foram preservados.
- Estágio Operacional e Ações Pendentes não foram redesenhados nesta fase.

## Invariantes verificados

- Nenhuma contagem foi criada ou alterada no frontend.
- Nenhuma categoria foi removida ou renomeada.
- Nenhuma rota foi removida.
- Nenhuma EF ou migration foi alterada nesta fase.
- O build de produção passou.
- `git diff --check` passou.

## Critério de validação visual

Validar no dashboard real:

1. A Base de Leads é percebida como o bloco principal da tela.
2. Os quatro baldes são distinguíveis sem parecerem estados de erro.
3. A leitura dos números é mais rápida que na versão anterior.
4. O dashboard ganhou presença visual sem excesso de texto.
5. Hover, contraste e quebra em largura menor não prejudicam a leitura.

Após a aprovação visual, a próxima etapa será o redesenho do bloco Estágio
Operacional.
