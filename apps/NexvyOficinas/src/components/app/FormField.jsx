/**
 * Campo de formulário padronizado — label + input/select/textarea
 */
export function FormField({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wide"
        style={{ color: "var(--ink-muted)" }}>
        {label}{required && <span style={{ color: "#DC2626" }}> *</span>}
      </label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-sm border px-3 py-2 text-[13px] focus:outline-none transition-colors";
const inputStyle = {
  backgroundColor: "var(--surface-sunken)",
  borderColor: "var(--line)",
  color: "var(--ink)",
};

export function Input({ ...props }) {
  return <input className={inputCls} style={inputStyle} {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className={inputCls} style={{ ...inputStyle, cursor: "pointer" }} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ ...props }) {
  return <textarea className={inputCls} style={inputStyle} rows={3} {...props} />;
}