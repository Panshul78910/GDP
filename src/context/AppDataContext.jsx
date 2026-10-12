import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

// Holds the multi-turn chat (B.7) and the profiling conversation so they survive
// navigating between pages. Cleared whenever a different user signs in.
const AppDataContext = createContext(null);

const MAX_LEN = 4000; // matches the backend's ChatRequest limit
const MIN_GAP_MS = 800; // light client-side throttle; the real rate limit is server-side

export function AppDataProvider({ children }) {
  const { user } = useAuth();
  const [turns, setTurns] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [pending, setPending] = useState(false);
  const lastSent = useRef(0);
  const [profiling, setProfiling] = useState({ started: false, turns: [], result: null, last: null });

  useEffect(() => {
    setTurns([]);
    setConversationId(null);
    setPending(false);
    setProfiling({ started: false, turns: [], result: null, last: null });
  }, [user?.userId]);

  const ask = useCallback(
    async (raw) => {
      const message = (raw || "").trim().slice(0, MAX_LEN);
      if (!message || pending) return null;
      if (Date.now() - lastSent.current < MIN_GAP_MS) return null;
      lastSent.current = Date.now();
      setPending(true);
      let turn;
      try {
        const answer = await api.chat(message, conversationId);
        turn = { question: message, answer };
        setTurns((t) => [...t, turn]);
      } catch (error) {
        turn = { question: message, error };
        setTurns((t) => [...t, turn]);
      } finally {
        setPending(false);
      }
      return turn;
    },
    [pending, conversationId]
  );

  return (
    <AppDataContext.Provider value={{ turns, ask, pending, profiling, setProfiling, setConversationId }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
