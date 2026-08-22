import Link from "next/link";

type ServerSummary = {
  id: string;
  name: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function ServerRail({
  servers,
  currentServerId,
  friendsActive = false,
}: {
  servers: ServerSummary[];
  currentServerId?: string;
  friendsActive?: boolean;
}) {
  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
      <Link
        href="/"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M4.9 4.9l2.8 2.8" />
          <path d="M16.3 16.3l2.8 2.8" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="M4.9 19.1l2.8-2.8" />
          <path d="M16.3 7.7l2.8-2.8" />
        </svg>
      </Link>

      <div className="relative">
        {friendsActive && <div className="absolute -left-3 top-1 h-10 w-2 rounded-r-md bg-[#f5f5f7]" />}
        <Link
          href="/friends"
          title="Amigos"
          className={`flex h-12 w-12 items-center justify-center transition-[border-radius] hover:rounded-2xl ${
            friendsActive ? "rounded-2xl bg-primary text-white" : "rounded-full bg-elevated text-muted"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </Link>
      </div>

      <div className="my-1 h-px w-8 bg-white/10" />

      {servers.map((server) => {
        const active = server.id === currentServerId;
        return (
          <div key={server.id} className="relative">
            {active && (
              <div className="absolute -left-3 top-1 h-10 w-2 rounded-r-md bg-[#f5f5f7]" />
            )}
            <Link
              href={`/servers/${server.id}`}
              title={server.name}
              className={`flex h-12 w-12 items-center justify-center font-display text-sm font-bold transition-[border-radius] hover:rounded-2xl ${
                active ? "rounded-2xl bg-primary text-white" : "rounded-full bg-elevated text-muted"
              }`}
            >
              {initials(server.name)}
            </Link>
          </div>
        );
      })}

      <Link
        href="/servers/new"
        title="Criar ou entrar em um servidor"
        className="mt-1 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[#2d3344] text-accent transition hover:rounded-2xl"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
