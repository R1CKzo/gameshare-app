// Lista do que mudou a cada leva de atualizações, mais recente primeiro.
// Sem CMS nem tela de admin — é só um arquivo que eu (o assistente) atualizo
// a cada mudança relevante e faço deploy junto. Ver src/app/novidades/page.tsx.
export type ChangelogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-08-23",
    title: "Notificações em tempo real",
    items: [
      "Indicador de mensagem não lida nos servidores, nos canais de texto e nas conversas diretas",
      "Som de notificação quando chega uma mensagem em algo que você não está vendo no momento",
      "Pedido de amizade, aceite e cargo atribuído aparecem na hora, sem precisar recarregar a página",
      "Conversas diretas sobem para o topo da lista assim que chega uma mensagem nova",
    ],
  },
];
