import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

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
  // Identifica qual selectFile() "e dono" do upload em andamento -- se o
  // usuario trocar de arquivo antes do primeiro terminar de subir, o
  // .then()/.catch() antigo confere esse numero antes de gravar no estado
  // e desiste se nao bater mais (senao o link do arquivo A podia acabar
  // grudando no estado do arquivo B, que substituiu ele antes de terminar).
  const generationRef = useRef(0);

  function selectFile(file: File) {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return prev;
    });
    const generation = ++generationRef.current;

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
      onUploadProgress: (p) => {
        if (generationRef.current !== generation) return;
        setAttachment((a) => (a ? { ...a, progress: p.percentage } : a));
      },
    })
      .then((blob) => {
        if (generationRef.current !== generation) return;
        setAttachment((a) => (a ? { ...a, status: "done", blobUrl: blob.url } : a));
      })
      .catch(() => {
        if (generationRef.current !== generation) return;
        setAttachment((a) => (a ? { ...a, status: "error", errorMessage: "Não foi possível enviar o arquivo." } : a));
      });
  }

  function clear() {
    generationRef.current++;
    setAttachment((a) => {
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return null;
    });
  }

  return { attachment, selectFile, clear };
}
