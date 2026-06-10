# Design Assets — NexvyOficinas

Pack vetorial (tema oficina/automotivo) para identidade visual do SaaS: login, marca,
texturas e tela de erro. Origem: stock vetorial (Freepik-style), fornecido por Marcelo em 2026-06-10.

## Política de versionamento / git

- **`previews/`** (JPG) → **versionado** no git. Referência visual rápida, baixa fricção.
- **`source/`** (ZIP com EPS+JPG) → **ignorado** no git (`.gitignore`), pesado (~14 MB).
  Os originais vivem em **2 lugares** (defesa em profundidade): `~/Downloads/` e esta pasta `source/`.

## Catálogo

| Arquivo (base) | Conteúdo | Formato fonte | Dimensão preview | Uso recomendado |
|---|---|---|---|---|
| `wheel-realistic` | Pneu de perfil + roda de liga 3D (aro **vermelho**) | EPS + JPG | 4500×4500 | Hero do login, ícone-marca, badge |
| `tire-sketch-handdrawn` | Roda em traço de tinta azul-marinho, linhas de movimento | EPS + JPG | 3600×2719 | Textura artística, divisores, "sobre", loaders |
| `tire-tracks-set` | 9 rastros de pneu (curvas/perspectiva/S), preto/branco | EPS + JPG | 4500×4500 | Textura de fundo sutil, marca d'água, scroll decor |
| `error-404-illustration` | "404 Page not found" flat — "0" = roda + bomba/manômetro | EPS + JPG | 6250×4219 | Tela de erro / rota 404 do app |

## Notas de marca

- **Accent NexvyOficinas = `#F97316` (laranja).** `wheel-realistic` (aro vermelho) e
  `error-404-illustration` (acentos vermelhos) recolorem para laranja com 1 ajuste de matiz no vetor.
- Fonte é **vetor (EPS)** → escala sem perda. Para web, exportar **SVG** (ideal) ou **WebP**.

## Pipeline de conversão (quando for usar em produção)

EPS não é entregável direto no browser. Conversão sugerida (requer ghostscript + inkscape/imagemagick):

```bash
# EPS → SVG (vetor, ideal p/ ícones e ilustrações nítidas)
inkscape source-extraido/4977.eps --export-type=svg --export-filename=wheel.svg

# EPS → PNG/WebP transparente em alta (p/ hero raster)
magick -density 300 source-extraido/4977.eps -background none wheel.png
cwebp -q 82 wheel.png -o wheel.webp
```

Destino final dos entregáveis web: `apps/NexvyOficinas/public/brand/`.
