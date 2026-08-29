"use client";

import { useRouter } from "next/navigation";

import { ParentalCodeModal, type ParentalAction } from "@/components/ParentalCodeModal";

// Usado direto por src/app/invite/[code]/page.tsx quando a conta tem
// controle parental ligado e ainda nao e membro do servidor -- ao contrario
// do fluxo normal (entra e redireciona na hora), essa tela fica parada
// pedindo o codigo antes de navegar pra qualquer lugar.
export function ParentalAuthGate({
  action,
  targetId,
  redirectTo,
}: {
  action: ParentalAction;
  targetId: string;
  redirectTo: string;
}) {
  const router = useRouter();
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <ParentalCodeModal
        action={action}
        targetId={targetId}
        onSuccess={() => router.push(redirectTo)}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}
