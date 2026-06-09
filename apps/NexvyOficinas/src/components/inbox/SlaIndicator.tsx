// Sprint 7 F2 — SLA Tracking visual indicator
// Exibe apenas quando firstResponseAt IS NULL (aguardando primeira resposta do agente)

interface Props {
  createdAt: string
  firstResponseAt: string | null
  slaMinutes: number
}

export default function SlaIndicator({ createdAt, firstResponseAt, slaMinutes }: Props) {
  // Só exibe se ainda não houve primeira resposta
  if (firstResponseAt) return null

  const elapsedMs = Date.now() - new Date(createdAt).getTime()
  const elapsedMin = elapsedMs / 60000
  const ratio = elapsedMin / slaMinutes

  let color: string
  let label: string
  let title: string

  if (ratio < 0.5) {
    color = 'bg-green-500'
    label = `${Math.round(elapsedMin)}m`
    title = `SLA: ${Math.round(elapsedMin)}/${slaMinutes}min — dentro do prazo`
  } else if (ratio < 0.9) {
    color = 'bg-yellow-500'
    label = `${Math.round(elapsedMin)}m`
    title = `SLA: ${Math.round(elapsedMin)}/${slaMinutes}min — atenção`
  } else {
    color = 'bg-red-500'
    label = `${Math.round(elapsedMin)}m`
    title = `SLA: ${Math.round(elapsedMin)}/${slaMinutes}min — estourado`
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${color} text-white text-[9px] px-1.5 py-0.5 rounded-full leading-tight shrink-0`}
      title={title}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 inline-block" />
      {label}
    </span>
  )
}
