import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";

export const dynamic = "force-dynamic";

// Equivalente ao "/api/auth/session" do NextAuth (que so funciona por
// cookie), pro app de desktop embutido conseguir o mesmo formato de
// usuario a partir de um token Bearer -- e o que
// desktop-ui/shims/next-auth-react.tsx chama pra imitar o useSession() de
// sempre sem precisar mudar nenhum componente compartilhado.
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  return withCors(request, NextResponse.json({ user: session?.user ?? null }));
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
