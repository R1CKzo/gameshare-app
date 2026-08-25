"use client";

import type { PendingAttachmentState } from "@/hooks/useAttachmentUpload";
import { formatBytes } from "@/lib/attachmentLimits";

// Previa pequena do arquivo escolhido, mostrada acima da caixa de texto
// enquanto sobe (ou se der erro) — mesmo componente usado no canal de
// servidor e na DM.
export function AttachmentPreview({ attachment, onRemove }: { attachment: PendingAttachmentState; onRemove: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-elevated px-3 py-2">
      {attachment.kind === "image" && attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <FileIcon />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-foreground">{attachment.file.name}</div>
        <div className={`text-[11px] ${attachment.status === "error" ? "text-danger" : "text-dim"}`}>
          {attachment.status === "uploading"
            ? `Enviando... ${attachment.progress}%`
            : attachment.status === "error"
              ? attachment.errorMessage
              : formatBytes(attachment.file.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover anexo"
        className="shrink-0 rounded-md p-1 text-muted transition hover:bg-elevated-hover hover:text-foreground"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 shrink-0 rounded bg-overlay p-2 text-muted">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
