import type { PresenceStatus } from "@/lib/presence";

const COLOR: Record<PresenceStatus, string> = {
  online: "bg-online",
  away: "bg-away",
  busy: "bg-danger",
  offline: "bg-dim",
};

const LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Ausente",
  busy: "Ocupado",
  offline: "Offline",
};

// Bolinha de status no canto do avatar — mesmo desenho que o UserPill ja
// usava (fixo, so pra voce mesmo), generalizado pra qualquer status
// derivado (ver src/lib/presence.ts) em MemberList/DMSidebar/FriendsView.
// A borda precisa combinar com o fundo de cada lugar onde aparece, por isso
// e um parametro a parte em vez de vir fixa junto com a posicao/cor. Use
// standalone=true pra um marcador solto (sem borda nem posicionamento
// absoluto), tipo o mostruario de cores no menu de trocar status.
export function StatusDot({
  status,
  className = "",
  borderClassName = "border-sidebar",
  standalone = false,
}: {
  status: PresenceStatus;
  className?: string;
  borderClassName?: string;
  standalone?: boolean;
}) {
  const shape = standalone ? "h-2.5 w-2.5 rounded-full" : `absolute h-3 w-3 rounded-full border-[2.5px] ${borderClassName}`;
  return <span title={LABEL[status]} className={`${shape} ${COLOR[status]} ${className}`} />;
}
