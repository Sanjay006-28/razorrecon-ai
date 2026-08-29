import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import RunSelector from "../components/RunSelector";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_PROMPTS = [
  "Which exceptions have the highest amount impact?",
  "Why is my match rate 68.25%?",
  "Summarize the duplicate payments found in this run.",
];

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-gray-950 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function MarkdownText({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const parsed: Array<{ type: "p"; text: string } | { type: "ul"; items: string[] }> = [];
    let bulletItems: string[] = [];

    const flushBullets = () => {
      if (bulletItems.length > 0) {
        parsed.push({ type: "ul", items: bulletItems });
        bulletItems = [];
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushBullets();
        return;
      }

      const bulletMatch = trimmed.match(/^[-*\u2022]\s+(.+)$/);
      if (bulletMatch) {
        bulletItems.push(bulletMatch[1]);
        return;
      }

      flushBullets();
      parsed.push({ type: "p", text: trimmed });
    });

    flushBullets();
    return parsed;
  }, [content]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "ul") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

export default function Chat() {
  const [runId, setRunId] = useState<number>(
    () => Number(localStorage.getItem("lastRunId") || 1)
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Number.isFinite(runId) && runId > 0) {
      localStorage.setItem("lastRunId", String(runId));
    }
    setMessages([]);
    setError(null);
  }, [runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const sendMessage = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || loading || !Number.isFinite(runId) || runId <= 0) return;

    const priorMessages = messages;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await api.chat.sendMessage({
        run_id: runId,
        message: text,
        conversation_history: priorMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.response || "No response received." },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to reach chatbot service.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `AI Assistant unavailable: ${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-96px)] max-w-5xl flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            AI Data Assistant
          </h1>
          <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
            Ask natural language questions about your reconciliation run data.
          </p>
        </div>

        <RunSelector
          value={String(runId)}
          onChange={(id: string) => setRunId(Number(id))}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                <Bot className="h-4 w-4" />
                Example prompts
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={loading}
                    className="min-h-16 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-900/50 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                    <Bot size={16} />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : "rounded-bl-sm border border-gray-100 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <MarkdownText content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                  <Bot size={16} />
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-xs font-medium text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <span>Thinking with Gemini Flash...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex gap-3 border-t border-gray-100 p-3 dark:border-gray-700"
        >
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
            placeholder="Ask about match rates, exception impacts, or specific payments..."
            className="min-w-0 flex-1 rounded-xl border border-transparent bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-950"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-700/50"
          >
            <Send size={15} />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
