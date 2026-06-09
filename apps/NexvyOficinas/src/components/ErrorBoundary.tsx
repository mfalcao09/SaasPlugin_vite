import { Component, type ReactNode } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Sprint 10 F6 — log estruturado, sem expor stack pro usuário
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-orange-600/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              Algo deu errado
            </h1>
            <p className="text-slate-400 mb-4 text-sm">
              Encontramos um erro inesperado. Tente recarregar a página.
            </p>
            {this.state.error?.message ? (
              <p className="text-slate-500 mb-4 text-xs font-mono bg-slate-900 px-3 py-2 rounded border border-slate-800 break-all">
                {this.state.error.message}
              </p>
            ) : null}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
