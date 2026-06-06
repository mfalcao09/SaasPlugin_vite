import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  barbeariaId: string | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, barbeariaId: null, loading: true, signOut: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [barbeariaId, setBarbeariaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadBarbeariaId(userId: string) {
    const { data } = await supabase
      .from('barbearia_users')
      .select('barbearia_id')
      .eq('user_id', userId)
      .single()
    setBarbeariaId(data?.barbearia_id ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadBarbeariaId(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadBarbeariaId(session.user.id)
      } else {
        setBarbeariaId(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setBarbeariaId(null)
  }

  return (
    <AuthContext.Provider value={{ user, barbeariaId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
