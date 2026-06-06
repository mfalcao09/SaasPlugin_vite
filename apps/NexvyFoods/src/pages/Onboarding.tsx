import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChefHat, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const TIPOS = [
  { value: 'restaurante',  label: 'Restaurante' },
  { value: 'pizzaria',     label: 'Pizzaria' },
  { value: 'hamburgueria', label: 'Hamburgueria' },
  { value: 'lanchonete',   label: 'Lanchonete' },
] as const

const schema = z.object({
  nome_restaurante: z.string().min(2, 'Informe o nome do restaurante'),
  slug: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífens'),
  tipo: z.enum(['restaurante', 'pizzaria', 'hamburgueria', 'lanchonete']),
  telefone: z.string().min(10, 'Informe um telefone válido'),
})
type FormData = z.infer<typeof schema>

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'restaurante' },
  })

  const tipoSelecionado = watch('tipo')

  function handleNomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const slug = e.target.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    setValue('slug', slug, { shouldValidate: true })
  }

  async function onSubmit(data: FormData) {
    if (!user) {
      toast.error('Sessão expirada. Faça login novamente.')
      navigate('/login', { replace: true })
      return
    }

    setLoading(true)

    // 1. Cria a company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: data.nome_restaurante,
        slug: data.slug,
        phone: data.telefone,
        owner_email: user.email,
        status: 'ativo',
        onboarding_completed: true,
        onboarding_step: 6,
      })
      .select('id')
      .single()

    if (companyError) {
      setLoading(false)
      if (companyError.code === '23505') {
        toast.error('Este slug já está em uso. Escolha outro nome de link.')
      } else {
        toast.error('Erro ao criar restaurante. Tente novamente.')
      }
      return
    }

    // 2. Vincula usuário como owner
    const { error: userError } = await supabase.from('company_users').insert({
      company_id: company.id,
      user_id: user.id,
      role: 'owner',
    })

    setLoading(false)

    if (userError) {
      toast.error('Restaurante criado, mas houve um erro ao configurar acesso. Contate o suporte.')
      return
    }

    toast.success('Restaurante criado com sucesso!')
    // Força reload para AuthContext recarregar companyId
    window.location.replace('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <ChefHat className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Configure seu restaurante</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Você está a um passo de começar a receber pedidos
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Nome */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Nome do restaurante
            </label>
            <input
              {...register('nome_restaurante')}
              type="text"
              placeholder="Ex: Pizzaria do Zé"
              onChange={(e) => {
                void register('nome_restaurante').onChange(e)
                handleNomeChange(e)
              }}
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.nome_restaurante ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.nome_restaurante && (
              <p className="mt-1 text-xs text-destructive">{errors.nome_restaurante.message}</p>
            )}
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Link do cardápio público
            </label>
            <div className="flex overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-ring">
              <span className="select-none border-r border-input bg-muted px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                nexvy.io/pedir/
              </span>
              <input
                {...register('slug')}
                type="text"
                placeholder="pizzaria-do-ze"
                className={cn(
                  'flex-1 bg-transparent px-3 py-2.5 text-sm outline-none',
                  'placeholder:text-muted-foreground',
                )}
              />
            </div>
            {errors.slug ? (
              <p className="mt-1 text-xs text-destructive">{errors.slug.message}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Gerado automaticamente. Pode editar.</p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Tipo de estabelecimento
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('tipo', value, { shouldValidate: true })}
                  className={cn(
                    'rounded-md border px-4 py-3 text-sm font-medium transition-colors text-left',
                    tipoSelecionado === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input type="hidden" {...register('tipo')} />
            {errors.tipo && (
              <p className="mt-1 text-xs text-destructive">{errors.tipo.message}</p>
            )}
          </div>

          {/* Telefone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Telefone / WhatsApp
            </label>
            <input
              {...register('telefone')}
              type="tel"
              placeholder="(11) 99999-9999"
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.telefone ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.telefone && (
              <p className="mt-1 text-xs text-destructive">{errors.telefone.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar restaurante e entrar
          </button>
        </form>
      </div>
    </div>
  )
}
