import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * `false` renderiza o conteúdo NO LUGAR, sem Portal para o body.
     *
     * POR QUE EXISTE: dentro de um Sheet/Dialog o Radix usa `react-remove-scroll`,
     * que bloqueia `touchmove` em tudo FORA da subárvore do diálogo — é assim que
     * a página de trás não rola com o drawer aberto. Um popover portalado para o
     * body cai nesse "fora": ele aparece, cabe na tela, tem overflow-y-auto — e
     * mesmo assim NÃO ROLA no toque. Foi o que travou a lista de produtos no
     * drawer mobile do painel (reproduzido em iPhone, 2026-08-01; duas tentativas
     * anteriores atacaram altura e posicionamento, que não eram a causa).
     *
     * Default `true` = comportamento de sempre, para não mexer nos 40 arquivos
     * que já usam este primitivo. Use `false` só quando o popover viver dentro
     * de um Sheet/Dialog E precisar de scroll interno.
     */
    portal?: boolean;
  }
>(({ className, align = "center", sideOffset = 4, portal = true, ...props }, ref) => {
  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );
  return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
