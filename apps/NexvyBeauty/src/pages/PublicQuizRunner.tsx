import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronRight, Sparkles, Check } from 'lucide-react';
import { useFunnelBySlug } from '@/hooks/useFunnels';
import { supabase } from '@/integrations/supabase/client';
import {
  FunnelBlock,
  VARIABLE_TO_LEAD_FIELD,
  getChannelAppearance,
  defaultChannelAppearance,
  type QuizChannelOptions,
} from '@/types/funnel';
import { ensureFontLoaded, shadowToCss } from '@/lib/funnelAppearance';
import { pickContrast } from '@/lib/colors';
import { QuizResultView } from '@/components/quiz/QuizResultView';
import { cn } from '@/lib/utils';
import { evaluateDisplay } from '@/lib/quizDisplayRules';

/**
 * Renderer público do Quiz no padrão inlead (form-style, 1 tela por bloco).
 * Não usa header de bot, avatar, balões — UI 100% focada na pergunta.
 */
export default function PublicQuizRunner() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { data: funnel, isLoading, error } = useFunnelBySlug(slug, 'quiz');

  const [stepIndex, setStepIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const responsesRef = useRef<Record<string, string>>({});
  const scoreRef = useRef(0);
  const tagsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  // ───── Ordenação dos blocos (mesma lógica do PublicChat) ─────
  const orderedBlocks = useMemo<FunnelBlock[]>(() => {
    if (!funnel?.flow_blocks?.length) return [];
    const blocks = funnel.flow_blocks;
    let start = blocks.find((b) => b.id === funnel.start_block_id);
    if (!start) {
      const targeted = new Set(
        blocks.flatMap((b) => [
          b.next_block_id,
          b.data.true_next_block_id,
          b.data.false_next_block_id,
          ...(b.data.options?.map((o) => o.next_block_id) || []),
        ].filter(Boolean)),
      );
      start = blocks.find((b) => !targeted.has(b.id));
    }
    if (!start) {
      start = [...blocks].sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      )[0];
    }
    if (!start) return [];
    const out: FunnelBlock[] = [];
    const seen = new Set<string>();
    let cur: FunnelBlock | undefined = start;
    while (cur && !seen.has(cur.id) && out.length < blocks.length + 5) {
      out.push(cur);
      seen.add(cur.id);
      cur = cur.next_block_id ? blocks.find((b) => b.id === cur!.next_block_id) : undefined;
    }
    return out;
  }, [funnel]);

  // ───── Aparência ─────
  const a = useMemo(
    () => (funnel ? getChannelAppearance(funnel as any, 'quiz') : defaultChannelAppearance('quiz')),
    [funnel],
  );
  const opts = a.channel_options as QuizChannelOptions;
  useEffect(() => { ensureFontLoaded(a.font_family); }, [a.font_family]);

  // Track view 1x
  const trackedRef = useRef(false);
  useEffect(() => {
    if (funnel?.id && !trackedRef.current && !isPreview) {
      trackedRef.current = true;
      supabase.rpc('increment_funnel_views', { p_funnel_id: funnel.id, p_channel: 'quiz' });
    }
  }, [funnel?.id, isPreview]);

  // ───── Mobile detection (para regras de display por dispositivo) ─────
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ───── Pular blocos "silenciosos" (score/tag/condition/delay) + regras de display ─────
  const resolveVisible = (fromIdx: number): number => {
    let i = fromIdx;
    while (i < orderedBlocks.length) {
      const b = orderedBlocks[i];
      if (b.type === 'score') {
        scoreRef.current += Number((b.data as any)?.score_value || 0);
        i++; continue;
      }
      if (b.type === 'tag') {
        ((b.data as any)?.apply_tags as string[] | undefined)?.forEach((t) => tagsRef.current.add(t));
        i++; continue;
      }
      if (b.type === 'condition') {
        const cond = b.data.condition;
        let matched = false;
        if (cond?.variable) {
          const left = String(responsesRef.current[cond.variable] ?? '').trim().toLowerCase();
          const right = String(cond.value ?? '').trim().toLowerCase();
          const ln = Number(left), rn = Number(right);
          switch (cond.operator) {
            case 'equals': matched = left === right; break;
            case 'not_equals': matched = left !== right; break;
            case 'contains': matched = left.includes(right); break;
            case 'greater_than': matched = !isNaN(ln) && !isNaN(rn) && ln > rn; break;
            case 'less_than': matched = !isNaN(ln) && !isNaN(rn) && ln < rn; break;
          }
        }
        const targetId = matched ? b.data.true_next_block_id : b.data.false_next_block_id;
        if (targetId) {
          const idx = orderedBlocks.findIndex((x) => x.id === targetId);
          if (idx >= 0) { i = idx; continue; }
        }
        i++; continue;
      }
      if (b.type === 'delay') { i++; continue; }
      // Regra de exibição (device + condicionais sobre respostas)
      if (!evaluateDisplay(b.data.block_display, { responses: responsesRef.current, isMobile })) {
        i++; continue;
      }
      // bloco renderizável
      return i;
    }
    return -1;
  };

  const visibleIndex = useMemo(() => resolveVisible(stepIndex), [stepIndex, orderedBlocks, isMobile, responses]);
  const currentBlock: FunnelBlock | undefined = visibleIndex >= 0 ? orderedBlocks[visibleIndex] : undefined;

  // ───── Progresso ─────
  const totalSteps = orderedBlocks.filter((b) => ['message', 'text', 'buttons', 'input', 'end'].includes(b.type as any)).length || 1;
  const currentStepNumber = currentBlock
    ? orderedBlocks.slice(0, visibleIndex + 1).filter((b) => ['message', 'text', 'buttons', 'input', 'end'].includes(b.type as any)).length
    : totalSteps;
  const progressPct = Math.min(100, Math.round((currentStepNumber / totalSteps) * 100));

  // ───── Submit final ─────
  const submitLead = async () => {
    if (submitted || !funnel || isPreview) return;
    setSubmitted(true);
    try {
      const collected: Record<string, string> = {};
      for (const [k, v] of Object.entries(responsesRef.current)) {
        const lf = VARIABLE_TO_LEAD_FIELD[k.toLowerCase()] || k;
        collected[lf] = v;
      }
      const urlParams = new URLSearchParams(window.location.search);
      await supabase.functions.invoke('funnel-submit', {
        body: {
          funnel_id: funnel.id,
          channel: 'quiz',
          responses: responsesRef.current,
          collected_data: collected,
          quiz_score: scoreRef.current,
          quiz_tags: Array.from(tagsRef.current),
          tracking: {
            utm_source: urlParams.get('utm_source') || undefined,
            utm_medium: urlParams.get('utm_medium') || undefined,
            utm_campaign: urlParams.get('utm_campaign') || undefined,
            utm_term: urlParams.get('utm_term') || undefined,
            utm_content: urlParams.get('utm_content') || undefined,
            referrer_url: document.referrer || undefined,
            landing_page: window.location.href,
            user_agent: navigator.userAgent,
          },
        },
      });
    } catch (e) {
      console.error('[quiz] submit error', e);
    }
  };

  // ───── Avançar ─────
  const goNext = (overrideTarget?: string | null) => {
    if (!currentBlock) return;

    if (overrideTarget) {
      const idx = orderedBlocks.findIndex((b) => b.id === overrideTarget);
      if (idx >= 0) {
        setSelectedOptionId(null);
        setInputValue('');
        setStepIndex(idx);
        return;
      }
    }
    if (currentBlock.next_block_id) {
      const idx = orderedBlocks.findIndex((b) => b.id === currentBlock.next_block_id);
      if (idx >= 0) {
        setSelectedOptionId(null);
        setInputValue('');
        setStepIndex(idx);
        return;
      }
    }
    const nextIdx = visibleIndex + 1;
    if (nextIdx < orderedBlocks.length) {
      setSelectedOptionId(null);
      setInputValue('');
      setStepIndex(nextIdx);
    } else {
      setIsComplete(true);
      submitLead();
    }
  };

  const handleCtaText = () => {
    // intro / message: só avança
    goNext();
  };

  const handleSelectOption = (optionId: string) => {
    setSelectedOptionId(optionId);
  };

  const handleConfirmOption = () => {
    if (!currentBlock || currentBlock.type !== 'buttons' || !selectedOptionId) return;
    const opt = currentBlock.data.options?.find((o) => o.id === selectedOptionId);
    if (!opt) return;
    const variable = currentBlock.data.variable_name || currentBlock.id;
    const next = { ...responsesRef.current, [variable]: opt.label };
    setResponses(next);
    responsesRef.current = next;
    if (opt.score) scoreRef.current += Number(opt.score) || 0;
    if (opt.tag) tagsRef.current.add(String(opt.tag));
    goNext(opt.next_block_id);
  };

  const handleSubmitInput = () => {
    if (!currentBlock || currentBlock.type !== 'input') return;
    const text = inputValue.trim();
    if (currentBlock.data.required && !text) return;
    const variable = currentBlock.data.variable_name || currentBlock.id;
    const next = { ...responsesRef.current, [variable]: text };
    setResponses(next);
    responsesRef.current = next;
    goNext();
  };

  // ───── Tela final automática quando bloco "end" é atingido ─────
  useEffect(() => {
    if (currentBlock?.type === 'end' && !submitted) submitLead();
    // redirect_url opcional
    if (currentBlock?.type === 'end' && currentBlock.data.redirect_url && !isPreview) {
      const t = setTimeout(() => {
        window.location.href = currentBlock.data.redirect_url!;
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [currentBlock?.id]);

  // ───── Loading / erro ─────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">Quiz não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link pode estar inativo ou incorreto.</p>
        </div>
      </div>
    );
  }

  // ───── Tokens visuais ─────
  const isDarkBg = isColorDark(a.background_color);
  const subtleBg = isDarkBg ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';
  const subtleBorder = isDarkBg ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const trackBg = isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
  const mutedText = isDarkBg ? 'rgba(255,255,255,0.65)' : 'rgba(15,23,42,0.55)';
  const primaryFg = pickContrast(a.primary_color);

  const showLogo = a.logo_url && (currentBlock?.data.show_logo !== false);
  const ctaLabel = currentBlock?.data.cta_label || 'Continuar';
  const ctaEmoji = currentBlock?.data.cta_emoji || '👉';

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        backgroundColor: a.background_color,
        color: a.text_color,
        fontFamily: `${a.font_family}, Inter, system-ui, sans-serif`,
        fontSize: a.font_size_base,
      }}
    >
      {/* Barra de progresso fina top */}
      {opts.show_progress !== false && (
        <div className="w-full h-1.5" style={{ background: trackBg }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%`, background: a.primary_color }}
          />
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 w-full flex items-start sm:items-center justify-center px-5 sm:px-6 py-6 sm:py-10">
        <div className="w-full max-w-[480px] mx-auto flex flex-col">
          {showLogo && (
            <img
              src={a.logo_url}
              alt=""
              className={cn(
                'h-10 object-contain mb-6',
                a.logo_position === 'center' ? 'mx-auto' : '',
              )}
            />
          )}

          <AnimatePresence mode="wait">
            {isComplete && !currentBlock ? (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-center py-10"
              >
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: a.primary_color }}
                >
                  <Check className="h-7 w-7" style={{ color: primaryFg }} />
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>
                  Obrigado!
                </h2>
                <p className="text-sm" style={{ color: mutedText }}>
                  Suas respostas foram registradas com sucesso.
                </p>
              </motion.div>
            ) : currentBlock ? (
              <motion.div
                key={currentBlock.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-col"
              >
                {/* Título + subtítulo + badge duração */}
                {currentBlock.type !== 'end' && (
                  <>
                    <h1
                      className="font-bold leading-[1.15] mb-2"
                      style={{
                        fontSize: `clamp(${a.font_size_base * 1.6}px, 6vw, ${a.font_size_base * 2.2}px)`,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {currentBlock.data.content || 'Pergunta'}
                    </h1>
                    {currentBlock.data.subtitle && (
                      <p
                        className="mb-3 leading-snug"
                        style={{ color: mutedText, fontSize: a.font_size_base * 1.05 }}
                      >
                        {currentBlock.data.subtitle}
                      </p>
                    )}
                    {currentBlock.data.show_duration && (
                      <p className="mb-5 text-xs font-medium" style={{ color: mutedText }}>
                        ⏳ {currentBlock.data.duration_label || 'Duração de 2min para responder'}
                      </p>
                    )}
                  </>
                )}

                {/* Imagem opcional */}
                {currentBlock.data.image_url && currentBlock.type !== 'end' && (
                  <img
                    src={currentBlock.data.image_url}
                    alt=""
                    className="w-full rounded-xl mb-5 object-cover max-h-[240px]"
                    style={{ borderRadius: a.border_radius }}
                  />
                )}

                {/* Conteúdo por tipo */}
                {(currentBlock.type === 'message' || currentBlock.type === ('text' as any)) && (
                  <div className="mt-2" />
                )}

                {currentBlock.type === 'buttons' && (
                  <div className="space-y-3 mb-2">
                    {(currentBlock.data.options || []).map((opt) => {
                      const selected = selectedOptionId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectOption(opt.id)}
                          className="w-full text-left px-4 py-4 sm:py-[18px] flex items-center gap-3 transition-all active:scale-[0.99]"
                          style={{
                            background: selected ? a.primary_color : subtleBg,
                            color: selected ? primaryFg : a.text_color,
                            borderRadius: a.border_radius,
                            border: `1.5px solid ${selected ? a.primary_color : subtleBorder}`,
                            boxShadow: selected ? shadowToCss(a.shadow) : 'none',
                          }}
                        >
                          <span
                            className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all"
                            style={{
                              background: selected ? 'rgba(255,255,255,0.25)' : 'transparent',
                              border: `2px solid ${selected ? primaryFg : subtleBorder}`,
                            }}
                          >
                            {selected && <Check className="h-3.5 w-3.5" style={{ color: primaryFg }} strokeWidth={3} />}
                          </span>
                          {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                          <span className="text-[15px] sm:text-base font-medium flex-1">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentBlock.type === 'input' && (
                  <div className="mb-2">
                    <input
                      autoFocus
                      type={currentBlock.data.input_type === 'email' ? 'email' : currentBlock.data.input_type === 'phone' ? 'tel' : 'text'}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitInput()}
                      placeholder={currentBlock.data.placeholder || 'Sua resposta...'}
                      className="w-full px-4 py-4 outline-none text-base"
                      style={{
                        background: subtleBg,
                        color: a.text_color,
                        border: `1.5px solid ${subtleBorder}`,
                        borderRadius: a.border_radius,
                      }}
                    />
                  </div>
                )}

                {currentBlock.type === 'end' && (
                  <div className="mt-2">
                    {(() => {
                      const subtype = (currentBlock.data as any)?.quiz_subtype;
                      const isResult = subtype === 'result' || subtype === 'result_ai' || (currentBlock.data as any)?.result_ai_enabled;
                      if (isResult && funnel) {
                        return (
                          <QuizResultView
                            block={currentBlock}
                            scoreTotal={scoreRef.current}
                            tags={Array.from(tagsRef.current)}
                            responses={responsesRef.current}
                            funnelId={funnel.id}
                            primaryColor={a.primary_color}
                          />
                        );
                      }
                      return (
                        <div className="text-center py-6">
                          <div
                            className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                            style={{ background: a.primary_color }}
                          >
                            <Check className="h-7 w-7" style={{ color: primaryFg }} />
                          </div>
                          <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>
                            {currentBlock.data.content || 'Obrigado!'}
                          </h2>
                          {currentBlock.data.success_message && (
                            <p className="text-sm" style={{ color: mutedText }}>
                              {currentBlock.data.success_message}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* CTA */}
                {currentBlock.type !== 'end' && (
                  <button
                    type="button"
                    onClick={
                      currentBlock.type === 'buttons'
                        ? handleConfirmOption
                        : currentBlock.type === 'input'
                        ? handleSubmitInput
                        : handleCtaText
                    }
                    disabled={
                      (currentBlock.type === 'buttons' && !selectedOptionId) ||
                      (currentBlock.type === 'input' && currentBlock.data.required && !inputValue.trim())
                    }
                    className="w-full py-4 mt-5 font-semibold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: a.primary_color,
                      color: primaryFg,
                      borderRadius: a.border_radius,
                      boxShadow: shadowToCss(a.shadow),
                    }}
                  >
                    <span>{ctaLabel}</span>
                    {ctaEmoji ? <span>{ctaEmoji}</span> : <ChevronRight className="h-4 w-4" />}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {isPreview && (
        <div className="text-center py-2 text-[10px] uppercase tracking-wider" style={{ color: mutedText }}>
          Modo preview — respostas não serão salvas
        </div>
      )}

      {a.custom_css && <style dangerouslySetInnerHTML={{ __html: a.custom_css }} />}
    </div>
  );
}

function isColorDark(hex: string): boolean {
  const c = (hex || '').replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}
