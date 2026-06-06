import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChefHat, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(2, 'Informe seu nome'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function Signup() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name } },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Conta criada! Verifique seu email para confirmar.')
    navigate('/onboarding', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <ChefHat className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">NexvyFoods</h1>
            <p className="text-sm text-muted-foreground">Crie sua conta gratuita</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Nome completo</label>
            <input
              {...register('name')}
              type="text"
              placeholder="João Silva"
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.name ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="voce@restaurante.com.br"
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.email ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Senha</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.password ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Confirmar senha</label>
            <input
              {...register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition',
                'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring',
                errors.confirmPassword ? 'border-destructive' : 'border-input',
              )}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar conta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
