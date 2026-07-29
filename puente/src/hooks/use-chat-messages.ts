import { useCallback, useRef, useState } from "react";

export type TranslationStatus = "queued" | "translating" | "done" | "error";
export type TranscriptionStatus = "pending" | "done";

export type ChatMessage = {
  id: string;
  original: string;
  translated: string;
  isFinal: boolean;
  translationStatus: TranslationStatus;
  transcriptionStatus: TranscriptionStatus;
  sourceLanguageId: string;
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  const syncMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  /** Placeholder bubble while Whisper processes a chunk. */
  const beginPendingTranscript = useCallback(
    (sourceLanguageId: string): string => {
      const messageId = createId();
      syncMessages([
        ...messagesRef.current,
        {
          id: messageId,
          original: "",
          translated: "",
          isFinal: false,
          translationStatus: "queued",
          transcriptionStatus: "pending",
          sourceLanguageId,
        },
      ]);
      return messageId;
    },
    [syncMessages],
  );

  /** Fill a pending bubble with the accepted transcript. */
  const completePendingTranscript = useCallback(
    (
      messageId: string,
      text: string,
      sourceLanguageId?: string,
    ): boolean => {
      const trimmed = text.trim();
      if (!messageId || !trimmed) return false;

      let found = false;
      syncMessages(
        messagesRef.current.map((m) => {
          if (m.id !== messageId) return m;
          found = true;
          return {
            ...m,
            original: trimmed,
            isFinal: true,
            transcriptionStatus: "done" as const,
            ...(sourceLanguageId ? { sourceLanguageId } : {}),
          };
        }),
      );
      return found;
    },
    [syncMessages],
  );

  /** Drop a pending bubble when the chunk produced no usable text. */
  const discardPendingTranscript = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      syncMessages(
        messagesRef.current.filter(
          (m) =>
            m.id !== messageId || m.transcriptionStatus !== "pending",
        ),
      );
    },
    [syncMessages],
  );

  /** Append a final, already-sanitized transcript as a new message. */
  const appendFinalTranscript = useCallback(
    (text: string, sourceLanguageId: string): string => {
      const trimmed = text.trim();
      if (!trimmed) return "";

      const messageId = createId();
      syncMessages([
        ...messagesRef.current,
        {
          id: messageId,
          original: trimmed,
          translated: "",
          isFinal: true,
          translationStatus: "queued",
          transcriptionStatus: "done",
          sourceLanguageId,
        },
      ]);
      return messageId;
    },
    [syncMessages],
  );

  const onTranslationUpdate = useCallback(
    (
      messageId: string,
      text: string,
      status: TranslationStatus,
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
            m.translationStatus === "done" &&
            text
          ) {
            return m;
          }

          return {
            ...m,
            translated: text,
            translationStatus: status,
          };
        }),
      );
    },
    [syncMessages],
  );

  const resetMessages = useCallback(() => {
    syncMessages([]);
  }, [syncMessages]);

  return {
    messages,
    beginPendingTranscript,
    completePendingTranscript,
    discardPendingTranscript,
    appendFinalTranscript,
    onTranslationUpdate,
    resetMessages,
  };
}
