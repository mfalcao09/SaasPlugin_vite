import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateProduct } from '@/hooks/useProducts';
import { toast } from 'sonner';
import { DEFAULT_PIPELINE_STAGES } from '@/hooks/usePipelineMutations';

export interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  field: string;
  type: 'text' | 'textarea' | 'list';
  placeholder?: string;
  aiOptimizable?: boolean;
  required?: boolean;
}

// Wizard SIMPLIFICADO pra salão (Fase 3 do plano de menus). Era um onboarding de
// produto B2B (8 passos: ICP, 3 pitches, diferenciais, status). A cabeleireira não
// tem ICP nem faz pitch de elevador — ela vende serviço/pacote. Cortado pra 3 passos
// (2 obrigatórios + 1 opcional) em linguagem de salão. Os campos B2B (icp/pitch_30s/
// pitch_2min/differentials) continuam nullable no banco e o `completeOnboarding` os
// manda como undefined→null — nada quebra pra quem já tem oferta cadastrada.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'name',
    title: 'O que você vende?',
    subtitle: 'O nome que seu cliente vai ver.',
    field: 'name',
    type: 'text',
    placeholder: 'Ex: Pacote 4 escovas, Combo unha + pé, 10 sessões de cílios, Design de sobrancelha...',
    required: true,
  },
  {
    id: 'description',
    title: 'O que é, em uma frase?',
    subtitle: 'A sua IA usa isso pra explicar pra cliente.',
    field: 'description',
    type: 'textarea',
    placeholder: 'Ex: pacote de 4 sessões com 15% de desconto, pra manter o visual em dia o mês todo.',
    aiOptimizable: true,
    required: true,
  },
  {
    id: 'pitch15s',
    title: 'Como apresentar pra cliente? (opcional)',
    subtitle: 'Uma frase de venda amigável — a IA expande na conversa. Pode pular.',
    field: 'pitch_15s',
    type: 'textarea',
    placeholder: 'Ex: Tá precisando dar um up no visual? Esse pacote cuida de você o mês inteiro 💕',
    aiOptimizable: true,
  },
];

export function useProductOnboarding() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({
    status: 'draft',
    differentials: [],
  });
  const [isOptimizing, setIsOptimizing] = useState(false);

  const totalSteps = ONBOARDING_STEPS.length;
  const currentStepData = ONBOARDING_STEPS[currentStep];
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const updateField = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  }, [totalSteps]);

  const canProceed = useCallback(() => {
    const step = ONBOARDING_STEPS[currentStep];
    if (!step.required) return true;
    
    const value = formData[step.field];
    if (step.type === 'list') {
      return Array.isArray(value) && value.length > 0;
    }
    return !!value && String(value).trim().length > 0;
  }, [currentStep, formData]);

  const optimizeWithAI = useCallback(async (field: string, currentValue: string) => {
    if (!currentValue.trim()) {
      toast.error('Digite algo antes de otimizar');
      return null;
    }

    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-product-field', {
        body: {
          field,
          value: currentValue,
          productContext: formData,
        },
      });

      if (error) throw error;
      return data.optimized;
    } catch (error) {
      console.error('Error optimizing field:', error);
      toast.error('Erro ao otimizar com IA');
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, [formData]);

  const completeOnboarding = useCallback(async () => {
    if (!profile?.organization_id) {
      toast.error('Organização não encontrada');
      return null;
    }

    try {
      const productData = {
        name: formData.name,
        description: formData.description,
        icp: formData.icp,
        pitch_15s: formData.pitch_15s,
        pitch_30s: formData.pitch_30s,
        pitch_2min: formData.pitch_2min,
        differentials: formData.differentials,
        status: formData.status || 'draft',
        organization_id: profile.organization_id,
      };

      const product = await createProduct.mutateAsync(productData);

      // Create default pipeline stages for the new product
      if (product?.id) {
        const stages = DEFAULT_PIPELINE_STAGES.map(stage => ({
          ...stage,
          product_id: product.id,
        }));

        const { error: stagesError } = await supabase
          .from('pipeline_stages')
          .insert(stages);

        if (stagesError) {
          console.error('Error creating pipeline stages:', stagesError);
        }
      }

      toast.success('Produto criado com sucesso!');
      return product;
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Erro ao criar produto');
      return null;
    }
  }, [formData, profile, createProduct]);

  const resetOnboarding = useCallback(() => {
    setCurrentStep(0);
    setFormData({ status: 'draft', differentials: [] });
  }, []);

  return {
    currentStep,
    currentStepData,
    totalSteps,
    progress,
    formData,
    isOptimizing,
    isCreating: createProduct.isPending,
    updateField,
    nextStep,
    prevStep,
    goToStep,
    canProceed,
    optimizeWithAI,
    completeOnboarding,
    resetOnboarding,
  };
}
