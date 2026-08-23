"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Severity = "LOW" | "MEDIUM" | "HIGH";
type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED";

type BugReport = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  context: string | null;
  appVersion: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; userTag: string | null; image: string | null };
};

const STATUS_FILTERS: { value: Status | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "OPEN", label: "Aberto" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "RESOLVED", label: "Resolvido" },
];

const STATUS_LABEL: Record<Status, string> = { OPEN: "Aberto", IN_PROGRESS: "Em andamento", RESOLVED: "Resolvido" };
const STATUS_CLASS: Record<Status, string> = {
  OPEN: "bg-danger/15 text-danger",
  IN_PROGRESS: "bg-accent/15 text-accent",
  RESOLVED: "bg-[#2d3344] text-muted",
};

const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta" };
const SEVERITY_CLASS: Record<Severity, string> = {
  LOW: "border-[#2d3344] text-muted",
  MEDIUM: "border-accent/40 text-accent",
  HIGH: "border-danger/40 text-danger",
};

// Lista + troca de status ficam do lado do cliente (atualizacao otimista):
// a pagina em si so busca os dados uma vez no servidor, essa e a parte
// interativa (filtrar, marcar como resolvido, etc).
export function BugsList({ reports: initialReports }: { reports: BugReport[] }) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");

  const filtered = useMemo(
    () => (filter === "ALL" ? reports : reports.filter((r) => r.status === filter)),
    [reports, filter],
  );

  async function updateStatus(id: string, status: Status) {
    const previous = reports;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const res = await fetch(`/api/bugs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      // reverte para o estado anterior se o servidor recusou
      setReports(previous);
      return;
    }
    // limpa o cache de navegacao da rota, senao voltar pra essa pagina
    // depois mostra os dados antigos (de antes da troca de status)
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              filter === f.value ? "bg-primary text-white" : "bg-elevated text-muted hover:text-[#d5d7dc]"
            }`}
          >
            {f.label}
            {f.value !== "ALL" && (
              <span className="ml-1.5 opacity-70">{reports.filter((r) => r.status === f.value).length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-elevated/40 py-14 text-center text-sm text-muted">Nada por aqui.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <BugCard key={report.id} report={report} onStatusChange={(status) => updateStatus(report.id, status)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BugCard({ report, onStatusChange }: { report: BugReport; onStatusChange: (status: Status) => void }) {
  const label = `${report.user.nickname ?? "Alguém"}${report.user.userTag ? "#" + report.user.userTag : ""}`;

  return (
    <div className="rounded-xl border border-[#2d3344] bg-elevated/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CLASS[report.status]}`}>
              {STATUS_LABEL[report.status]}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${SEVERITY_CLASS[report.severity]}`}>
              {SEVERITY_LABEL[report.severity]}
            </span>
          </div>
          <h3 className="font-display text-[15px] font-bold text-[#f5f5f7]">{report.title}</h3>
        </div>
        <StatusMenu current={report.status} onChange={onStatusChange} />
      </div>

      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-[#d5d7dc]">{report.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 text-xs text-dim">
        <div className="flex items-center gap-1.5">
          <div className="relative h-4 w-4 overflow-hidden rounded-full bg-primary">
            {report.user.image && <Image src={report.user.image} alt="" fill sizes="16px" className="object-cover" />}
          </div>
          <span>{label}</span>
        </div>
        <span>{formatTime(report.createdAt)}</span>
        {report.appVersion && <span>{report.appVersion}</span>}
        {report.context && <span className="truncate">{report.context}</span>}
      </div>
    </div>
  );
}

function StatusMenu({ current, onChange }: { current: Status; onChange: (status: Status) => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {(["OPEN", "IN_PROGRESS", "RESOLVED"] as const)
        .filter((s) => s !== current)
        .map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="rounded-full border border-[#2d3344] px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-primary hover:text-[#f5f5f7]"
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
    </div>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `hoje às ${time}`;
  return `${date.toLocaleDateString("pt-BR")} às ${time}`;
}
