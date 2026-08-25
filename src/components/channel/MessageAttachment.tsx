import { formatBytes } from "@/lib/attachmentLimits";

// Imagem/video/arquivo anexado numa mensagem. Imagem usa <img> comum (nao
// next/image) de proposito -- as dimensoes do arquivo enviado sao
// arbitrarias, ao contrario dos avatares (sempre 256x256), entao nao tem
// como aproveitar a otimizacao automatica sem redimensionar de antemao.
export function MessageAttachment({
  url,
  type,
  name,
  size,
}: {
  url: string;
  type: string;
  name: string;
  size: number;
}) {
  if (type === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block max-w-xs overflow-hidden rounded-lg border border-overlay"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="max-h-72 w-auto object-contain" />
      </a>
    );
  }

  if (type === "video") {
    return <video controls src={url} className="mt-1.5 max-h-72 max-w-xs rounded-lg border border-overlay" />;
  }

  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-xs items-center gap-2.5 rounded-lg bg-elevated px-3 py-2.5 text-sm transition hover:bg-elevated-hover"
    >
      <FileIcon />
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{name}</span>
      <span className="shrink-0 text-xs text-dim">{formatBytes(size)}</span>
    </a>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
