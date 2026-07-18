/// <reference types="npm:@types/react@18.3.1" />

// ─────────────────────────────────────────────────────────────────────────────
// Layout de marca compartilhado — NexvyBeauty ("Clientes de Volta")
// Visual "produto de beleza premium": faixa de cabeçalho vinho, fio ombré rosé,
// card branco, seções tingidas, divisor ornamental floral, botão bulletproof
// (com fallback VML p/ Outlook) e faixa de rodapé em rosé suave.
//
// ⚠️ 100% CSS INLINE (clientes de e-mail removem <style>/var()/className).
// Tipografia: serif = Georgia (Playfair NÃO renderiza em e-mail); corpo = Arial.
// A riqueza vem de ESTRUTURA + COR + TIPOGRAFIA — sem depender de imagem hospedada.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

// ── Paleta da marca ──────────────────────────────────────────────────────────
export const brand = {
  vinho: '#7c0f24', // vinho profundo — faixa de cabeçalho, botão
  vinhoDeep: '#630b1c',
  creme: '#faf7f2', // creme — wordmark sobre vinho, texto do botão
  blush: '#f4cdd5', // blush claro — flourish do wordmark
  blushMuted: '#e6b6bf', // blush suave — tagline na faixa
  rose: '#c54b60', // rosé — eyebrow, acento
  roseLight: '#d9718a', // rosé claro — fim do fio ombré
  ink: '#2a2124', // tinta — títulos / corpo
  muted: '#8a787c', // secundário — notas / rodapé
  page: '#f2ebe2', // fundo da página (parchment quente)
  card: '#ffffff',
  tint: '#faf3f0', // rosé suave — seção tingida / rodapé
  border: '#eaddd3',
  borderTint: '#eed9d4',
} as const

// ── Escapes p/ atributos em HTML bruto (VML/anchor via dangerouslySetInnerHTML) ─
const escAttr = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const escText = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Botão bulletproof ────────────────────────────────────────────────────────
// Outlook: VML <v:roundrect> (dentro de <!--[if mso]>). Demais clientes: âncora
// react-email <Link> escondida do Outlook via mso-hide:all. Plain-text preserva
// rótulo + URL (o <Link> entra na árvore React) — paridade com a v1.
export const PrimaryButton = ({
  href,
  label,
}: {
  href: string
  label: string
}) => {
  const w = Math.max(220, Math.min(360, 44 + label.length * 12))
  const vml = `<!--[if mso]>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escAttr(href)}" style="height:52px;v-text-anchor:middle;width:${w}px;" arcsize="24%" strokecolor="${brand.vinho}" fillcolor="${brand.vinho}">
<w:anchorlock/>
<center style="color:${brand.creme};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:1px;">${escText(label)}</center>
</v:roundrect>
</td></tr></table>
<![endif]-->`
  return (
    <Section style={{ textAlign: 'center', margin: '4px 0 2px' }}>
      <div dangerouslySetInnerHTML={{ __html: vml }} />
      <Link href={href} style={buttonAnchor as React.CSSProperties}>
        {label}
      </Link>
    </Section>
  )
}

// ── Divisor ornamental (fio rosé + acento floral centralizado) ───────────────
export const Divider = () => (
  <table
    role="presentation"
    width="100%"
    cellPadding={0}
    cellSpacing={0}
    border={0}
    style={{ width: '100%', margin: '26px 0' }}
  >
    <tbody>
      <tr>
        <td style={{ verticalAlign: 'middle' }}>
          <div
            style={{
              height: '1px',
              lineHeight: '1px',
              fontSize: '1px',
              backgroundColor: brand.borderTint,
            }}
          >
            &#160;
          </div>
        </td>
        <td
          style={{
            width: '46px',
            textAlign: 'center',
            verticalAlign: 'middle',
            color: brand.rose,
            fontSize: '15px',
            lineHeight: '15px',
            padding: '0 10px',
          }}
        >
          &#127800;
        </td>
        <td style={{ verticalAlign: 'middle' }}>
          <div
            style={{
              height: '1px',
              lineHeight: '1px',
              fontSize: '1px',
              backgroundColor: brand.borderTint,
            }}
          >
            &#160;
          </div>
        </td>
      </tr>
    </tbody>
  </table>
)

// ── Micro-rótulo (eyebrow) — CAIXA ALTA letterspaced em rosé ──────────────────
export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <Text style={eyebrow}>{children}</Text>
)

// ── Título editorial (Georgia) ───────────────────────────────────────────────
export const Title = ({ children }: { children: React.ReactNode }) => (
  <Heading style={h1}>{children}</Heading>
)

// ── Parágrafo de corpo ───────────────────────────────────────────────────────
export const BodyText = ({ children }: { children: React.ReactNode }) => (
  <Text style={text}>{children}</Text>
)

// ── Nota secundária (silenciosa) ─────────────────────────────────────────────
export const MutedNote = ({ children }: { children: React.ReactNode }) => (
  <Text style={muted}>{children}</Text>
)

// ── Seção tingida ("card de produto" p/ o próximo passo) ─────────────────────
export const HighlightBox = ({ children }: { children: React.ReactNode }) => (
  <Section style={highlight}>{children}</Section>
)

// ── Chip de código (reautenticação) ──────────────────────────────────────────
export const CodeChip = ({ code }: { code: React.ReactNode }) => (
  <Section style={codeWrap}>
    <Text style={codeText}>{code}</Text>
  </Section>
)

