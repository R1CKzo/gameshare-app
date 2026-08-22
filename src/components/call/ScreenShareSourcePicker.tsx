"use client";

import { useEffect, useState } from "react";

import { getScreenSources, type ScreenSource } from "@/lib/desktop";
import type { ScreenShareOptions } from "@/hooks/useVoiceMesh";

const RESOLUTIONS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
];
const FPS_OPTIONS = [30, 60];

// Seletor 100% nosso (nao o picker generico do navegador): lista as telas e
// janelas/jogos abertos via desktopCapturer do Electron, com miniatura de
// cada um, mais controle de FPS e resolucao antes de comecar a transmitir.
export function ScreenShareSourcePicker({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (options: ScreenShareOptions) => void;
}) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [selected, setSelected] = useState<ScreenSource | null>(null);
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState(RESOLUTIONS[1]);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getScreenSources().then((list) => {
      if (!cancelled) setSources(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const screens = sources?.filter((s) => s.type === "screen") ?? [];
  const windows = sources?.filter((s) => s.type === "window") ?? [];

  function confirm() {
    if (!selected) return;
    onConfirm({
      sourceId: selected.id,
      sourceType: selected.type,
      fps,
      width: resolution.width,
      height: resolution.height,
      includeSystemAudio: selected.type === "screen" && includeSystemAudio,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Compartilhar tela</h2>
          <p className="mt-0.5 text-sm text-muted">Escolha o que compartilhar e a qualidade da transmissao.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sources === null ? (
            <div className="py-12 text-center text-sm text-muted">Carregando janelas e telas...</div>
          ) : sources.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">Nenhuma fonte disponivel pra compartilhar.</div>
          ) : (
            <>
              <SourceGroup title="Tela inteira" items={screens} selected={selected} onSelect={setSelected} />
              <SourceGroup title="Janela de app ou jogo" items={windows} selected={selected} onSelect={setSelected} />
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-white/[0.06] px-5 py-4">
          <SettingRow label="Qualidade">
            <SegmentedControl
              options={RESOLUTIONS.map((r) => r.label)}
              value={resolution.label}
              onChange={(label) => setResolution(RESOLUTIONS.find((r) => r.label === label)!)}
            />
          </SettingRow>
          <SettingRow label="Taxa de quadros">
            <SegmentedControl
              options={FPS_OPTIONS.map((f) => `${f} FPS`)}
              value={`${fps} FPS`}
              onChange={(label) => setFps(Number(label.replace(" FPS", "")))}
            />
          </SettingRow>
          {selected?.type === "screen" ? (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-xs font-bold tracking-wide text-muted">AUDIO DO SISTEMA</span>
                <input
                  type="checkbox"
                  checked={includeSystemAudio}
                  onChange={(e) => setIncludeSystemAudio(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
              {includeSystemAudio && (
                <p className="text-xs text-danger">
                  Isso grava tudo que sai pelo seu alto-falante — inclusive a voz de quem esta na chamada. Quem
                  estiver ligado vai ouvir a propria voz de volta, com eco. So ligue se realmente precisar (ex:
                  mostrar um video com som).
                </p>
              )}
            </div>
          ) : selected?.type === "window" ? (
            <p className="text-xs text-dim">
              O audio do sistema so pode ser capturado ao compartilhar a tela inteira — compartilhar uma janela leva
              so o video (seu microfone continua indo normalmente).
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 py-4">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:text-[#f5f5f7]"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={!selected}
            className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-40"
          >
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-bold tracking-wide text-muted">{label.toUpperCase()}</span>
      {children}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-full bg-background p-1">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
            option === value ? "bg-primary text-white" : "text-muted hover:text-[#f5f5f7]"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function SourceGroup({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: ScreenSource[];
  selected: ScreenSource | null;
  onSelect: (source: ScreenSource) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 text-xs font-bold tracking-wide text-muted">{title.toUpperCase()}</div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {items.map((source) => {
          const isSelected = selected?.id === source.id;
          return (
            <button
              key={source.id}
              onClick={() => onSelect(source)}
              title={source.name}
              className={`flex flex-col overflow-hidden rounded-lg border-2 bg-background text-left transition ${
                isSelected ? "border-primary" : "border-transparent hover:border-[#2d3344]"
              }`}
            >
              <div className="flex h-20 items-center justify-center overflow-hidden bg-black/40">
                {source.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded bg-elevated" />
                )}
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                {source.appIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.appIcon} alt="" className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate text-[11px] font-semibold text-[#d5d7dc]">{source.name}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
