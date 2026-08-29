import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { acceptFriendship } from "@/lib/friendAccept";
import { joinServerByInviteCode } from "@/lib/serverJoin";
import { verifySecurityCode } from "@/lib/securityCode";

// Confirma o codigo de autorizacao parental e SO ENTAO executa a acao de
// verdade (entrar no servidor / aceitar o pedido de amizade) -- nunca
// antes disso, ver /api/parental/authorize-request.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const code = String(body?.code ?? "");
  if (!ticketId || !code) {
    return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  }

  const result = await verifySecurityCode(ticketId, code, "PARENTAL_ACTION");
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return NextResponse.json({ error: "Muitas tentativas erradas. Peça um novo código." }, { status: 429 });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }
  if (result.userId !== session.user.id || !result.payload) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const { action, targetId } = JSON.parse(result.payload) as { action: string; targetId: string };

  if (action === "JOIN_SERVER") {
    const join = await joinServerByInviteCode(session.user.id, targetId);
    if (!join.ok) return NextResponse.json({ error: join.error }, { status: join.status });
    return NextResponse.json({ ok: true, serverId: join.serverId });
  }

  if (action === "ACCEPT_FRIEND") {
    const accept = await acceptFriendship(session.user.id, targetId);
    if (!accept.ok) return NextResponse.json({ error: accept.error }, { status: accept.status });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
