import { useCallback, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  original: string;
  translated: string;
  isFinal: boolean;
  isTranslating: boolean;
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const activeIdRef = useRef<string | null>(null);

  const onTranscriptUpdate = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim() && !isFinal) return;

    setMessages((prev) => {
      let activeId = activeIdRef.current;
      let next = [...prev];

      const activeMessage = activeId
        ? next.find((m) => m.id === activeId && !m.isFinal)
        : undefined;

      if (!activeMessage) {
        activeId = createId();
        activeIdRef.current = activeId;
        next.push({
          id: activeId,
          original: text,
          translated: "",
          isFinal: false,
          isTranslating: true,
        });
      } else {
        next = next.map((m) =>
          m.id === activeId ? { ...m, original: text, isTranslating: true } : m,
        );
      }

      if (isFinal && activeId) {
        next = next.map((m) =>
          m.id === activeId
            ? { ...m, isFinal: true, isTranslating: true }
            : m,
        );
        activeIdRef.current = null;
      }

      return next;
    });
  }, []);

  const onTranslationUpdate = useCallback(
    (text: string, isTranslating: boolean) => {
      setMessages((prev) => {
        const activeId = activeIdRef.current;
        const targetId =
          activeId ??
          [...prev].reverse().find((m) => !m.isFinal || m.isTranslating)?.id;

        if (!targetId) return prev;

        return prev.map((m) =>
          m.id === targetId
            ? { ...m, translated: text, isTranslating }
            : m,
        );
      });
    },
    [],
  );

  const resetMessages = useCallback(() => {
    setMessages([]);
    activeIdRef.current = null;
  }, []);

  return {
    messages,
    onTranscriptUpdate,
    onTranslationUpdate,
    resetMessages,
  };
}
