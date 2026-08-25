import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { ALL_ALLOWED_TYPES, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/attachmentLimits";

// Emite o token de upload direto pro navegador subir o arquivo pro Vercel
// Blob, sem passar pelo nosso servidor (o corpo de uma funcao serverless
// da Vercel tem teto de uns 4,5 MB, inviável pra video/foto grande). Essa
// rota so troca uns bytes de token -- os bytes do arquivo em si vao
// direto navegador -> Blob. O teto por tipo (imagem/video/arquivo) e
// checado de verdade depois, na rota de mensagem, que e o ponto que
// realmente importa (um cliente malicioso podia chamar essa rota aqui
// direto, ignorando qualquer limite que só o navegador respeitasse).
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALL_ALLOWED_TYPES,
        maximumSizeInBytes: Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_FILE_BYTES),
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Vazio de proposito: a mensagem em si e criada pela rota normal
        // de /messages, depois que o cliente ja tem a URL de volta.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
