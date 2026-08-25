// Limites de anexo de mensagem (foto/video/arquivo) -- um lugar so, usado
// pela rota de upload, pelas rotas de mensagem (validacao de verdade,
// nunca confia so no que o cliente ja filtrou) e pelos dois compositores
// de chat (canal de servidor e DM), pra nao desalinhar os numeros.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/zip",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const ALL_ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_FILE_TYPES];

export type AttachmentKind = "image" | "video" | "file";

export function kindForContentType(contentType: string): AttachmentKind | null {
  if (ALLOWED_IMAGE_TYPES.includes(contentType)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(contentType)) return "video";
  if (ALLOWED_FILE_TYPES.includes(contentType)) return "file";
  return null;
}

export function maxBytesForKind(kind: AttachmentKind): number {
  return kind === "image" ? MAX_IMAGE_BYTES : kind === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
