import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { Streamer } from "@/components/Streamer";

export default async function NewStreamPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.nickname || !session.user.userTag) {
    redirect("/setup");
  }

  const usernameTag = `${session.user.nickname}#${session.user.userTag}`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Painel do transmissor</h1>
      <p className="mb-6 text-sm text-slate-400">
        Compartilhando como <span className="text-accent">{usernameTag}</span>
      </p>

      <Streamer usernameTag={usernameTag} />
    </div>
  );
}
