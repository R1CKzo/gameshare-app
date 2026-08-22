"use client";

import { useEffect, useRef } from "react";

// Mantem o scroll grudado embaixo quando ja estava embaixo (chegou item
// novo), mas nao forca o scroll se a pessoa rolou pra cima pra ler coisa
// antiga. Usado pelas listas de mensagem (canal de servidor e DM).
export function useStickyScroll<T>(items: T[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function stickToBottom() {
    shouldStickToBottomRef.current = true;
  }

  return { scrollRef, handleScroll, stickToBottom };
}
