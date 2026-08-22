"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { ActiveCallAudioSink } from "@/components/call/ActiveCallAudioSink";
import { ActiveCallBar } from "@/components/call/ActiveCallBar";
import { ActiveCallProvider } from "@/components/call/ActiveCallProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ActiveCallProvider>
        {children}
        <ActiveCallBar />
        <ActiveCallAudioSink />
      </ActiveCallProvider>
    </SessionProvider>
  );
}
