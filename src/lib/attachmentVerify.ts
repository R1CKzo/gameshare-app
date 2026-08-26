import { head } from "@vercel/blob";

import { kindForContentType, maxBytesForKind, type AttachmentKind } from "@/lib/attachmentLimits";

export type VerifiedAttachment = {
  attachmentUrl: string;
  attachmentType: AttachmentKind;
  attachmentName: string;
  attachmentSize: number;
};

// So server-side (usa o SDK do Vercel Blob, que fala com a nossa loja
// autenticado pelo BLOB_READ_WRITE_TOKEN) -- por isso fica separado de
// attachmentLimits.ts, que tambem e importado pelo navegador. Usado pelas
// duas rotas de mensagem (canal e DM) em vez de cada uma reimplementar a
// mesma checagem.
//
// Nunca confia no que o cliente declarou (tipo/tamanho no corpo da
// requisicao): busca o objeto de verdade no Blob via head() e usa o
// tamanho/tipo REAIS de la. head() so enxerga blobs da nossa propria loja
// -- uma URL de qualquer outra conta/loja da Vercel falha aqui mesmo que o
// hostname pareca legitimo (".public.blob.vercel-storage.com" e
// compartilhado por todas as lojas de todas as contas).
export async function verifyAttachment(url: unknown, name: unknown): Promise<VerifiedAttachment | null> {
  if (typeof url !== "string" || typeof name !== "string" || !name.trim()) return null;

  try {
    if (!new URL(url).hostname.endsWith(".public.blob.vercel-storage.com")) return null;
  } catch {
    return null;
  }

  try {
    const blob = await head(url);
    const kind = kindForContentType(blob.contentType);
    if (!kind) return null;
    if (blob.size > maxBytesForKind(kind)) return null;
    return { attachmentUrl: url, attachmentType: kind, attachmentName: name.slice(0, 255), attachmentSize: blob.size };
  } catch {
    return null;
  }
}
