import { useState } from 'react';
import { TelefoniaManager } from './TelefoniaManager';
import { TelefoniaDetailPage } from './TelefoniaDetailPage';

/**
 * Drill-down lista ⇄ detalhe via state interno — a nav do platform-shell
 * não usa URL (registry + PlatformModuleProvider), então a seção guarda
 * a linha selecionada aqui, no mesmo padrão do fluxo de Organizations.
 */
export function TelefoniaSection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <TelefoniaDetailPage id={selectedId} onBack={() => setSelectedId(null)} />
    );
  }
  return <TelefoniaManager onViewNumber={setSelectedId} />;
}
