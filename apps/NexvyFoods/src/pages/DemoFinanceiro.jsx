import React, { useState } from 'react';
import DemoMode from './DemoMode';
import { DEMO_FINANCIAL } from '@/lib/demo-data';
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const entradas = DEMO_FINANCIAL.filter(f => f.type === 'entrada').reduce((s, f) => s + f.amount, 0);
const saidas = DEMO_FINANCIAL.filter(f => f.type === 'saida').reduce((s, f) => s + f.amount, 0);
const saldo = entradas - saidas;

export default function DemoFinanceiro() {
  const [filter, setFilter] = useState('todos');

  const filtered = filter === 'todos' ? DEMO_FINANCIAL
    : DEMO_FINANCIAL.filter(f => f.type === filter);

  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumo da semana</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-green-200 rounded-xl p-5">
            <div className="flex items-start justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <ArrowUpRight className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">R$ {entradas.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Entradas</p>
          </div>
          <div className="bg-white border border-red-200 rounded-xl p-5">
            <div className="flex items-start justify-between mb-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">R$ {saidas.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Saídas</p>
          </div>
          <div className={`border rounded-xl p-5 ${saldo >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <DollarSign className={`w-5 h-5 mb-2 ${saldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
            <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>R$ {saldo.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Saldo</p>
          </div>
        </div>

        {/* Filtro */}
        <div className="flex gap-2">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'entrada', label: 'Entradas' },
            { key: 'saida', label: 'Saídas' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f.key ? 'bg-foreground text-background' : 'bg-white border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors">
            + Nova Saída
          </button>
        </div>

        {/* Movimentações */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {filtered.map((entry, i) => (
            <div key={entry.id} className={`flex items-center justify-between px-5 py-4 ${i < filtered.length - 1 ? 'border-b border-border' : ''} hover:bg-secondary/20 transition-colors`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  entry.type === 'entrada' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {entry.type === 'entrada'
                    ? <ArrowUpRight className="w-4 h-4 text-green-600" />
                    : <ArrowDownRight className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold ${entry.type === 'entrada' ? 'text-green-700' : 'text-red-600'}`}>
                  {entry.type === 'entrada' ? '+' : '-'} R$ {entry.amount.toFixed(2)}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  entry.status === 'pago' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {entry.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DemoMode>
  );
}