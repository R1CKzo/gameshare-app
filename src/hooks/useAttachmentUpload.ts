import { upload } from "@vercel/blob/client";
import { useState } from "react";

import { type AttachmentKind, formatBytes, kindForContentType, maxBytesForKind } from "@/lib/attachmentLimits";
import { apiUrl } from "@/lib/apiUrl";

export type PendingAttachmentState = {
  file: File;
  kind: AttachmentKind;
  previewUrl: string; // URL de objeto local, so preenchido pra imagem (miniatura antes de subir)
  status: "uploading" | "done" | "error";
  progress: number;
  blobUrl?: string;
  errorMessage?: string;
};

// Anexar um arquivo na composicao de mensagem (canal de servidor ou DM,
// mesma logica nos dois lugares) — extraido pra nao duplicar, mesma ideia
// do useChatMessages. Confere tipo/tamanho na hora (erro rapido, sem nem
// tentar subir se ja sabe que nao vai passar), depois sobe direto do
// navegador pro Vercel Blob via /api/upload (ver esse arquivo pro motivo
// de nao passar pelo nosso servidor).
export function useAttachmentUpload() {
  const [attachment, setAttachment] = useState<PendingAttachmentState | null>(null);

  function selectFile(file: File) {
    const kind = kindForContentType(file.type);
    if (!kind) {
      setAttachment({ file, kind: "file", previewUrl: "", status: "error", progress: 0, errorMessage: "Esse tipo de arquivo não é aceito." });
      return;
    }
    if (file.size > maxBytesForKind(kind)) {
      setAttachment({
        file,
        kind,
        previewUrl: "",
        status: "error",
        progress: 0,
        errorMessage: `Arquivo maior que o limite (${formatBytes(maxBytesForKind(kind))}).`,
      });
      return;
    }

    const previewUrl = kind === "image" ? URL.createObjectURL(file) : "";
    setAttachment({ file, kind, previewUrl, status: "uploading", progress: 0 });

    upload(file.name, file, {
      access: "public",
      handleUploadUrl: apiUrl("/api/upload"),
      onUploadProgress: (p) => setAttachment((a) => (a ? { ...a, progress: p.percentage } : a)),
    })
      .then((blob) => {
        setAttachment((a) => (a ? { ...a, status: "done", blobUrl: blob.url } : a));
      })
      .catch(() => {
        setAttachment((a) => (a ? { ...a, status: "error", errorMessage: "Não foi possível enviar o arquivo." } : a));
      });
  }

  function clear() {
    setAttachment((a) => {
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return null;
    });
  }

  return { attachment, selectFile, clear };
}
