/**
 * Modal genérico leve — sem dependências externas.
 * Uso: <Modal open={bool} onClose={fn} title="..."><...children/></Modal>
 */
export default function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={`relative w-full ${width} rounded-sm shadow-xl overflow-hidden`}
        style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <h2 className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>{title}</h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-sm text-lg leading-none transition-colors"
            style={{ color: "var(--ink-muted)" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--ink-muted)"}>
            ×
          </button>
        </div>
        {/* Body */}
        <div className="p-5 overflow-y-auto" style={{ maxHeight: "80vh" }}>
          {children}
        </div>
      </div>
    </div>
  );
}