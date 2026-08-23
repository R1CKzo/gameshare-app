"use client";

import { useState } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { ScreenShareSourcePicker } from "@/components/call/ScreenShareSourcePicker";
import { isDesktopApp } from "@/lib/desktop";

export function CallControlBar({
  isMuted,
  onToggleMute,
  onDisconnect,
}: {
  isMuted: boolean;
  onToggleMute: () => void;
  onDisconnect: () => void;
}) {
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
      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/[0.06] bg-elevated/60 px-4 py-3 backdrop-blur">
        <ControlButton
          active={isMuted}
          activeClass="bg-danger/15 text-danger"
          label={isMuted ? "Ativar microfone" : "Mutar microfone"}
          onClick={onToggleMute}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </ControlButton>

        <ControlButton
          active={activeCall.isSharingScreen}
          activeClass="bg-accent/15 text-accent"
          label={shareLabel}
          onClick={handleShareClick}
          disabled={!desktop && !activeCall.isSharingScreen}
        >
          <ScreenIcon />
        </ControlButton>

        <button
          onClick={onDisconnect}
          aria-label="Sair da chamada"
          title="Sair da chamada"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-danger text-white transition hover:bg-danger-hover"
        >
          <PhoneOffIcon />
        </button>
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
          ? "cursor-not-allowed border-[#2d3344] text-dim opacity-40"
          : active
            ? activeClass + " border-transparent"
            : "border-[#2d3344] text-[#d5d7dc] hover:bg-elevated-hover"
      }`}
    >
      {children}
    </button>
  );
}

function MicIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4M8 23h8" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
      <path d="M12 19v4M8 23h8" />
    </svg>
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

function PhoneOffIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.86.31 1.77.53 2.7.64A2 2 0 0 1 22 17.72V20a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h2.28a2 2 0 0 1 2 1.72c.11.93.33 1.84.64 2.7a2 2 0 0 1-.45 2.11L7.31 9.68" />
      <path d="M23 1L1 23" />
    </svg>
  );
}
