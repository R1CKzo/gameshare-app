// Lista do que mudou a cada leva de atualizações, mais recente primeiro.
// Sem CMS nem tela de admin — é só um arquivo que eu (o assistente) atualizo
// a cada mudança relevante e faço deploy junto. Ver src/app/novidades/page.tsx.
//
// "version" só aparece quando corresponde de verdade a uma versão numerada
// do instalador do app de desktop (a mesma numeração usada em
// desktop/main.js) — a maioria das atualizações é só no site/servidor e não
// tem instalador novo, então fica sem selo de versão, só a data.
export type ChangelogEntry = {
  // Identificador estavel da entrada — depois de publicado (feito deploy),
  // NUNCA MUDE esse valor, mesmo editando titulo/data/items depois (foi
  // exatamente essa mudanca, em 2026-08-25, que quebrou o redirecionamento
  // pra quem ja tinha visto a versao antiga do texto: mudar o titulo mudava
  // a chave, deixando "lastSeenChangelogKey" de quem ja tinha visto orfa
  // pra sempre, presa num loop voltando pra /novidades. Ver changelogKey).
  id: string;
  version?: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
  bugsFixed?: string[];
  // Recursos que só aparecem pra quem ligou "Permitir versões beta" nas
  // Configurações — nunca vão pra todo mundo direto, mesma ideia dos
  // bugsFixed, só numa área própria (ver src/app/novidades/page.tsx).
  betaFeatures?: string[];
};

