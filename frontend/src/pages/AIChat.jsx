import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/banking";

const initialQuickActions = [
  "What is my balance?",
  "Show recent transactions",
  "My last transfer",
  "Help with something else",
];

function getCurrentTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 bg-plum-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
      <span className="w-2 h-2 bg-plum-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
      <span className="w-2 h-2 bg-plum-300 rounded-full animate-bounce"></span>
    </div>
  );
}

function parseTransactions(text) {
  if (!text) return [];

  let cleaned = text.replace(/^Here are your recent transactions:\s*/i, "").trim();

  const parts = cleaned
    .split("*")
    .map((item) => item.trim())
    .filter(Boolean);

  const parsed = parts.map((item) => {
    const typeMatch = item.match(/^(withdraw|deposit|transfer)/i);
    const amountMatch = item.match(/amount=([\d.]+)/i);
    const refMatch = item.match(/ref=([A-Z0-9]+)/i);
    const statusMatch = item.match(/status=([a-zA-Z]+)/i);

    if (!typeMatch || !amountMatch || !refMatch || !statusMatch) return null;

    return {
      type: typeMatch[1],
      amount: amountMatch[1],
      ref: refMatch[1],
      status: statusMatch[1],
    };
  });

  return parsed.filter(Boolean);
}

function parseBalance(text) {
  if (!text) return null;

  const match =
    text.match(/balance\s+is\s+₹?\s?([\d,]+(?:\.\d+)?)/i) ||
    text.match(/current account balance\s+is\s+₹?\s?([\d,]+(?:\.\d+)?)/i) ||
    text.match(/₹\s?([\d,]+(?:\.\d+)?)/i);

  if (!match) return null;

  const raw = match[1].replace(/,/g, "");
  const value = Number(raw);

  if (Number.isNaN(value)) return null;

  return value;
}

function parseSingleTransfer(text) {
  if (!text) return null;

  const typeMatch = text.match(/(withdraw|deposit|transfer)/i);
  const amountMatch = text.match(/amount[=:]?\s*([\d.]+)/i);
  const refMatch = text.match(/ref[=:]?\s*([A-Z0-9]+)/i);
  const statusMatch = text.match(/status[=:]?\s*([a-zA-Z]+)/i);

  if (!typeMatch && !amountMatch && !refMatch && !statusMatch) return null;

  return {
    type: typeMatch ? typeMatch[1] : "transfer",
    amount: amountMatch ? amountMatch[1] : "0",
    ref: refMatch ? refMatch[1] : "N/A",
    status: statusMatch ? statusMatch[1] : "success",
  };
}

