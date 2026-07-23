import { useCallback, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  original: string;
  translated: string;
  isFinal: boolean;
  isTranslating: boolean;
  sourceLanguageId: string;
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeIdRef = useRef<string | null>(null);

  const syncMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const onTranscriptUpdate = useCallback(
    (text: string, isFinal: boolean, sourceLanguageId: string): string => {
      if (!text.trim() && !isFinal) return activeIdRef.current ?? "";

      const prev = messagesRef.current;
      let messageId = activeIdRef.current;
      const activeMessage = messageId
        ? prev.find((m) => m.id === messageId && !m.isFinal)
        : undefined;

      if (!activeMessage) {
        messageId = createId();
        activeIdRef.current = messageId;
        syncMessages([
          ...prev,
          {
            id: messageId,
            original: text,
            translated: "",
            isFinal: false,
            isTranslating: true,
            sourceLanguageId,
          },
        ]);
      } else {
        syncMessages(
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  original: text,
                  isTranslating: true,
                  // Freeze source language once set for an in-progress utterance.
                  sourceLanguageId: m.sourceLanguageId || sourceLanguageId,
                }
              : m,
          ),
        );
      }

      if (isFinal && messageId) {
        syncMessages(
          messagesRef.current.map((m) =>
            m.id === messageId
              ? { ...m, isFinal: true, isTranslating: true }
              : m,
          ),
        );
        activeIdRef.current = null;
      }

      return messageId ?? "";
    },
    [syncMessages],
  );

  const onTranslationUpdate = useCallback(
    (
      messageId: string,
      text: string,
      isTranslating: boolean,
      options?: { force?: boolean },
    ) => {
      if (!messageId) return;

      syncMessages(
        messagesRef.current.map((m) => {
          if (m.id !== messageId) return m;

          // Never overwrite a completed final translation unless forced.
          if (
            !options?.force &&
            m.isFinal &&
            m.translated &&
            !m.isTranslating &&
            text
          ) {
            return m;
          }

          return { ...m, translated: text, isTranslating };
        }),
      );
    },
    [syncMessages],
  );

  const resetMessages = useCallback(() => {
    syncMessages([]);
    activeIdRef.current = null;
  }, [syncMessages]);

  return {
    messages,
    onTranscriptUpdate,
    onTranslationUpdate,
    resetMessages,
  };
}
