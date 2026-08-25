"use client";

import { useState } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { ScreenShareSourcePicker } from "@/components/call/ScreenShareSourcePicker";
import { isDesktopApp } from "@/lib/desktop";

// So o botao de compartilhar tela mora aqui -- mutar microfone, silenciar
// geral e sair da chamada moraram pro pill do usuario na barra lateral
// (sempre visivel, em qualquer tela do app), entao ficariam duplicados
// aqui dentro.
export function CallControlBar() {
  const activeCall = useActiveCall();
  const [pickerOpen, setPickerOpen] = useState(false);
  const desktop = isDesktopApp();

  function handleShareClick() {
    if (activeCall.isSharingScreen) {
      activeCall.stopScreenShare();
      return;
    }
    if (!desktop) return;
    setPickerOpen(true);
  }

  async function handleConfirmShare(options: Parameters<typeof activeCall.startScreenShare>[0]) {
    setPickerOpen(false);
    await activeCall.startScreenShare(options);
  }

  const shareLabel = activeCall.isSharingScreen
    ? "Parar de compartilhar tela"
    : desktop
      ? "Compartilhar tela"
      : "Compartilhar tela — disponível só no app para Windows";

  return (
    <>
      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-overlay bg-elevated/60 px-4 py-3 backdrop-blur">
        <ControlButton
          active={activeCall.isSharingScreen}
          activeClass="bg-accent/15 text-accent"
          label={shareLabel}
          onClick={handleShareClick}
          disabled={!desktop && !activeCall.isSharingScreen}
        >
          <ScreenIcon />
        </ControlButton>
      </div>

      {pickerOpen && (
        <ScreenShareSourcePicker onCancel={() => setPickerOpen(false)} onConfirm={handleConfirmShare} />
      )}
    </>
  );
}

function ControlButton({
  active,
  activeClass,
  label,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  activeClass: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      aria-disabled={disabled}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
        disabled
          ? "cursor-not-allowed border-border text-dim opacity-40"
          : active
            ? activeClass + " border-transparent"
            : "border-border text-foreground-secondary hover:bg-elevated-hover"
      }`}
    >
      {children}
    </button>
  );
}

function ScreenIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}