function TransactionTypeBadge({ type }) {
  const lower = type.toLowerCase();

  const styles =
    lower === "deposit"
      ? "bg-emerald-100 text-emerald-700"
      : lower === "withdraw"
      ? "bg-rose-100 text-rose-700"
      : "bg-plum-100 text-plum-800";

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${styles}`}>
      {type}
    </span>
  );
}

function TransactionCard({ txn }) {
  return (
    <div className="bg-white border border-milk-300 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <TransactionTypeBadge type={txn.type} />

        <span
          className={`text-sm font-semibold ${
            txn.status.toLowerCase() === "success"
              ? "text-emerald-600"
              : "text-amber-600"
          }`}
        >
          {txn.status}
        </span>
      </div>

      <div className="grid gap-2 text-sm text-plum-800">
        <p>
          <span className="font-medium">Amount:</span> ₹ {Number(txn.amount).toFixed(2)}
        </p>
        <p className="break-all">
          <span className="font-medium">Reference:</span> {txn.ref}
        </p>
      </div>
    </div>
  );
}

function BalanceCard({ amount }) {
  return (
    <div className="rounded-3xl p-5 bg-linear-to-br from-plum-700 to-plum-900 text-milk-100 shadow-lg">
      <p className="text-plum-200 text-sm font-medium mb-2">Current Balance</p>
      <p className="text-3xl font-bold">₹ {amount.toFixed(2)}</p>
      <p className="text-plum-200 text-sm mt-2">Available account balance</p>
    </div>
  );
}

function AIMessageRenderer({ text }) {
  const lower = text.toLowerCase();

  const transactions = parseTransactions(text);
  const balance = parseBalance(text);
  const singleTransfer = parseSingleTransfer(text);

  if (
    balance !== null &&
    (lower.includes("balance") || lower.includes("current account balance"))
  ) {
    return <BalanceCard amount={balance} />;
  }

  if (transactions.length > 1) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-plum-900">Here are your recent transactions:</p>
        {transactions.map((txn, index) => (
          <TransactionCard key={index} txn={txn} />
        ))}
      </div>
    );
  }

  if (
    singleTransfer &&
    (lower.includes("last transfer") ||
      lower.includes("latest transfer") ||
      lower.includes("recent transfer"))
  ) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-plum-900">Here is your last transfer:</p>
        <TransactionCard txn={singleTransfer} />
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words text-[17px] leading-7">
      {text}
    </p>
  );
}

export default function AIChat() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      text: "Hi! I'm your AI Banking Assistant. I can help with balance, recent transactions, deposits, withdrawals, and transfers.",
      time: getCurrentTime(),
      suggestions: initialQuickActions,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const nextIdRef = useRef(2);

  useEffect(() => {
    // Same host as the API so the session cookie is sent with the handshake
    const wsUrl = new URL("/ws/chat", import.meta.env.VITE_API_BASE_URL || window.location.origin);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    socketRef.current = new WebSocket(wsUrl);

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addMessage = (message) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextIdRef.current++,
        ...message,
      },
    ]);
  };

  const addBotFollowUp = () => {
    addMessage({
      sender: "bot",
      text: "Was this helpful?",
      time: getCurrentTime(),
      suggestions: [
        "Yes, thanks",
        "No, not really",
        "Show recent transactions",
        "Need more help",
      ],
    });
  };

  const sendQuery = async (customQuery = null) => {
    const finalQuery = customQuery || query;

    if (!finalQuery.trim()) return;

    addMessage({
      sender: "me",
      text: finalQuery,
      time: getCurrentTime(),
    });

    setQuery("");
    setLoading(true);

    try {
      const res = await api.post("/ai/query", { query: finalQuery });

      addMessage({
        sender: "ai",
        text: res.data.answer,
        time: getCurrentTime(),
      });

      addBotFollowUp();
    } catch {
      addMessage({
        sender: "ai",
        text: "Sorry, I couldn't process your request right now. Please try again.",
        time: getCurrentTime(),
      });

      addMessage({
        sender: "bot",
        text: "You can try one of these options.",
        time: getCurrentTime(),
        suggestions: ["Try again", "What is my balance?", "Show recent transactions"],
      });
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(finalQuery);
    }

    setLoading(false);
  };

  const handleSuggestionClick = (option) => {
    if (option === "Yes, thanks") {
      addMessage({
        sender: "bot",
        text: "Happy to help. If you need anything else, just ask.",
        time: getCurrentTime(),
        suggestions: ["What is my balance?", "Show recent transactions", "Help with something else"],
      });
      return;
    }

    if (option === "No, not really") {
      addMessage({
        sender: "bot",
        text: "No problem. Please choose another option or type your question in more detail.",
        time: getCurrentTime(),
        suggestions: ["What is my balance?", "Show recent transactions", "My last transfer", "Help with something else"],
      });
      return;
    }

    if (option === "Need more help" || option === "Help with something else") {
  addMessage({
    sender: "bot",
    text: "Sure What would you like help with?",
    time: getCurrentTime(),
    suggestions: [
      "Check Balance",
      "Recent Transactions",
      "Last Transfer",
      "Deposit Help",
      "Withdraw Help"
    ],
  });
  return;
}

    if (option === "Try again") {
      return;
    }

    if (option === "What is my balance?" || option === "Check Balance 💰") {
  sendQuery("What is my current balance?");
  return;
}

if (option === "Show recent transactions" || option === "Recent Transactions 📄") {
  sendQuery("Show my recent transactions");
  return;
}

if (option === "My last transfer" || option === "Last Transfer 🔁") {
  sendQuery("Tell me my last transfer");
  return;
}



if (option === "Deposit Help") {
  addMessage({
    sender: "bot",
    text: "To add money, open Add Money and pay with a Stripe test card (4242 4242 4242 4242).",
    time: getCurrentTime(),
    suggestions: ["Go to Add Money", "Check Balance"],
  });
  return;
}

if (option === "Withdraw Help") {
  addMessage({
    sender: "bot",
    text: "To withdraw money, go to Withdraw section. Make sure you have sufficient balance.",
    time: getCurrentTime(),
    suggestions: ["Go to Withdraw", "Check Balance"],
  });
  return;
}

if (option === "Go to Add Money") {
  navigate("/payments");
  return;
}

if (option === "Go to Withdraw") {
  navigate("/withdraw");
  return;
}

    sendQuery(option);
  };

  const clearChat = () => {
    nextIdRef.current = 2;
    setMessages([
      {
        id: 1,
        sender: "bot",
        text: "Chat cleared. How can I help you now?",
        time: getCurrentTime(),
        suggestions: initialQuickActions,
      },
    ]);
    setQuery("");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="AI Banking Assistant" description="Ask about your balance, transactions, deposits and transfers." />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-primary">
          <div>
            <p className="text-lg font-semibold text-milk-100">Support Chat</p>
            <p className="text-sm text-plum-200">Online • Usually replies instantly</p>
          </div>

          <button
            onClick={clearChat}
            className="btn-secondary whitespace-nowrap shrink-0 min-h-10 px-3 sm:px-4"
          >
            Clear Chat
          </button>
        </div>

        <div className="h-[calc(100dvh-22rem)] min-h-[360px] overflow-y-auto p-4 sm:p-5 bg-surface-secondary/50 space-y-4" aria-live="polite">
          {messages.map((msg) => {
            const isUser = msg.sender === "me";
            const isAI = msg.sender === "ai";

            return (
              <div key={msg.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                  {!isUser && (
                    <div className="flex items-center gap-2 mb-1 ml-1">
                      <div className="w-8 h-8 rounded-full bg-plum-900 text-milk-100 flex items-center justify-center text-sm font-bold">
                        ₹
                      </div>
                      <span className="text-xs text-plum-500 font-medium">
                        {isAI ? "AI Assistant" : "Support Bot"}
                      </span>
                    </div>
                  )}

                  <div
                    className={`px-5 py-4 rounded-3xl shadow-sm ${
                      isUser
                        ? "bg-plum-900 text-milk-100 rounded-br-md"
                        : isAI
                        ? "bg-milk-200 text-plum-900 rounded-bl-md"
                        : "bg-white border border-milk-300 text-plum-800 rounded-bl-md"
                    }`}
                  >
                    {isAI ? (
                      <AIMessageRenderer text={msg.text} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[17px] leading-7">
                        {msg.text}
                      </p>
                    )}
                  </div>

                  <span className="text-xs text-plum-300 mt-1 px-2">
                    {msg.time}
                  </span>

                  {msg.suggestions && (
                    <div className="flex flex-wrap gap-2 mt-3 px-1">
                      {msg.suggestions.map((option, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(option)}
                          className="bg-white border border-plum-200 text-plum-800 px-4 py-2 rounded-full text-sm font-medium transition hover:bg-plum-50"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[82%] flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <div className="w-8 h-8 rounded-full bg-plum-900 text-milk-100 flex items-center justify-center text-sm font-bold">
                    ₹
                  </div>
                  <span className="text-xs text-plum-500 font-medium">AI Assistant</span>
                </div>

                <div className="px-5 py-4 rounded-3xl rounded-bl-md bg-milk-200">
                  <TypingDots />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef}></div>
        </div>

        <div className="border-t border-border p-3 sm:p-4 bg-surface">
          <div className="flex gap-3">
            <input
              aria-label="Message the AI assistant"
              className="input-field flex-1 min-w-0 rounded-2xl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendQuery();
              }}
              placeholder="Type your message..."
            />

            <button
              onClick={() => sendQuery()}
              disabled={loading}
              className="btn-primary px-5 sm:px-8 rounded-2xl"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}