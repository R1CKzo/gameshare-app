// Lista do que mudou a cada leva de atualizações, mais recente primeiro.
// Sem CMS nem tela de admin — é só um arquivo que eu (o assistente) atualizo
// a cada mudança relevante e faço deploy junto. Ver src/app/novidades/page.tsx.
//
// "version" só aparece quando corresponde de verdade a uma versão numerada
// do instalador do app de desktop (a mesma numeração usada em
// desktop/main.js) — a maioria das atualizações é só no site/servidor e não
// tem instalador novo, então fica sem selo de versão, só a data.
export type ChangelogEntry = {
  version?: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
  bugsFixed?: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.7",
    date: "2026-08-23",
    title: "App roda em segundo plano",
    items: [
      "No app de desktop, fechar a janela (o X) não encerra mais o GameShare — ele minimiza pra bandeja do sistema e continua rodando, igual o Discord",
      "Ícone da logo, no topo da barra de servidores, agora abre a página de Novidades",
    ],
    bugsFixed: [
      "Aviso de pedido de amizade só aparecia dentro da tela de Amigos — agora aparece em qualquer tela do app",
    ],
  },
  {
    date: "2026-08-23",
    title: "Notificações em tempo real",
    items: [
      "Indicador de mensagem não lida nos servidores, nos canais de texto e nas conversas diretas",
      "Som de notificação quando chega uma mensagem em algo que você não está vendo no momento",
      "Pedido de amizade, aceite e cargo atribuído aparecem na hora, sem precisar recarregar a página",
      "Conversas diretas sobem para o topo da lista assim que chega uma mensagem nova",
      "Nova aba de Novidades (essa aqui), reunindo o histórico de tudo que já mudou no app",
    ],
    bugsFixed: [
      "Textos do app sem acentuação corrigidos em todo lugar",
      "Aviso de pedido de amizade não aparecia fora da tela de Amigos — agora aparece em qualquer tela",
    ],
  },
  {
    date: "2026-08-23",
    title: "Cargos, permissões e login por email",
    items: [
      "Sair de um servidor, e o dono pode excluir o servidor",
      "Cargos customizados por servidor: expulsar, banir e gerenciar outros cargos",
      "Criar conta com email e senha, além do login com Google",
      "Código de segurança enviado por email a cada login por senha",
      "Opção de definir ou trocar senha nas configurações",
      "Área administrativa para reportar e acompanhar bugs",
      "Nome de usuário não aparece mais cortado na barra lateral",
      "Troca de servidor e canal ficou praticamente instantânea",
    ],
    bugsFixed: [
      "Status de bug reportado voltava sozinho ao valor antigo ao sair da tela e voltar",
      "Transição entre servidores escurecia a tela por um instante antes de carregar",
      "Chamada de voz não reconectava direito ao sair e voltar da sala (várias causas: corrida ao salvar presença, cache desatualizado no servidor, conexão que travava sem erro, e a conexão de sinalização caindo sozinha sem avisar)",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-08-22",
    title: "Áudio automático por app",
    items: [
      "Compartilhar a tela inteira nunca leva áudio do sistema — só o vídeo, sem risco de eco",
      "Compartilhar a janela de um app ou jogo leva o áudio daquele app sozinho, automaticamente",
    ],
    bugsFixed: [
      "Chamada de voz parou de funcionar (o servidor TURN gratuito usado desde o início saiu do ar; trocado por um novo)",
      "Áudio do compartilhamento de tela não chegava para quem estava assistindo",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-08-22",
    title: "Áudio do sistema sem eco",
    items: [
      "Nova opção \"Tudo, menos a chamada\": grava jogos, música e vídeo normalmente, mas exclui só a própria chamada de voz",
      "Áudio do sistema no compartilhamento agora é sempre uma escolha explícita, com aviso do risco de eco em cada opção",
    ],
    bugsFixed: ["Eco ao compartilhar a tela inteira com áudio do sistema ligado"],
  },
  {
    version: "1.0.4",
    date: "2026-08-22",
    title: "Compartilhamento de tela nativo",
    items: [
      "Compartilhamento de tela agora roda por dentro do próprio app de desktop, sem depender do navegador",
      "Escolha entre compartilhar a tela inteira ou só a janela de um app/jogo específico",
      "Seleção de qualidade (720p, 1080p ou 1440p) e taxa de quadros (30 ou 60 FPS)",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-08-22",
    title: "Amigos, mensagens diretas e chamadas privadas",
    items: [
      "Sistema de amigos: mandar e aceitar pedido por Nick#Tag",
      "Mensagens diretas (DM) e chamada de voz privada com um amigo",
      "Chamada de voz e compartilhamento de tela continuam mesmo trocando de servidor, canal ou DM",
      "Tela de novidades do app (a versão de dentro do instalador desktop — essa página web é a evolução dela)",
    ],
    bugsFixed: [
      "Duas brechas de segurança encontradas numa auditoria (checagem de permissão fraca em duas rotas)",
      "Popup de convite sobrepondo outros elementos da tela",
      "Áudio ficava mudo se a pessoa navegasse pra outra tela durante uma chamada",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-08-22",
    title: "Atualização automática mais confiável",
    items: ["Atualização automática do app de desktop agora é visível e monitorável, com verificação periódica"],
  },
  {
    version: "1.0.1",
    date: "2026-08-22",
    title: "Login corrigido no app de desktop",
    bugsFixed: ["Login com Google no app de desktop (passou a abrir o navegador do sistema, já que o Google bloqueia login dentro do app)"],
    items: [],
  },
  {
    version: "1.0.0",
    date: "2026-08-22",
    title: "Lançamento do app de desktop",
    items: ["Cliente de Windows instalável, com a mesma interface do site, e atualização automática"],
  },
  {
    date: "2026-08-22",
    title: "Chat de voz em malha e chat de texto",
    items: [
      "Chamada de voz real entre todo mundo na sala (sem servidor de mídia no meio), com barra de controle: mutar, compartilhar tela, desligar",
      "Anel visual ao redor do avatar de quem está falando",
      "Escolha de microfone, redutor de ruído e sensibilidade ajustável com medidor ao vivo",
      "Mensagens de texto reais nos canais do servidor, chegando em tempo real",
      "Convite por link para entrar num servidor",
      "Lista de membros do servidor, e presença de quem está numa sala de chamada",
      "Layout adaptado para celular",
      "Servidor TURN para a chamada conectar em qualquer tipo de rede/roteador",
    ],
    bugsFixed: [
      "Compartilhamento de tela não funcionava para quem assistia pelo Safari/iPhone",
      "Presença na sala de chamada sumia sozinha por causa do heartbeat",
      "Áudio \"repetindo\"/cortando, causado pelo redutor de ruído",
      "Anel de quem está falando e o modal de configurações com bugs visuais",
    ],
  },
  {
    date: "2026-08-21",
    title: "Primeira versão do GameShare",
    items: [
      "Login com Google",
      "Servidores estilo Discord, com canais",
      "Compartilhamento de tela dentro de uma sala de chamada",
    ],
  },
];
