import Link from "next/link";

// Tela cheia pra quando a pessoa cai num link que não dá mais certo (canal
// de um servidor que ela não faz parte, DM apagada, convite inválido ou
// banido) — sempre com um jeito de sair, nunca so o aviso sozinho (era
// exatamente isso que travava quem tinha acabado de ser expulso de um
// servidor, ou de um servidor excluído com ela dentro: a tela avisava e
// não dava nenhum caminho pra continuar usando o app).
export function DeadEndScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <Link
          href="/friends"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white transition hover:bg-primary-hover"
        >
          Ir para Amigos
        </Link>
      </div>
    </div>
  );
}
