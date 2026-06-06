import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Scissors, ArrowLeft, Copy, Check, Eye, EyeOff } from 'lucide-react';

const SECTION = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-black/8 p-6 mb-6">
    <h2 className="font-bold text-[#1B1C1E] text-base mb-5 pb-3 border-b border-black/8">{title}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, required, children, full }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className="text-xs font-semibold text-gray-500 block mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const Input = ({ value, onChange, type = 'text', placeholder }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
  />
);

const Select = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 bg-white"
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

function validateCPF(cpf) {
  const s = cpf.replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(s[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(s[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(s[10]);
}

function validateCNPJ(cnpj) {
  const s = cnpj.replace(/\D/g, '');
  if (s.length !== 14 || /^(\d)\1+$/.test(s)) return false;
  let len = s.length - 2;
  let nums = s.substring(0, len);
  const digits = s.substring(len);
  let sum = 0, pos = len - 7;
  for (let i = len; i >= 1; i--) {
    sum += parseInt(nums.charAt(len - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (r !== parseInt(digits.charAt(0))) return false;
  len++; nums = s.substring(0, len); sum = 0; pos = len - 7;
  for (let i = len; i >= 1; i--) {
    sum += parseInt(nums.charAt(len - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return r === parseInt(digits.charAt(1));
}

const initialForm = {
  nome_fantasia: '', razao_social: '', cnpj: '', inscricao_estadual: '',
  email_contato: '', telefone_comercial: '', whatsapp: '', slug: '',
  cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  owner_nome: '', owner_cpf: '', owner_email: '', owner_telefone: '', owner_data_nascimento: '',
  plano: 'starter', ciclo: 'mensal', valor: '', data_inicio: '', proximo_vencimento: '',
  status_cobranca: 'trial', trial_ate: '', forma_pagamento: '', observacoes_internas: '', limite_usuarios: '3',
  gerar_senha_automatica: true, enviar_credenciais_email: true,
};

export default function NovaBarbearia() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [senhaModal, setSenhaModal] = useState(null); // { senha }
  const [copied, setCopied] = useState(false);
  const [showSenha, setShowSenha] = useState(false);

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }));
  const check = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.checked }));

  function validate() {
    const e = {};
    if (!form.nome_fantasia) e.nome_fantasia = 'Obrigatório';
    if (!form.slug) e.slug = 'Obrigatório';
    if (!form.owner_email) e.owner_email = 'Obrigatório';
    if (form.owner_cpf && !validateCPF(form.owner_cpf)) e.owner_cpf = 'CPF inválido';
    if (form.cnpj && !validateCNPJ(form.cnpj)) e.cnpj = 'CNPJ inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    console.log('[NovaBarbearia] handleSubmit iniciado');
    if (!validate()) {
      console.log('[NovaBarbearia] validação falhou', errors);
      return;
    }
    setLoading(true);
    setErrors({});
    const payload = {
      name: form.nome_fantasia,
      nome_fantasia: form.nome_fantasia, razao_social: form.razao_social,
      cnpj: form.cnpj, inscricao_estadual: form.inscricao_estadual,
      email_contato: form.email_contato, telefone_comercial: form.telefone_comercial,
      whatsapp: form.whatsapp, slug: form.slug,
      endereco: { cep: form.cep, rua: form.rua, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, uf: form.uf },
      owner_nome: form.owner_nome, owner_cpf: form.owner_cpf, owner_email: form.owner_email,
      owner_telefone: form.owner_telefone, owner_data_nascimento: form.owner_data_nascimento,
      plano: form.plano, ciclo: form.ciclo, valor: form.valor ? Number(form.valor) : undefined,
      data_inicio: form.data_inicio, proximo_vencimento: form.proximo_vencimento,
      status_cobranca: form.status_cobranca, trial_ate: form.trial_ate,
      forma_pagamento: form.forma_pagamento, observacoes_internas: form.observacoes_internas,
      limite_usuarios: Number(form.limite_usuarios) || 3,
      gerar_senha_automatica: form.gerar_senha_automatica,
      enviar_credenciais_email: form.enviar_credenciais_email,
      origin: window.location.origin,
    };
    console.log('[NovaBarbearia] payload enviado:', payload);

    try {
      const res = await base44.functions.invoke('createBarbearia', payload);
      console.log('[NovaBarbearia] resposta:', res.data);
      setLoading(false);
      if (res.data?.success) {
        if (res.data.senha_gerada) {
          setSenhaModal({ senha: res.data.senha_gerada, email_enviado: res.data.email_enviado });
        } else {
          navigate('/master/barbearias');
        }
      } else {
        setErrors({ _global: res.data?.error || 'Erro ao criar barbearia' });
      }
    } catch (err) {
      console.error('[NovaBarbearia] erro na requisição:', err);
      setLoading(false);
      setErrors({ _global: err?.response?.data?.error || err.message || 'Erro inesperado ao criar barbearia' });
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(senhaModal.senha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      <header className="bg-[#1B3A4B] text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold">BarbeiroPro AI — Master</div>
            <div className="text-xs text-white/60">Nova barbearia</div>
          </div>
        </div>
        <Link to="/master/barbearias" className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <ArrowLeft className="w-4 h-4" />Voltar
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-black text-[#1B1C1E] mb-6">Nova barbearia cliente</h1>

        {errors._global && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">{errors._global}</div>
        )}

        {/* SEÇÃO 1: Dados da barbearia */}
        <SECTION title="1. Dados da barbearia">
          <Field label="Nome fantasia" required>
            <Input value={form.nome_fantasia} onChange={set('nome_fantasia')} />
            {errors.nome_fantasia && <p className="text-red-500 text-xs mt-1">{errors.nome_fantasia}</p>}
          </Field>
          <Field label="Razão social">
            <Input value={form.razao_social} onChange={set('razao_social')} />
          </Field>
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
            {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj}</p>}
          </Field>
          <Field label="Inscrição estadual">
            <Input value={form.inscricao_estadual} onChange={set('inscricao_estadual')} />
          </Field>
          <Field label="E-mail de contato">
            <Input value={form.email_contato} onChange={set('email_contato')} type="email" />
          </Field>
          <Field label="Telefone comercial">
            <Input value={form.telefone_comercial} onChange={set('telefone_comercial')} />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={set('whatsapp')} />
          </Field>
          <Field label="Slug (URL pública)" required>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">/agendar/</span>
              <Input value={form.slug} onChange={set('slug')} placeholder="minha-barbearia" />
            </div>
            {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug}</p>}
          </Field>
          <Field label="CEP">
            <Input value={form.cep} onChange={set('cep')} />
          </Field>
          <Field label="Rua">
            <Input value={form.rua} onChange={set('rua')} />
          </Field>
          <Field label="Número">
            <Input value={form.numero} onChange={set('numero')} />
          </Field>
          <Field label="Complemento">
            <Input value={form.complemento} onChange={set('complemento')} />
          </Field>
          <Field label="Bairro">
            <Input value={form.bairro} onChange={set('bairro')} />
          </Field>
          <Field label="Cidade">
            <Input value={form.cidade} onChange={set('cidade')} />
          </Field>
          <Field label="UF">
            <Select value={form.uf} onChange={set('uf')} options={[
              { value: '', label: 'Selecionar' },
              ...['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u => ({ value: u, label: u }))
            ]} />
          </Field>
        </SECTION>

        {/* SEÇÃO 2: Responsável */}
        <SECTION title="2. Responsável / Dono">
          <Field label="Nome completo">
            <Input value={form.owner_nome} onChange={set('owner_nome')} />
          </Field>
          <Field label="CPF">
            <Input value={form.owner_cpf} onChange={set('owner_cpf')} placeholder="000.000.000-00" />
            {errors.owner_cpf && <p className="text-red-500 text-xs mt-1">{errors.owner_cpf}</p>}
          </Field>
          <Field label="E-mail (login)" required>
            <Input value={form.owner_email} onChange={set('owner_email')} type="email" />
            {errors.owner_email && <p className="text-red-500 text-xs mt-1">{errors.owner_email}</p>}
          </Field>
          <Field label="Telefone">
            <Input value={form.owner_telefone} onChange={set('owner_telefone')} />
          </Field>
          <Field label="Data de nascimento">
            <Input value={form.owner_data_nascimento} onChange={set('owner_data_nascimento')} type="date" />
          </Field>
        </SECTION>

        {/* SEÇÃO 3: Plano e cobrança */}
        <SECTION title="3. Plano e cobrança">
          <Field label="Plano">
            <Select value={form.plano} onChange={set('plano')} options={[
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'premium', label: 'Premium' },
            ]} />
          </Field>
          <Field label="Ciclo">
            <Select value={form.ciclo} onChange={set('ciclo')} options={[
              { value: 'mensal', label: 'Mensal' },
              { value: 'anual', label: 'Anual' },
            ]} />
          </Field>
          <Field label="Valor (R$)">
            <Input value={form.valor} onChange={set('valor')} type="number" placeholder="0.00" />
          </Field>
          <Field label="Status de cobrança">
            <Select value={form.status_cobranca} onChange={set('status_cobranca')} options={[
              { value: 'trial', label: 'Trial' },
              { value: 'ativo', label: 'Ativo' },
              { value: 'inadimplente', label: 'Inadimplente' },
              { value: 'suspenso', label: 'Suspenso' },
              { value: 'cancelado', label: 'Cancelado' },
            ]} />
          </Field>
          <Field label="Trial até">
            <Input value={form.trial_ate} onChange={set('trial_ate')} type="date" />
          </Field>
          <Field label="Data de início">
            <Input value={form.data_inicio} onChange={set('data_inicio')} type="date" />
          </Field>
          <Field label="Próximo vencimento">
            <Input value={form.proximo_vencimento} onChange={set('proximo_vencimento')} type="date" />
          </Field>
          <Field label="Forma de pagamento">
            <Input value={form.forma_pagamento} onChange={set('forma_pagamento')} placeholder="Pix, cartão, boleto..." />
          </Field>
          <Field label="Limite de usuários">
            <Input value={form.limite_usuarios} onChange={set('limite_usuarios')} type="number" />
          </Field>
          <Field label="Observações internas" full>
            <textarea value={form.observacoes_internas} onChange={e => set('observacoes_internas')(e.target.value)}
              rows={3} placeholder="Notas internas sobre este cliente..."
              className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 resize-none" />
          </Field>
        </SECTION>

        {/* SEÇÃO 4: Acesso do administrador */}
        <div className="bg-white rounded-2xl border border-black/8 p-6 mb-8">
          <h2 className="font-bold text-[#1B1C1E] text-base mb-5 pb-3 border-b border-black/8">4. Acesso do administrador da barbearia</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={form.gerar_senha_automatica} onChange={check('gerar_senha_automatica')}
                className="mt-0.5 w-4 h-4 accent-[#1B3A4B]" />
              <div>
                <div className="text-sm font-semibold text-[#1B1C1E]">Gerar senha automática</div>
                <div className="text-xs text-gray-400 mt-0.5">Uma senha forte de 12 caracteres será gerada, exibida uma única vez após o cadastro e o dono será obrigado a trocá-la no primeiro login.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={form.enviar_credenciais_email} onChange={check('enviar_credenciais_email')}
                className="mt-0.5 w-4 h-4 accent-[#1B3A4B]" />
              <div>
                <div className="text-sm font-semibold text-[#1B1C1E]">Enviar credenciais por e-mail</div>
                <div className="text-xs text-gray-400 mt-0.5">Dispara e-mail de boas-vindas para o owner_email com link de acesso (/admin/login), login e senha temporária.</div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Link to="/master/barbearias" className="px-6 py-2.5 border border-black/10 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancelar</Link>
          <button type="submit" disabled={loading}
            className="px-8 py-2.5 bg-[#1B3A4B] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A4B]/90 disabled:opacity-60 transition-colors">
            {loading ? 'Criando...' : 'Criar barbearia'}
          </button>
        </div>
      </form>

      {/* Modal de senha */}
      {senhaModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-black text-xl text-[#1B1C1E] mb-2">Barbearia criada!</h3>
            <p className="text-sm text-gray-500 mb-4">Esta é a senha temporária do administrador. Ela será exibida <strong>apenas uma vez</strong>. Após fechar, só será possível resetar.</p>
            {senhaModal && !senhaModal.email_enviado && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg mb-4">
                ⚠️ O e-mail não pôde ser enviado automaticamente. Copie a senha abaixo e envie manualmente.
              </div>
            )}
            <div className="bg-[#1B3A4B] rounded-xl p-4 mb-4">
              <div className="text-xs text-white/60 mb-2">Senha temporária</div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-white font-mono text-2xl font-bold tracking-widest">
                  {showSenha ? senhaModal.senha : '•'.repeat(senhaModal.senha.length)}
                </span>
                <button onClick={() => setShowSenha(v => !v)} className="text-white/60 hover:text-white">
                  {showSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#1B3A4B]/10 text-[#1B3A4B] rounded-xl font-semibold hover:bg-[#1B3A4B]/20 transition-colors mb-3">
              {copied ? <><Check className="w-4 h-4" />Copiado!</> : <><Copy className="w-4 h-4" />Copiar senha</>}
            </button>
            <button onClick={() => { setSenhaModal(null); navigate('/master/barbearias'); }}
              className="w-full py-2.5 border border-black/10 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
              Fechar e ir para listagem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}