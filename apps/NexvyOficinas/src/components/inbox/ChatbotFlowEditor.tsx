// Sprint8 F4 — Editor de Chatbot de Fluxo (árvore de decisão)
// Tabelas: inbox_chatbot_flows, inbox_chatbot_nodes
// Cada fluxo tem nós: message | question | end
// Nó raiz (is_root=true) é enviado ao iniciar a sessão
// Lógica de execução fica em evolution-webhook/index.ts

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Loader2, Check, X, ChevronDown, ChevronRight, GitBranch, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ChatbotOption {
  label: string
  next_node_id: string | null
}

interface ChatbotNode {
  id: string
  flow_id: string
  node_type: 'message' | 'question' | 'end'
  message: string
  options: ChatbotOption[]
  is_root: boolean
  created_at: string
}

interface ChatbotFlow {
  id: string
  name: string
  is_active: boolean
  trigger_keywords: string[]
  created_at: string
}

interface Props {
  empresaId: string | null
}

const EMPTY_NODE_FORM = {
  node_type: 'message' as ChatbotNode['node_type'],
  message: '',
  options: [] as ChatbotOption[],
}

export default function ChatbotFlowEditor({ empresaId }: Props) {
  const [flows, setFlows] = useState<ChatbotFlow[]>([])
  const [loadingFlows, setLoadingFlows] = useState(true)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<ChatbotNode[]>([])
  const [loadingNodes, setLoadingNodes] = useState(false)

  // Form de fluxo
  const [showFlowForm, setShowFlowForm] = useState(false)
  const [flowForm, setFlowForm] = useState({ name: '', trigger_keywords: '' })
  const [savingFlow, setSavingFlow] = useState(false)
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)

  // Form de nó
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [nodeForm, setNodeForm] = useState(EMPTY_NODE_FORM)
  const [savingNode, setSavingNode] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [optionInput, setOptionInput] = useState('')

  const [error, setError] = useState<string | null>(null)

  // ── Carregar fluxos ───────────────────────────────────────────────────────
  async function loadFlows() {
    if (!empresaId) return
    const { data } = await supabase
      .from('inbox_chatbot_flows')
      .select('id,name,is_active,trigger_keywords,created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
    if (data) setFlows(data as ChatbotFlow[])
    setLoadingFlows(false)
  }

  useEffect(() => { loadFlows() }, [empresaId])

  // ── Carregar nós do fluxo selecionado ─────────────────────────────────────
  async function loadNodes(flowId: string) {
    setLoadingNodes(true)
    const { data } = await supabase
      .from('inbox_chatbot_nodes')
      .select('id,flow_id,node_type,message,options,is_root,created_at')
      .eq('flow_id', flowId)
      .order('created_at', { ascending: true })
    if (data) setNodes(data as ChatbotNode[])
    setLoadingNodes(false)
  }

  function selectFlow(flowId: string) {
    setSelectedFlowId(flowId)
    setShowNodeForm(false)
    loadNodes(flowId)
  }

  // ── Toggle ativo/inativo do fluxo ─────────────────────────────────────────
  async function toggleFlowActive(flow: ChatbotFlow) {
    const next = !flow.is_active
    setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: next } : f))
    await supabase.from('inbox_chatbot_flows').update({ is_active: next }).eq('id', flow.id)
  }

  // ── Salvar fluxo ──────────────────────────────────────────────────────────
  async function handleSaveFlow() {
    if (!empresaId || !flowForm.name.trim()) return
    setSavingFlow(true)
    setError(null)
    try {
      const keywords = flowForm.trigger_keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean)

      if (editingFlowId) {
        await supabase
          .from('inbox_chatbot_flows')
          .update({ name: flowForm.name.trim(), trigger_keywords: keywords })
          .eq('id', editingFlowId)
      } else {
        const { data: newFlow } = await supabase
          .from('inbox_chatbot_flows')
          .insert({ empresa_id: empresaId, name: flowForm.name.trim(), trigger_keywords: keywords, is_active: false })
          .select('id')
          .single()
        if (newFlow) selectFlow(newFlow.id)
      }

      await loadFlows()
      setShowFlowForm(false)
      setFlowForm({ name: '', trigger_keywords: '' })
      setEditingFlowId(null)
    } finally {
      setSavingFlow(false)
    }
  }

  // ── Excluir fluxo ─────────────────────────────────────────────────────────
  async function handleDeleteFlow(flowId: string) {
    if (!confirm('Excluir este fluxo e todos os seus nós?')) return
    await supabase.from('inbox_chatbot_flows').delete().eq('id', flowId)
    setFlows(prev => prev.filter(f => f.id !== flowId))
    if (selectedFlowId === flowId) { setSelectedFlowId(null); setNodes([]) }
  }

  // ── Salvar nó ─────────────────────────────────────────────────────────────
  async function handleSaveNode() {
    if (!selectedFlowId || !nodeForm.message.trim()) return
    setSavingNode(true)
    setError(null)
    try {
      if (editingNodeId) {
        await supabase
          .from('inbox_chatbot_nodes')
          .update({
            node_type: nodeForm.node_type,
            message: nodeForm.message.trim(),
            options: nodeForm.options,
          })
          .eq('id', editingNodeId)
      } else {
        await supabase.from('inbox_chatbot_nodes').insert({
          flow_id: selectedFlowId,
          node_type: nodeForm.node_type,
          message: nodeForm.message.trim(),
          options: nodeForm.options,
          is_root: false,
        })
      }
      await loadNodes(selectedFlowId)
      setShowNodeForm(false)
      setNodeForm(EMPTY_NODE_FORM)
      setEditingNodeId(null)
    } finally {
      setSavingNode(false)
    }
  }

  // ── Excluir nó ────────────────────────────────────────────────────────────
  async function handleDeleteNode(nodeId: string) {
    if (!confirm('Excluir este nó?')) return
    await supabase.from('inbox_chatbot_nodes').delete().eq('id', nodeId)
    setNodes(prev => prev.filter(n => n.id !== nodeId))
  }

  // ── Definir como nó raiz ──────────────────────────────────────────────────
  async function handleSetRoot(nodeId: string) {
    if (!selectedFlowId) return
    // Remove is_root de todos no fluxo, depois seta no nó selecionado
    await supabase.from('inbox_chatbot_nodes').update({ is_root: false }).eq('flow_id', selectedFlowId)
    await supabase.from('inbox_chatbot_nodes').update({ is_root: true }).eq('id', nodeId)
    setNodes(prev => prev.map(n => ({ ...n, is_root: n.id === nodeId })))
  }

  // ── Opções do nó ──────────────────────────────────────────────────────────
  function addOption() {
    if (!optionInput.trim()) return
    setNodeForm(prev => ({
      ...prev,
      options: [...prev.options, { label: optionInput.trim(), next_node_id: null }],
    }))
    setOptionInput('')
  }

  function removeOption(idx: number) {
    setNodeForm(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedFlow = flows.find(f => f.id === selectedFlowId)

  if (loadingFlows) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-0">
      {/* Lista de fluxos */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Fluxos</p>
          <button
            onClick={() => {
              setShowFlowForm(true)
              setEditingFlowId(null)
              setFlowForm({ name: '', trigger_keywords: '' })
            }}
            className="text-orange-400 hover:text-orange-300 p-1 rounded"
            title="Novo fluxo"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Formulário de fluxo */}
        {showFlowForm && (
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 space-y-2">
            <Input
              value={flowForm.name}
              onChange={e => setFlowForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nome do fluxo"
              className="bg-slate-700 border-slate-600 text-white text-xs placeholder:text-slate-500"
            />
            <Input
              value={flowForm.trigger_keywords}
              onChange={e => setFlowForm(prev => ({ ...prev, trigger_keywords: e.target.value }))}
              placeholder="Palavras-chave (vírgula)"
              className="bg-slate-700 border-slate-600 text-white text-xs placeholder:text-slate-500"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={handleSaveFlow}
                disabled={savingFlow || !flowForm.name.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-500 text-white text-xs h-7"
              >
                {savingFlow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowFlowForm(false)}
                className="flex-1 text-slate-400 text-xs h-7"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {flows.length === 0 && !showFlowForm && (
          <p className="text-xs text-slate-500 text-center py-4">Nenhum fluxo criado.</p>
        )}

        {flows.map(flow => (
          <div
            key={flow.id}
            onClick={() => selectFlow(flow.id)}
            className={[
              'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border',
              selectedFlowId === flow.id
                ? 'bg-orange-600/20 border-orange-500/50'
                : 'bg-slate-800 border-transparent hover:border-slate-600',
            ].join(' ')}
          >
            <GitBranch className="h-3.5 w-3.5 text-orange-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{flow.name}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {flow.trigger_keywords.length > 0
                  ? flow.trigger_keywords.slice(0, 2).join(', ')
                  : 'Sem keywords'}
              </p>
            </div>
            {/* Toggle ativo/inativo */}
            <button
              onClick={e => { e.stopPropagation(); toggleFlowActive(flow) }}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0 ${
                flow.is_active ? 'bg-orange-500' : 'bg-slate-600'
              }`}
              title={flow.is_active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}
            >
              <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                flow.is_active ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteFlow(flow.id) }}
              className="text-slate-500 hover:text-red-400 p-0.5 shrink-0"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Editor de nós */}
      <div className="flex-1 min-w-0">
        {!selectedFlow ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <GitBranch className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Selecione ou crie um fluxo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header do fluxo */}
            <div className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-white">{selectedFlow.name}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                selectedFlow.is_active
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-slate-600 text-slate-400'
              }`}>
                {selectedFlow.is_active ? 'ativo' : 'inativo'}
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={() => {
                  setShowNodeForm(true)
                  setEditingNodeId(null)
                  setNodeForm(EMPTY_NODE_FORM)
                  setOptionInput('')
                }}
                className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-7"
              >
                <Plus className="h-3 w-3 mr-1" />
                Nó
              </Button>
            </div>

            {/* Form de nó */}
            {showNodeForm && (
              <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-white">
                  {editingNodeId ? 'Editar nó' : 'Novo nó'}
                </h4>

                {/* Tipo de nó */}
                <div className="flex gap-2">
                  {(['message', 'question', 'end'] as ChatbotNode['node_type'][]).map(t => (
                    <button
                      key={t}
                      onClick={() => setNodeForm(prev => ({ ...prev, node_type: t }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        nodeForm.node_type === t
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'message' ? 'Mensagem' : t === 'question' ? 'Pergunta' : 'Fim'}
                    </button>
                  ))}
                </div>

                {/* Texto da mensagem */}
                <textarea
                  value={nodeForm.message}
                  onChange={e => setNodeForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Texto da mensagem ou pergunta..."
                  rows={3}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />

                {/* Opções (apenas para tipo question) */}
                {nodeForm.node_type === 'question' && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Opções de resposta do cliente:</p>
                    {nodeForm.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-1.5">
                        <p className="flex-1 text-xs text-slate-200">{opt.label}</p>
                        <button
                          onClick={() => removeOption(idx)}
                          className="text-slate-500 hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={optionInput}
                        onChange={e => setOptionInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                        placeholder="Texto da opção + Enter"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <button onClick={addOption} className="text-orange-400 hover:text-orange-300 p-1">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNode}
                    disabled={savingNode || !nodeForm.message.trim()}
                    className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                  >
                    {savingNode ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowNodeForm(false); setEditingNodeId(null) }}
                    className="text-slate-400 text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Lista de nós */}
            {loadingNodes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : nodes.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nenhum nó criado. Clique em "+ Nó" para começar.
              </p>
            ) : (
              <div className="space-y-2">
                {nodes.map(node => (
                  <div
                    key={node.id}
                    className={[
                      'flex items-start gap-3 p-3 rounded-lg border',
                      node.is_root
                        ? 'bg-amber-900/20 border-amber-600/40'
                        : 'bg-slate-800 border-slate-700',
                    ].join(' ')}
                  >
                    <div className="shrink-0 mt-0.5">
                      {node.is_root
                        ? <Flag className="h-4 w-4 text-amber-400" />
                        : node.node_type === 'end'
                          ? <ChevronDown className="h-4 w-4 text-red-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          node.node_type === 'message' ? 'bg-blue-500/20 text-blue-400' :
                          node.node_type === 'question' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {node.node_type === 'message' ? 'Mensagem' : node.node_type === 'question' ? 'Pergunta' : 'Fim'}
                        </span>
                        {node.is_root && (
                          <span className="text-[10px] text-amber-400 font-medium">Nó raiz</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 line-clamp-2">{node.message}</p>
                      {node.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {node.options.map((opt, i) => (
                            <span key={i} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                              {opt.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!node.is_root && (
                        <button
                          onClick={() => handleSetRoot(node.id)}
                          className="text-slate-500 hover:text-amber-400 p-1"
                          title="Definir como nó raiz"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingNodeId(node.id)
                          setNodeForm({
                            node_type: node.node_type,
                            message: node.message,
                            options: node.options,
                          })
                          setShowNodeForm(true)
                        }}
                        className="text-slate-500 hover:text-white p-1"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNode(node.id)}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