// ── Casca do e-mail: faixa cabeçalho + fio ombré + card branco + rodapé ──────
export const EmailShell = ({
  preview,
  children,
}: {
  preview: string
  children: React.ReactNode
}) => {
  const year = new Date().getFullYear()
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Faixa de cabeçalho (header band) */}
          <Section style={headerBand}>
            <Text style={wordmark}>
              Nexvy<span style={wordmarkAccent}> Beauty</span>
            </Text>
            <Text style={headerTagline}>SUA EQUIPIA DE RELACIONAMENTO</Text>
          </Section>

          {/* Fio de acento ombré rosé */}
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            style={thread}
          >
            <tbody>
              <tr>
                {[
                  brand.vinho,
                  '#a02540',
                  brand.rose,
                  brand.roseLight,
                  '#e7a3b0',
                ].map((c) => (
                  <td
                    key={c}
                    style={{
                      backgroundColor: c,
                      height: '6px',
                      lineHeight: '6px',
                      fontSize: '1px',
                      width: '20%',
                    }}
                  >
                    &#160;
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* Conteúdo (card branco) */}
          <Section style={content}>{children}</Section>

          {/* Faixa de rodapé (footer band) */}
          <Section style={footerBand}>
            <Text style={footerFlower}>&#127800;</Text>
            <Text style={footerBrand}>
              Nexvy<span style={footerBrandAccent}> Beauty</span> — sua EquipIA
              para transformar clientes de primeira vez em clientes de sempre.
            </Text>
            <Text style={footerLinks}>
              <Link href="https://instagram.com/nexvytech" style={footerLink}>
                Instagram @nexvytech
              </Link>
              <span style={footerDot}>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
              <Link href="https://wa.me/5511955021205" style={footerLink}>
                WhatsApp
              </Link>
            </Text>
            <Text style={footerMuted}>
              © {year} Nexvy Beauty. Todos os direitos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// ── Estilos inline exportados p/ links/ênfase dentro do corpo ─────────────────
export const linkStyle = { color: brand.vinho, textDecoration: 'underline' }
export const strongAccent = { color: brand.vinho, fontWeight: 700 as const }

// ── Estilos internos ─────────────────────────────────────────────────────────
const main = {
  backgroundColor: brand.page,
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '0',
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '28px 16px 36px' }

const headerBand = {
  backgroundColor: brand.vinho,
  borderRadius: '18px 18px 0 0',
  padding: '34px 24px 30px',
  textAlign: 'center' as const,
}
const wordmark = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '30px',
  fontWeight: 700 as const,
  color: brand.creme,
  letterSpacing: '0.5px',
  lineHeight: '34px',
  margin: 0,
}
const wordmarkAccent = { fontStyle: 'italic' as const, color: brand.blush }
const headerTagline = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  fontWeight: 700 as const,
  letterSpacing: '3px',
  color: brand.blushMuted,
  margin: '10px 0 0',
}
const thread = { width: '100%', borderCollapse: 'collapse' as const }

const content = {
  backgroundColor: brand.card,
  borderLeft: `1px solid ${brand.border}`,
  borderRight: `1px solid ${brand.border}`,
  padding: '40px 36px 36px',
}
const eyebrow = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  fontWeight: 700 as const,
  letterSpacing: '2.4px',
  textTransform: 'uppercase' as const,
  color: brand.rose,
  margin: '0 0 12px',
}
const h1 = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '27px',
  fontWeight: 700 as const,
  lineHeight: '34px',
  color: brand.ink,
  margin: '0 0 18px',
}
const text = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '16px',
  lineHeight: '26px',
  color: brand.ink,
  margin: '0 0 16px',
}
const muted = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '21px',
  color: brand.muted,
  margin: '0',
}
const highlight = {
  backgroundColor: brand.tint,
  border: `1px solid ${brand.borderTint}`,
  borderRadius: '14px',
  padding: '26px 24px',
  margin: '8px 0 4px',
  textAlign: 'center' as const,
}
const buttonAnchor = {
  backgroundColor: brand.vinho,
  borderRadius: '12px',
  color: brand.creme,
  display: 'inline-block',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: 700 as const,
  letterSpacing: '0.6px',
  lineHeight: '20px',
  padding: '16px 34px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  msoHide: 'all',
}
const codeWrap = {
  backgroundColor: brand.tint,
  border: `1px solid ${brand.borderTint}`,
  borderRadius: '14px',
  padding: '22px 24px',
  margin: '6px 0 4px',
  textAlign: 'center' as const,
}
const codeText = {
  fontFamily: 'Courier, monospace',
  fontSize: '34px',
  fontWeight: 700 as const,
  color: brand.vinho,
  letterSpacing: '10px',
  lineHeight: '40px',
  margin: 0,
}

const footerBand = {
  backgroundColor: brand.tint,
  borderLeft: `1px solid ${brand.border}`,
  borderRight: `1px solid ${brand.border}`,
  borderBottom: `1px solid ${brand.border}`,
  borderRadius: '0 0 18px 18px',
  padding: '26px 30px 30px',
  textAlign: 'center' as const,
}
const footerFlower = {
  fontSize: '16px',
  lineHeight: '18px',
  color: brand.rose,
  margin: '0 0 10px',
}
const footerBrand = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  color: brand.ink,
  margin: '0 0 12px',
}
const footerBrandAccent = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontStyle: 'italic' as const,
  color: brand.vinho,
}
const footerLinks = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 12px',
}
const footerLink = {
  color: brand.vinho,
  fontWeight: 700 as const,
  textDecoration: 'none',
}
const footerDot = { color: brand.roseLight }
const footerMuted = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  lineHeight: '17px',
  color: brand.muted,
  margin: 0,
}
