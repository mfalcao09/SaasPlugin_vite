import { useState } from "react";
import { CalendarDays, Instagram, MessageCircle, Pencil, UserRound } from "lucide-react";
import type { Lead } from "./ProspeccaoBaseTable";
import { Button } from "@/components/ui/button";
import "./ProspeccaoLeadDetail.css";

const numberFormat = new Intl.NumberFormat("pt-BR");

function displayPhone(value: string | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return /^55\d{2}9\d{8}$/.test(digits)
    ? `+55 ${digits.slice(2, 4)} ${digits.slice(4, 5)}${digits.slice(5, 9)}-${digits.slice(9)}`
    : value;
}

export function ProspeccaoLeadDetail({ lead, onEdit }: { lead: Lead; onEdit: () => void }) {
  const [tab, setTab] = useState<"profile" | "found" | "conversations">("profile");
  const firstProfile = lead.profiles[0];
  const handle = firstProfile?.handle ? `@${firstProfile.handle.replace(/^@/, "")}` : "";
  const initials = (lead.name.match(/[\p{L}\p{N}]+/gu) ?? ["?"]).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
  const addedAt = lead.updated_at ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(lead.updated_at)) : "";

  return (
    <div className="prospect-detail">
      <aside className="prospect-detail-aside">
        <div className="prospect-detail-eyebrow">Lead identificado</div>
        <div className="prospect-detail-identity">
          <span className="prospect-detail-avatar">{initials}</span>
          <div className="min-w-0"><h2>{lead.name || "Lead sem nome"}</h2>{handle && <p><Instagram className="h-4 w-4" />{handle}</p>}</div>
        </div>
        {handle && <a className="prospect-detail-profile-link" href={`https://instagram.com/${handle.slice(1)}`} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4" />Ver perfil <span>↗</span></a>}
        <div className="prospect-detail-side-section"><span>Presença no Instagram</span><div className="prospect-detail-stats">
          <div><small>Seguidores</small><strong>{lead.profile_count ? numberFormat.format(lead.followers_count) : ""}</strong></div>
          <div><small>Seguindo</small><strong></strong></div><div><small>Publicações</small><strong></strong></div><div><small>Aparições</small><strong>{lead.profile_count || ""}</strong></div>
        </div></div>
      </aside>
      <div className="prospect-detail-main">
        <div className="prospect-detail-heading"><span>Ficha completa</span><Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Editar Lead</Button><h1>Informações do lead</h1><p>Dados públicos, qualificação, origem e histórico de contato.</p></div>
        <div className="prospect-detail-tabs" role="tablist">
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Perfil</button>
          <button className={tab === "found" ? "active" : ""} onClick={() => setTab("found")}>Encontrado em {lead.profile_count || ""}</button>
          <button className={tab === "conversations" ? "active" : ""} onClick={() => setTab("conversations")}>Conversas 0</button>
        </div>
        {tab === "profile" && <div className="prospect-detail-content">
          <div className="prospect-detail-fields">
            <div><small>Nome completo</small><p><UserRound />{lead.name}</p></div>
            <div><small>Utilizador</small><p>{handle ? `@${handle.slice(1)}` : ""}</p></div>
            <div><small>Telefone</small><p>{displayPhone(lead.phone_normalized) || displayPhone(lead.phone)}</p></div>
            <div><small>Adicionado em</small><p>{addedAt && <><CalendarDays />{addedAt}</>}</p></div>
          </div>
          <div className="prospect-detail-bio"><small>Biografia do Instagram</small><div></div></div>
          <div className="prospect-detail-tags">{handle && <span><Instagram />Instagram</span>}{lead.source && lead.source.toLowerCase() !== "instagram" && <span>{lead.source}</span>}{lead.derived_stage === "do_not_contact" && <span className="blocked">Não contatar</span>}</div>
          <p className="prospect-detail-footnote">Dados públicos recolhidos nas análises do workspace.</p>
        </div>}
        {tab === "found" && <div className="prospect-detail-empty"><Instagram /><p>Este lead foi encontrado em {lead.profile_count || ""} perfil(is).</p></div>}
        {tab === "conversations" && <div className="prospect-detail-empty"><MessageCircle /><p>Nenhuma conversa registrada.</p></div>}
      </div>
    </div>
  );
}
