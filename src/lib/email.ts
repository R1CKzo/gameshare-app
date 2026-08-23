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
  purpose: "LOGIN" | "PASSWORD_CHANGE";
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || "GameShare";

  if (!apiKey || !fromAddress) {
    throw new Error("Envio de email nao configurado (BREVO_API_KEY/EMAIL_FROM_ADDRESS ausentes).");
  }

  const subject = purpose === "LOGIN" ? "Seu codigo de login" : "Confirme a troca de senha";
  const intro =
    purpose === "LOGIN"
      ? "Use o codigo abaixo pra concluir seu login no GameShare:"
      : "Use o codigo abaixo pra confirmar a troca de senha no GameShare:";

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px;">GameShare</h2>
      <p style="color: #333;">${intro}</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 16px; background: #f4f4f7; border-radius: 8px; margin: 16px 0;">
        ${code}
      </div>
      <p style="color: #888; font-size: 13px;">Esse codigo expira em 10 minutos. Se voce nao pediu isso, pode ignorar esse email.</p>
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
