# Nexvy UI Template — RECIPES

Receitas canônicas **token-only** extraídas da rubric travada
`TEMPLATE-UI-GESTAO_v2-2026-07-11` (LEI do gestao.*) e do REF Beauty Rosé.
Todo snippet é **host-aware**: as classes usam só tokens (`bg-primary`,
`text-muted-foreground`, `border-border`…) — o mesmo markup vira navy/gold no
`gestao.*` ou rosé/vinho no `app.*` **sem trocar 1 classe**. Basta a classe de
tema no `<html>` (ver README).

> **Regra nº 1 (da rubric):** cor de marca SÓ via token semântico. O componente
> NUNCA sabe o hue. `blue-*`/`pink-*`/hex de marca hardcoded = reprova.
> Literais só para **significado de domínio** (canal, temperatura, status — §1.3
> da rubric), nunca para ação/marca.

---

## Tipografia (escala LEI)

| Papel | Classe |
|---|---|
| Micro-label de seção | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Metadado/timestamp | `text-[11px] tabular-nums text-muted-foreground` |
| Preview/secundário | `text-[13px] text-muted-foreground` |
| Título de item de lista | `text-[14px] font-semibold leading-tight truncate` |
| Corpo | `text-xs` / `text-sm` |
| Título de painel | `text-sm font-semibold` |
| Título de página | `text-lg font-semibold` (+ subtítulo `text-sm text-muted-foreground`) |
| KPI | `text-2xl font-bold tabular-nums` |

Fonte: `app.*` = **Inter**; `gestao.*` = **stack Apple (SF Pro)** — resolvido
automático pela classe `.theme-nexvy-institucional` (nada a fazer no componente).
`--radius = 0.875rem`: `rounded-lg`=radius, `md`=−2px, `sm`=−4px, `xl`=+4px.

---

## Botão

Prefira o `<Button>` do shadcn/ui (variants). Sem shadcn, o equivalente token-only:

```tsx
// Primário (ação principal — 1 por tela)
<button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
  <Plus className="h-4 w-4" /> Novo
</button>

// Secundário / ghost
<button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
  Cancelar
</button>

// Destrutivo
<button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
  <Trash2 className="h-4 w-4" /> Excluir
</button>
```

---

## Card (superfície premium)

Use a utility `.surface-card` (definida em `tokens/themes.css`: `--gradient-surface`
+ `--hairline` + `--shadow-md`, todas por tema). Hover premium = `.surface-card-hover`.

```tsx
<div className="surface-card surface-card-hover p-5">
  <h3 className="text-sm font-semibold text-foreground">Título do card</h3>
  <p className="mt-1 text-sm text-muted-foreground">Descrição secundária.</p>
</div>
```

Card cru (sem gradiente), equivalente shadcn `Card`:

```tsx
<div className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
  …
</div>
```

---

## KPI (card de métrica)

Receita F3 da rubric: ícone `h-9 w-9 rounded-lg bg-primary/10 text-primary`, valor
`text-2xl font-bold tabular-nums`, delta com cor **semântica** (success/destructive
— não decorativa).

```tsx
<div className="surface-card p-5">
  <div className="flex items-center justify-between">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Receita do mês
    </span>
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <DollarSign className="h-4 w-4" />
    </span>
  </div>
  <div className="mt-3 text-2xl font-bold tabular-nums text-foreground">R$ 48.250</div>
  <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-success">
    <TrendingUp className="h-3 w-3" /> +12,4% vs. mês anterior
  </div>
</div>
```

> **MONO TOTAL (decisão ratificada 07-11):** o ícone/realce **decorativo** do KPI
> colapsa para `text-primary`/`bg-primary/10` (nada de "rainbow" amber/emerald por
> card). Cores só quando **significam** (delta ↑/↓ = success/destructive).

---

## Tabela

Receita F5: cabeçalho `text-[11px] uppercase text-muted-foreground`, linhas
`border-b border-border/30`, hover `hover:bg-muted/40`, ações por linha num menu.

```tsx
<div className="overflow-x-auto rounded-lg border border-border">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border bg-muted/40 text-left">
        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</th>
        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">Valor</th>
        <th className="w-10 px-4 py-2.5"></th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border/30 transition-colors hover:bg-muted/40">
        <td className="px-4 py-3 font-medium text-foreground">Ana Souza</td>
        <td className="px-4 py-3">{/* <Badge> abaixo */}</td>
        <td className="px-4 py-3 text-right tabular-nums text-foreground">R$ 1.200</td>
        <td className="px-4 py-3 text-right">
          <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Ações">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Badge

**Marca / neutro** = token. **Significado de domínio** = literal da §1.3 (permitido).

```tsx
// Neutro / marca (host-aware)
<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Ativo</span>
<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Rascunho</span>

// Semânticos por token
<span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Pago</span>
<span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Falhou</span>

// SIGNIFICADO de domínio (literais PERMITIDOS — §1.3 da rubric):
<span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-medium text-white">WhatsApp</span>
<span className="inline-flex items-center rounded-full bg-pink-500 px-2 py-0.5 text-[11px] font-medium text-white">Instagram</span>
// temperatura: quente red-500/10 · morna orange-500/10 · fria sky-500/10
```

---

## Badge de status (dot)

```tsx
<span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
  <span className="h-2 w-2 rounded-full bg-green-500" /> Humano ativo
</span>
// aguardando humano: bg-yellow-500 · IA/bot ativo: bg-blue-500 · encerrada: bg-muted
```

---

## Estados obrigatórios (rubric §3.1)

Toda tela precisa de **vazio + carregando (skeleton anatômico) + erro (com retry) +
sucesso otimista**. Skeleton token-only:

```tsx
<div className="animate-pulse space-y-3">
  <div className="h-9 w-9 rounded-lg bg-muted" />
  <div className="h-4 w-2/3 rounded bg-muted" />
  <div className="h-4 w-1/2 rounded bg-muted" />
</div>

// Estado vazio
<div className="flex flex-col items-center gap-2 py-12 text-center">
  <Package className="h-8 w-8 text-muted-foreground/50" />
  <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
</div>
```

---

## Checklist de consistência de token (pré-entrega)

- [ ] `grep "blue-[0-9]"` → só significado §1.3 (webchat/facebook/cold/bot/evento).
- [ ] `grep "pink-\|EC4899"` → só canal Instagram ou swatch de color-picker (dado).
- [ ] Zero hex/hsl de marca hardcoded — sempre token.
- [ ] Ação primária única e clara por tela.
- [ ] Botões-ícone com `aria-label`.
- [ ] `<lg` funcional (bottom nav / Sheet). Sem scroll horizontal acidental.
