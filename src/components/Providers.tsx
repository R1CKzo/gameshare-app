"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { ActiveCallAudioSink } from "@/components/call/ActiveCallAudioSink";
import { ActiveCallBar } from "@/components/call/ActiveCallBar";
import { ActiveCallProvider } from "@/components/call/ActiveCallProvider";
import { GlobalNotificationListener } from "@/components/notifications/GlobalNotificationListener";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GlobalNotificationListener>
        <ActiveCallProvider>
          {children}
          <ActiveCallBar />
          <ActiveCallAudioSink />
        </ActiveCallProvider>
      </GlobalNotificationListener>
    </SessionProvider>
  );
}
