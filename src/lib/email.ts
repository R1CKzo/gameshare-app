const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// Brevo (300 emails/dia gratis, sem cartao, verificacao de remetente e so
// confirmar um clique — ao contrario de servicos que exigem verificar um
// dominio inteiro).
export async function sendSecurityCodeEmail({
  to,
  code,
  purpose,
}: {
  to: string;
  code: string;
  purpose: "LOGIN" | "PASSWORD_CHANGE" | "EMAIL_CHANGE" | "PARENTAL_SETUP" | "PARENTAL_ACTION" | "PARENTAL_REMOVAL";
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || "GameShare";

  if (!apiKey || !fromAddress) {
    throw new Error("Envio de email não configurado (BREVO_API_KEY/EMAIL_FROM_ADDRESS ausentes).");
  }

  const COPY: Record<typeof purpose, { subject: string; intro: string }> = {
    LOGIN: { subject: "Seu código de login", intro: "Use o código abaixo pra concluir seu login no GameShare:" },
    PASSWORD_CHANGE: {
      subject: "Confirme a troca de senha",
      intro: "Use o código abaixo pra confirmar a troca de senha no GameShare:",
    },
    EMAIL_CHANGE: {
      subject: "Confirme seu novo email",
      intro: "Use o código abaixo pra confirmar que esse email é seu e concluir a troca no GameShare:",
    },
    PARENTAL_SETUP: {
      subject: "Confirme o controle parental",
      intro:
        "Alguém está ativando o controle parental no GameShare usando esse email como responsável. Use o código abaixo pra confirmar:",
    },
    PARENTAL_ACTION: {
      subject: "Autorização necessária no GameShare",
      intro:
        "Uma conta sob seu controle parental está pedindo pra entrar num servidor ou aceitar um pedido de amizade. Se você autoriza, use o código abaixo:",
    },
    PARENTAL_REMOVAL: {
      subject: "Confirme a remoção do controle parental",
      intro: "Use o código abaixo, junto com a senha que você criou, pra remover o controle parental no GameShare:",
    },
  };
  const { subject, intro } = COPY[purpose];

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px;">GameShare</h2>
      <p style="color: #333;">${intro}</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; background: #f4f4f7; border-radius: 8px; margin: 16px 0;">
        ${code}
      </div>
      <p style="color: #888; font-size: 13px;">Esse código expira em 10 minutos. Se você não pediu isso, pode ignorar esse email.</p>
    </div>
  `;

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { email: fromAddress, name: fromName },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar email (${res.status}): ${text}`);
  }
}
