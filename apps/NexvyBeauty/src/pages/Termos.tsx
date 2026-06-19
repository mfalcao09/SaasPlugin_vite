import { LegalPage } from './legal/LegalPage';
import { TERMOS_MD, TERMS_VERSION } from './legal/legalContent';

export default function Termos() {
  return <LegalPage title="Termos de Uso" version={TERMS_VERSION} markdown={TERMOS_MD} />;
}
