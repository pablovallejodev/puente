import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TranslationPipeline } from '@huggingface/transformers';

import { resolveDeviceBaseLanguage } from '@/constants/languages';

export type TranslationMessage = {
  id: string;
  sourceLanguage: string;
  sourceLabel: string;
  translatedText: string;
  timestamp: number;
};

type AppContextValue = {
  baseLanguage: string;
  setBaseLanguage: (code: string) => void;
  messages: TranslationMessage[];
  addMessage: (message: TranslationMessage) => void;
  clearMessages: () => void;
  translator: TranslationPipeline | null;
  setTranslator: (translator: TranslationPipeline | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [baseLanguage, setBaseLanguage] = useState(resolveDeviceBaseLanguage);
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  const [translator, setTranslator] = useState<TranslationPipeline | null>(null);

  const value = useMemo<AppContextValue>(
    () => ({
      baseLanguage,
      setBaseLanguage,
      messages,
      addMessage: (message) => setMessages((current) => [...current, message]),
      clearMessages: () => setMessages([]),
      translator,
      setTranslator,
    }),
    [baseLanguage, messages, translator],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
