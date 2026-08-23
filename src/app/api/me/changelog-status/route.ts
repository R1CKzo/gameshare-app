import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { changelog, changelogKey } from "@/data/changelog";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Diz pro GlobalNotificationListener se a pessoa ainda nao viu a entrada
// mais recente do changelog — se nao, ele leva ela pra /novidades sozinho
// ao abrir o app. A propria pagina /novidades marca como vista ao ser
// renderizada, entao isso so fica "true" uma vez por atualizacao.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastSeenChangelogKey: true },
  });

  const latestKey = changelogKey(changelog[0]);
  return NextResponse.json({ shouldRedirect: user?.lastSeenChangelogKey !== latestKey });
}
