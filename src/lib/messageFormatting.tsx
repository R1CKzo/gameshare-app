import type { ReactNode } from "react";

// Formatacao simples de mensagem -- sem biblioteca nenhuma, e nunca monta
// HTML cru (so cria elementos React direto), entao nao existe brecha de
// injecao de HTML pra se preocupar. Cobre so o basico: **negrito**,
// *italico*, `codigo`, e link solto virando clicavel. Passada unica com
// um regex combinado, na ordem certa (bold antes de italic na mesma
// posicao, senao "**x**" vira italico parcial com um "*" sobrando). Link
// exclui "*" e crase do corpo de proposito, senao um link colado direto
// num **bold** ou `codigo` engole o marcador junto.
const TOKEN_REGEX = /(https?:\/\/[^\s*`]+)|(\*\*([^*\n]+?)\*\*)|(\*([^*\n]+?)\*)|(`([^`\n]+?)`)/g;

// Limitacoes aceitas de proposito (nao e CommonMark completo): um "*"
// sozinho sem par pode disparar italico por engano se houver outro "*"
// mais adiante na mesma mensagem; sem **negrito+*italico** aninhado;
// pontuacao logo depois de um link solto nao e separada dele.
export function formatMessageContent(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(content))) {
    if (match.index > lastIndex) nodes.push(content.slice(lastIndex, match.index));
    const [full, url, , bold, , italic, , code] = match;
    const key = `t${index++}`;

    if (url) {
      nodes.push(
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent underline hover:no-underline"
        >
          {url}
        </a>,
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={key}>{bold}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{italic}</em>);
    } else if (code !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-overlay-strong px-1.5 py-0.5 font-mono text-[0.85em]">
          {code}
        </code>,
      );
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
}
