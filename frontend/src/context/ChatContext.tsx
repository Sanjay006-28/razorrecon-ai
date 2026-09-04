import { createContext, useContext, useState, ReactNode } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatContextValue {
  conversations: Record<number, Message[]>;
  getMessages: (runId: number) => Message[];
  setMessagesForRun: (
    runId: number,
    messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])
  ) => void;
  clearMessagesForRun: (runId: number) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Record<number, Message[]>>({});

  const getMessages = (runId: number): Message[] => {
    return conversations[runId] || [];
  };

  const setMessagesForRun = (
    runId: number,
    messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])
  ) => {
    setConversations((prev) => {
      const current = prev[runId] || [];
      const updated =
        typeof messagesOrUpdater === "function"
          ? messagesOrUpdater(current)
          : messagesOrUpdater;
      return {
        ...prev,
        [runId]: updated,
      };
    });
  };

  const clearMessagesForRun = (runId: number) => {
    setConversations((prev) => {
      const next = { ...prev };
      delete next[runId];
      return next;
    });
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        getMessages,
        setMessagesForRun,
        clearMessagesForRun,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
};
