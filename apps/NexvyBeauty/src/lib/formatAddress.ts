// formatAddress — organizations.address é jsonb, NÃO string.
//
// O tipo declarado à mão nas páginas públicas dizia `address: string | null`, e o
// onboarding grava `{cep, city, state, number, street, neighborhood}`. Renderizar
// isso direto em JSX derruba a página inteira com "React error #31: objects are not
// valid as a React child" — provado em produção em /s/nexvy-2c88a7 e /s/meuteste1,
// no bundle index-Cuw43JUE.js. O `tsc` nunca pegou porque a mentira estava na
// DECLARAÇÃO, não no uso: o tipo era escrito à mão, não gerado do schema.
//
// salao-public-bootstrap repassa o campo cru do banco, então o normalizador vive
// aqui, no cliente — e cobre orgs antigas (string) e novas (objeto).
//
// Nunca lança: esta função roda na vitrine pública, que é o link que a dona
// compartilha e o QR que ela imprime no balcão. Endereço malformado deve sumir da
// tela, jamais derrubá-la.

export type OrgAddress =
  | string
  | null
  | undefined
  | {
      street?: string | null;
      number?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      state?: string | null;
      cep?: string | null;
    };

export function formatAddress(address: OrgAddress): string | null {
  if (!address) return null;
  if (typeof address === 'string') return address.trim() || null;
  if (typeof address !== 'object') return null;

  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

  const rua = [clean(address.street), clean(address.number)].filter(Boolean).join(', ');
  const cidade = [clean(address.city), clean(address.state)].filter(Boolean).join('/');

  return (
    [rua, clean(address.neighborhood), cidade, clean(address.cep)]
      .filter(Boolean)
      .join(' · ') || null
  );
}
