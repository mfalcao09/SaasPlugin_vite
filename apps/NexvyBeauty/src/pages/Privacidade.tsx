import { LegalPage } from './legal/LegalPage';
import { PRIVACIDADE_MD, PRIVACY_VERSION } from './legal/legalContent';

export default function Privacidade() {
  return <LegalPage title="Política de Privacidade" version={PRIVACY_VERSION} markdown={PRIVACIDADE_MD} />;
}
