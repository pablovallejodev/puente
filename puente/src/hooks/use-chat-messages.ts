import { useCallback, useRef, useState } from "react";

export type TranslationStatus = "queued" | "translating" | "done" | "error";
export type TranscriptionStatus = "pending" | "done" | "error";

export type ChatMessage = {
  id: string;
  original: string;
  translated: string;
  isFinal: boolean;
  translationStatus: TranslationStatus;
  transcriptionStatus: TranscriptionStatus;
  /** Short UI copy when transcriptionStatus is "error". */
  transcriptionError?: string;
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

  /** Placeholder bubble while ASR processes a chunk. */
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
            transcriptionError: undefined,
            ...(sourceLanguageId ? { sourceLanguageId } : {}),
          };
        }),
      );
      return found;
    },
    [syncMessages],
  );

  /** Drop a pending bubble (session cancel / stop — not a user-facing failure). */
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

  /** Turn a pending bubble into a brief error (same id). */
  const failPendingTranscript = useCallback(
    (messageId: string, message: string) => {
      if (!messageId) return;
      const copy = message.trim() || "No se entendió";
      syncMessages(
        messagesRef.current.map((m) => {
          if (m.id !== messageId || m.transcriptionStatus !== "pending") {
            return m;
          }
          return {
            ...m,
            transcriptionStatus: "error" as const,
            transcriptionError: copy,
          };
        }),
      );
    },
    [syncMessages],
  );

  /** Remove any message by id (error auto-dismiss). */
  const removeMessage = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      syncMessages(messagesRef.current.filter((m) => m.id !== messageId));
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

          // Queue / in-flight: status only — never wipe translated text.
          // A completed translation must not regress when a newer job preempts.
          if (status === "queued" || status === "translating") {
            if (
              !options?.force &&
              m.translationStatus === "done" &&
              m.translated
            ) {
              return m;
            }
            return { ...m, translationStatus: status };
          }

          // Freeze a finished translation against empty clears and replacements.
          if (
            !options?.force &&
            m.translationStatus === "done" &&
            m.translated
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
    failPendingTranscript,
    removeMessage,
    appendFinalTranscript,
    onTranslationUpdate,
    resetMessages,
  };
}
