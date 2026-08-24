"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { ActiveCallAudioSink } from "@/components/call/ActiveCallAudioSink";
import { ActiveCallBar } from "@/components/call/ActiveCallBar";
import { ActiveCallProvider } from "@/components/call/ActiveCallProvider";
import { GlobalNotificationListener } from "@/components/notifications/GlobalNotificationListener";
import { PresenceProvider } from "@/components/notifications/PresenceProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GlobalNotificationListener>
        <PresenceProvider>
          <ActiveCallProvider>
            {children}
            <ActiveCallBar />
            <ActiveCallAudioSink />
          </ActiveCallProvider>
        </PresenceProvider>
      </GlobalNotificationListener>
    </SessionProvider>
  );
}
