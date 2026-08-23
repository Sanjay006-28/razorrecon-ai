import { useRef, useState } from "react";
import { Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTER_MESSAGES: Message[] = [
  {
    role: "assistant",
    content:
      "Hello! I'm RazorRecon AI. Ask me anything about your reconciliation results — for example:\n• \"What caused the most exceptions this run?\"\n• \"Summarise the amount mismatches.\"\n• \"Are there any delayed settlements beyond T+5?\"",
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(STARTER_MESSAGES);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      {
        role: "assistant",
        content: "⏳ AI response coming soon — backend integration pending.",
      },
    ]);
    setInput("");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-96px)]">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">AI Chat</h1>
        <p className="mt-1 text-sm text-gray-500">
          Ask natural language questions about your reconciliation data.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg p-5 space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your reconciliation data…"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition"
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 text-white px-4 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Send size={15} />
          Send
        </button>
      </div>
    </div>
  );
}
