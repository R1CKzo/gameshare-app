"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useUnread } from "@/components/notifications/UnreadContext";
import { HamburgerIcon, useMobileUI } from "@/components/shell/MobileUIContext";

type FriendUser = { id: string; nickname: string | null; userTag: string | null; image: string | null };
type FriendRow = { friendshipId: string; user: FriendUser };

export function FriendsView() {
  const { toggleSidebar } = useMobileUI();
  const router = useRouter();
  const { friendsEventVersion } = useUnread();

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      const data = await res.json();
      setFriends(data.friends ?? []);
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
    } catch {
      // ignora falhas transitorias
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsEventVersion]);

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault();
    if (!tag.trim() || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tag.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nao foi possivel enviar o pedido.");
        return;
      }
      setTag("");
      setNotice(data.status === "ACCEPTED" ? "Voces agora sao amigos!" : "Pedido enviado.");
      load();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  async function acceptRequest(friendshipId: string) {
    await fetch(`/api/friends/${friendshipId}`, { method: "PATCH" }).catch(() => {});
    load();
  }

  async function removeFriendship(friendshipId: string) {
    await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function startConversation(friendId: string) {
    setStartingDm(friendId);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/dms/${data.id}`);
    } finally {
      setStartingDm(null);
    }
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3 sm:px-5">
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] md:hidden"
        >
          <HamburgerIcon />
        </button>
        <span className="font-bold">Amigos</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        <form onSubmit={handleAddFriend} className="mb-8 max-w-md">
          <label className="mb-2 block text-xs font-bold tracking-wide text-muted">ADICIONAR AMIGO</label>
          <div className="flex items-center gap-2">
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Nickname#123456"
              className="h-11 flex-1 rounded-xl border border-[#2d3344] bg-background px-4 text-sm font-semibold outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!tag.trim() || sending}
              className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              Enviar pedido
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {notice && <p className="mt-2 text-xs text-accent">{notice}</p>}
        </form>

        {!loading && incoming.length === 0 && outgoing.length === 0 && friends.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted">
            Voce ainda nao tem amigos por aqui. Manda um pedido usando o Nick#Tag de alguem.
          </div>
        )}

        {incoming.length > 0 && (
          <Section title={`PEDIDOS RECEBIDOS — ${incoming.length}`}>
            {incoming.map((f) => (
              <FriendRowItem key={f.friendshipId} user={f.user}>
                <button
                  onClick={() => acceptRequest(f.friendshipId)}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition hover:bg-primary-hover"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => removeFriendship(f.friendshipId)}
                  className="rounded-full border border-[#2d3344] px-4 py-1.5 text-xs font-bold text-muted transition hover:border-danger hover:text-danger"
                >
                  Recusar
                </button>
              </FriendRowItem>
            ))}
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section title="PEDIDOS ENVIADOS">
            {outgoing.map((f) => (
              <FriendRowItem key={f.friendshipId} user={f.user}>
                <span className="text-xs text-dim">Aguardando</span>
                <button
                  onClick={() => removeFriendship(f.friendshipId)}
                  className="rounded-full border border-[#2d3344] px-4 py-1.5 text-xs font-bold text-muted transition hover:border-danger hover:text-danger"
                >
                  Cancelar
                </button>
              </FriendRowItem>
            ))}
          </Section>
        )}

        {friends.length > 0 && (
          <Section title={`AMIGOS — ${friends.length}`}>
            {friends.map((f) => (
              <FriendRowItem key={f.friendshipId} user={f.user}>
                <button
                  onClick={() => startConversation(f.user.id)}
                  disabled={startingDm === f.user.id}
                  className="rounded-full bg-elevated px-4 py-1.5 text-xs font-bold text-[#d5d7dc] transition hover:text-[#f5f5f7] disabled:opacity-50"
                >
                  Mensagem
                </button>
                <button
                  onClick={() => removeFriendship(f.friendshipId)}
                  className="rounded-full border border-[#2d3344] px-4 py-1.5 text-xs font-bold text-muted transition hover:border-danger hover:text-danger"
                >
                  Remover
                </button>
              </FriendRowItem>
            ))}
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-2xl">
      <div className="mb-2 text-[11px] font-bold tracking-wider text-muted">{title}</div>
      <div className="divide-y divide-white/[0.06] rounded-xl bg-elevated/40">{children}</div>
    </div>
  );
}

function FriendRowItem({ user, children }: { user: FriendUser; children: React.ReactNode }) {
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary">
        {user.image ? (
          <Image src={user.image} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">{initials}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#f5f5f7]">{user.nickname}</div>
        <div className="text-xs text-dim">#{user.userTag}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
