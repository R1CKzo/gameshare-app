import type { PresenceStatus } from "@/lib/presence";

const COLOR: Record<PresenceStatus, string> = {
  online: "bg-accent",
  away: "bg-away",
  offline: "bg-dim",
};

// Bolinha de status no canto do avatar — mesmo desenho que o UserPill ja
// usava (fixo, so pra voce mesmo), generalizado pra qualquer status
// derivado (ver src/lib/presence.ts) em MemberList/DMSidebar/FriendsView.
// A borda precisa combinar com o fundo de cada lugar onde aparece, por isso
// e um parametro a parte em vez de vir fixa junto com a posicao/cor.
export function StatusDot({
  status,
  className = "",
  borderClassName = "border-sidebar",
}: {
  status: PresenceStatus;
  className?: string;
  borderClassName?: string;
}) {
  return (
    <span
      title={status === "online" ? "Online" : status === "away" ? "Ausente" : "Offline"}
      className={`absolute h-3 w-3 rounded-full border-[2.5px] ${borderClassName} ${COLOR[status]} ${className}`}
    />
  );
}