// Identifica uma entrada de forma estavel — usado pra saber se a pessoa ja
// viu a mais recente e decidir se leva ela pra /novidades sozinho ao abrir
// o app. So usa "id" (nunca titulo/data direto), pra editar o texto de uma
// entrada depois de publicada nao orfanizar quem ja viu ela.
export function changelogKey(entry: ChangelogEntry): string {
  return entry.id;
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.13",
    date: "2026-08-25",
    id: "2026-08-25::Melhorias no sistema de beta",
    title: "Melhorias no sistema de beta",
    items: [
      "Sistema de patch para correções adicionais atualizados",
      "Donos de servidor podem alterar nome e imagem do servidor",
      "Atualizações de correções de segurança",
    ],
    betaFeatures: [
      "Tela de Configurações remodelada, em tela cheia com categorias na lateral",
      "Novo modelo de supressão de ruído do microfone, mais robusto pra separar sua voz de ruído de teclado e fundo",
      "Melhorias na interface e navegação",
    ],
    bugsFixed: [
      "Fechar a página de Novidades podia levar de volta pra ela mesma, sem conseguir sair",
      "Deixar o app aberto por um tempo podia levar de volta pra página de Novidades, mesmo já tendo sido vista",
      "Ser removido de um servidor (ou ele ser excluído) enquanto você estava nele podia travar numa tela sem saída",
      "Baixar uma correção podia falhar sem repetir a tentativa, mesmo em redes instáveis",
      "Barra de canais recolhível ficava flutuando, sem ocupar a altura certa da tela (beta)",
    ],
  },
  {
    version: "1.0.12",
    date: "2026-08-25",
    id: "2026-08-25::Áudio da transmissão, silenciar geral e expulsar da chamada",
    title: "Áudio da transmissão, silenciar geral e expulsar da chamada",
    items: [
      "O áudio da transmissão que estava em beta na versão 1.0.11 agora é oficial pra todo mundo: tela inteira leva o som do sistema junto, cada pessoa controla o volume do que está assistindo, e dá pra entrar ou sair da transmissão sem sair da chamada",
      "Botão de tela cheia no vídeo de quem está compartilhando",
      "Botão de silenciar geral (ícone de fone cortado): para de ouvir a chamada inteira sem sair dela, também muta seu microfone, e os dois avisos aparecem pra quem mais estiver na sala",
      "Quem pode expulsar membros do servidor agora também pode remover alguém de uma chamada específica (passe o mouse no avatar da pessoa)",
      "Transmissão de tela otimizada pra consumir menos desempenho do jogo durante o compartilhamento",
      "Melhorias na interface",
    ],
    bugsFixed: [
      "Áudio da transmissão (tela inteira ou app específico) não chegava pra quem estava assistindo",
      "Sinal de conexão (verde/amarelo/vermelho) acendia errado com várias pessoas na chamada, mesmo com a internet boa",
    ],
  },
  {
    version: "1.0.11",
    date: "2026-08-24",
    id: "2026-08-24::Programa beta",
    title: "Programa beta",
    items: [
      "Programa beta: nova aba \"Beta\" nas Configurações — ative pra liberar acesso a recursos que ainda estão em teste, antes de virarem oficiais pra todo mundo",
    ],
    betaFeatures: [
      "Áudio da transmissão separado da voz: tela inteira leva o som do sistema junto, cada pessoa controla o volume do que está assistindo, e dá pra entrar ou sair da transmissão sem sair da chamada",
    ],
    bugsFixed: [],
  },
  {
    version: "1.0.10",
    date: "2026-08-24",
    id: "2026-08-24::Correção na bandeja do sistema",
    title: "Correção na bandeja do sistema",
    items: [],
    bugsFixed: [
      "Reabrir o app com ele já rodando minimizado na bandeja podia fazer uma janela nova piscar por um instante antes de trazer a janela certa pra frente",
    ],
  },
  {
    version: "1.0.8",
    date: "2026-08-23",
    id: "2026-08-23::Notificações completas",
    title: "Notificações completas",
    items: [
      "Mensagem nova numa conversa direta também acende o aviso no ícone de Amigos, não só pedido de amizade",
      "O ícone do app na bandeja do sistema ganha um ponto vermelho quando tem qualquer notificação não lida (mensagem, DM ou pedido de amizade)",
      "Ao abrir o app depois de uma atualização, você já é levado direto pra essa página de Novidades, sem precisar procurar",
      "Bolinha de status no avatar de cada pessoa: verde (online), amarela (ausente), vermelha (ocupado) ou cinza (offline)",
      "Clique no seu próprio avatar, embaixo na barra lateral, pra escolher o status manualmente (ou deixar no automático)",
      "No automático, o status vira \"ausente\" sozinho depois de 5 minutos sem mexer no mouse ou teclado, ou ao minimizar o app",
      "Botão \"+\" ao lado de \"Canais de texto\" e \"Salas de chamada\" pra criar um novo, e um menu (≡) em cada canal pra renomear ou excluir — sem contar com o dono, dá pra liberar isso pra um cargo customizado também",
      "Na chamada, agora dá pra ver quem mais está mudo, não só você mesmo",
      "Selinho no avatar de quem está compartilhando a tela, mesmo na miniatura pequena",
      "As miniaturas da chamada encolhem conforme mais gente entra na sala",
      "Som ao entrar/sair da chamada e ao mutar/desmutar o microfone",
      "Lista de quem está em cada sala de chamada aparece embaixo do nome dela na barra lateral, sem precisar entrar pra ver quem tá lá",
      "Sinal de conexão (barrinhas verde/amarelo/vermelho) acima do nome de cada pessoa, tanto na chamada quanto na lista da barra lateral",
      "Modo claro pro app inteiro, com opção pra alternar entre escuro e claro nas configurações do seu perfil",
      "Mutar/desmutar, entrar/sair da chamada e começar/parar de compartilhar a tela agora aparecem quase na hora pra quem mais está na sala e na barra lateral, em vez de demorar alguns segundos",
      "Salas de chamada de servidor agora têm um limite de 10 pessoas ao mesmo tempo, pra manter a chamada estável pra todo mundo dentro dela",
    ],
    bugsFixed: [
      "Status fixado manualmente (ex: \"Ocupado\") podia ser sobrescrito por engano logo depois de recarregar a página, aparecendo errado pra outras pessoas",
      "Bolinha de status aparecia cortada no avatar dos membros do servidor, das conversas diretas e da tela de Amigos",
      "Mais uma rodada de auditoria de segurança: falhas encontradas e corrigidas, e reforçada a proteção dos convites de servidor",
      "Dados como nickname, tag e configurações de segurança agora se atualizam sozinhos em qualquer tela, sem precisar sair e entrar de novo",
      "Contas com foto de perfil personalizada (enviada por upload, não a do Google) às vezes não conseguiam terminar o login — nem por email/senha, nem pelo Google — ficando presas na tela de login",
      "Foto de perfil personalizada parava de aparecer (ícone de imagem quebrada) logo depois de entrar no app",
      "Sinal de conexão (barrinhas verde/amarelo/vermelho) acendia amarelo ou vermelho por engano logo ao entrar numa chamada, mesmo com internet boa dos dois lados",
      "Em raras ocasiões, sair de uma sala de chamada podia deixar a pessoa aparecendo como presente pros outros mesmo depois de ter saído de verdade",
    ],
  },
  {
    version: "1.0.7",
    date: "2026-08-23",
    id: "2026-08-23::App roda em segundo plano",
    title: "App roda em segundo plano",
    items: [
      "No app de desktop, fechar a janela (o X) não encerra mais o GameShare — ele minimiza pra bandeja do sistema e continua rodando em segundo plano, com a chamada de voz e as notificações ativas",
      "Ícone da logo, no topo da barra de servidores, agora abre a página de Novidades",
    ],
    bugsFixed: [
      "Aviso de pedido de amizade só aparecia dentro da tela de Amigos — agora aparece em qualquer tela do app",
    ],
  },
  {
    date: "2026-08-23",
    id: "2026-08-23::Notificações em tempo real",
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
    id: "2026-08-23::Cargos, permissões e login por email",
    title: "Cargos, permissões e login por email",
    items: [
      "Sair de um servidor, e o dono pode excluir o servidor",
      "Cargos customizados por servidor: expulsar, banir e gerenciar outros cargos",
      "Criar conta com email e senha, além do login com Google",
      "Código de segurança enviado por email a cada login por senha",
      "Opção de definir ou trocar senha nas configurações",
      "Nova opção pra reportar bugs direto pelo app",
      "Nome de usuário não aparece mais cortado na barra lateral",
      "Troca de servidor e canal ficou praticamente instantânea",
    ],
    bugsFixed: [
      "Status de bug reportado voltava sozinho ao valor antigo ao sair da tela e voltar",
      "Transição entre servidores escurecia a tela por um instante antes de carregar",
      "Corrigidos vários problemas que faziam a chamada de voz não reconectar direito depois de sair e voltar pra sala",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-08-22",
    id: "2026-08-22::Áudio automático por app",
    title: "Áudio automático por app",
    items: [
      "Compartilhar a tela inteira nunca leva áudio do sistema — só o vídeo, sem risco de eco",
      "Compartilhar a janela de um app ou jogo leva o áudio daquele app sozinho, automaticamente",
    ],
    bugsFixed: [
      "Chamada de voz parou de funcionar (um serviço externo usado pra conectar as chamadas saiu do ar) — já trocamos por um novo",
      "Áudio do compartilhamento de tela não chegava para quem estava assistindo",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-08-22",
    id: "2026-08-22::Áudio do sistema sem eco",
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
    id: "2026-08-22::Compartilhamento de tela nativo",
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
    id: "2026-08-22::Amigos, mensagens diretas e chamadas privadas",
    title: "Amigos, mensagens diretas e chamadas privadas",
    items: [
      "Sistema de amigos: mandar e aceitar pedido por Nick#Tag",
      "Mensagens diretas (DM) e chamada de voz privada com um amigo",
      "Chamada de voz e compartilhamento de tela continuam mesmo trocando de servidor, canal ou DM",
      "Tela de novidades dentro do app de desktop, mostrando o que mudou em cada atualização",
    ],
    bugsFixed: [
      "Duas brechas de segurança identificadas e corrigidas numa auditoria interna",
      "Popup de convite sobrepondo outros elementos da tela",
      "Áudio ficava mudo se a pessoa navegasse pra outra tela durante uma chamada",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-08-22",
    id: "2026-08-22::Atualização automática mais confiável",
    title: "Atualização automática mais confiável",
    items: ["Atualização automática do app de desktop agora é visível e monitorável, com verificação periódica"],
  },
  {
    version: "1.0.1",
    date: "2026-08-22",
    id: "2026-08-22::Login corrigido no app de desktop",
    title: "Login corrigido no app de desktop",
    bugsFixed: ["Login com Google no app de desktop (passou a abrir o navegador do sistema, já que o Google bloqueia login dentro do app)"],
    items: [],
  },
  {
    version: "1.0.0",
    date: "2026-08-22",
    id: "2026-08-22::Lançamento do app de desktop",
    title: "Lançamento do app de desktop",
    items: ["Cliente de Windows instalável, com a mesma interface do site, e atualização automática"],
  },
  {
    date: "2026-08-22",
    id: "2026-08-22::Chamada de voz e chat de texto",
    title: "Chamada de voz e chat de texto",
    items: [
      "Chamada de voz real entre todo mundo na sala, com barra de controle: mutar, compartilhar tela, desligar",
      "Anel visual ao redor do avatar de quem está falando",
      "Escolha de microfone, redutor de ruído e sensibilidade ajustável com medidor ao vivo",
      "Mensagens de texto reais nos canais do servidor, chegando em tempo real",
      "Convite por link para entrar num servidor",
      "Lista de membros do servidor, e presença de quem está numa sala de chamada",
      "Layout adaptado para celular",
      "Chamada de voz conecta certinho mesmo em redes mais restritas, tipo Wi-Fi de empresa ou faculdade",
    ],
    bugsFixed: [
      "Compartilhamento de tela não funcionava para quem assistia pelo Safari/iPhone",
      "Às vezes a presença na sala de chamada sumia sozinha, mesmo com todo mundo ainda conectado",
      "Áudio \"repetindo\"/cortando, causado pelo redutor de ruído",
      "Bugs visuais no anel de quem está falando e na janela de configurações",
    ],
  },
  {
    date: "2026-08-21",
    id: "2026-08-21::Primeira versão do GameShare",
    title: "Primeira versão do GameShare",
    items: [
      "Login com Google",
      "Servidores com canais, pra organizar sua galera",
      "Compartilhamento de tela dentro de uma sala de chamada",
    ],
  },
];
