# Prompt — Tela de Login white-label (colar no Claude design / claude.ai)

> **Como usar:** cole o bloco entre `═══` no Claude (web, com artifacts/design). Ele gera o componente React. Traga o resultado de volta que eu porto pro projeto (a stack é idêntica: React + Tailwind + shadcn).
> **Replicação:** o prompt exige um bloco `BRAND` parametrizável no topo — pra replicar nos 5+ SaaS só trocamos imagem de fundo, nome, tagline e cor.

═══════════════════════════════════════════════════════════════════

Crie uma tela de login premium em **React + Tailwind CSS** (componente único, sem dependências externas além de lucide-react para ícones). Idioma: **português brasileiro**.

**Conceito:** impactante mas minimalista. É o template de login de uma família de SaaS verticais (oficinas mecânicas, barbearias, salões de beleza, restaurantes, academias) — o MESMO layout serve todos, mudando apenas a imagem de fundo, o nome, a tagline e a cor de destaque.

**Parametrização obrigatória** — um objeto de configuração no topo do arquivo, único ponto de customização:
```ts
const BRAND = {
  name: "NexvyOficinas",
  tagline: "Gestão completa para sua oficina",
  accent: "#F97316",          // cor de destaque (laranja para oficinas)
  backgroundImage: "URL_DA_IMAGEM_DO_SETOR", // ex: foto cinematográfica de um carro esportivo numa oficina
  logoUrl: null,              // se null, renderiza o name estilizado como wordmark
};
```

**Layout (desktop):**
- Imagem de fundo **full-bleed** (a foto do setor — para oficinas, um carro impactante em ambiente de garagem premium, iluminação dramática) com overlay de gradiente escuro (de preto ~85% à esquerda/baixo para transparente) garantindo legibilidade.
- Card de login **glassmorphism** (fundo escuro translúcido, backdrop-blur, borda sutil 1px branca/10%) posicionado à direita, verticalmente centralizado, max-w-md.
- No canto inferior esquerdo, sobre a imagem: wordmark + tagline em tipografia grande e elegante (peso bold, tracking apertado) + 2-3 micro-métricas discretas (ex: "+40% conversão · -50% tempo de resposta") em texto pequeno e sóbrio.

**Card de login (conteúdo):**
1. Logo/wordmark pequeno no topo
2. Título "Bem-vindo de volta" + subtítulo discreto "Entre na sua conta para continuar"
3. Botão "Continuar com Google" (outline, ícone G, full-width)
4. Divisor "ou continue com e-mail"
5. Campo E-mail (ícone mail, placeholder "seu@email.com")
6. Campo Senha (ícone cadeado, toggle mostrar/ocultar com ícone de olho)
7. Linha com checkbox "Lembrar de mim" à esquerda e link "Esqueci minha senha" à direita (na cor accent)
8. Botão principal "Entrar" full-width na cor accent com hover state e seta →
9. Rodapé do card: "© 2026 {BRAND.name}. Todos os direitos reservados."

**Estética:**
- Dark mode nativo (fundos #0A0A0B–#111113), textos branco/zinc.
- A cor accent SÓ em: botão principal, links, focus rings e detalhes — uso cirúrgico, não dominante.
- Micro-interações: fade-in suave do card ao montar (CSS animation), hover states com transition, focus ring na cor accent.
- Inputs altos (h-12), cantos arredondados (rounded-xl), espaçamento generoso.
- Tipografia: system font stack, hierarquia clara.

**Responsivo (mobile):** a imagem vira um header de ~30vh no topo (com o wordmark sobreposto), e o card ocupa o restante em tela cheia, sem glassmorphism (fundo sólido escuro).

**Acessibilidade:** labels nos inputs, contraste AA, navegável por teclado, `aria-label` no toggle de senha.

Não implemente a lógica de autenticação — apenas `onSubmit`/`onClick` como handlers vazios com `console.log`. Estados de loading no botão Entrar (spinner) controlados por um `useState` de demonstração.

Gere também, em comentário no fim do arquivo, uma tabela com as 5 variações de BRAND para os outros SaaS (BarbeiroPro — barbearia, NexvyBeauty — salão, NexvyFoods — restaurante/delivery, NexvyGYM — academia) com sugestão de cor accent e descrição da imagem de fundo de cada.

═══════════════════════════════════════════════════════════════════

## Depois que o Claude web gerar

Traga o componente aqui. Eu vou:
1. Portá-lo para `src/pages/Login.tsx` do NexvyOficinas (mantendo a lógica real de auth: `supabase.auth.signInWithPassword` + `signInWithOAuth` Google + "Esqueci minha senha" → `/reset-password`)
2. Ligar o `BRAND` ao `platform_settings` (white-label do banco) — assim cada SaaS herda o template automaticamente no cascateamento
3. Você escolhe/me manda a imagem de fundo de cada setor (ou eu busco opções livres de direitos)
