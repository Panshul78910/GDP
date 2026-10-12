import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAppData } from "../context/AppDataContext";
import { human, num, portfolioName } from "../lib/format";
import SafeText from "../components/SafeText";
import { DisclosureBox } from "../components/DisclosureAndSources";
import { ErrorNote } from "../components/Notice";

// A.2: ONE chatbot conversation establishes the risk profile. It starts from the
// profile already stored (A.1), asks only for what's missing, asks clarifying
// questions when answers conflict, and only then reveals a category.
export default function ProfilingPage() {
  const { profiling, setProfiling } = useAppData();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [profiling.turns.length]);

  const add = (role, content) => ({ role, content });

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.profilingStart();
      setProfiling({
        started: true,
        turns: [add("assistant", r.reply)],
        // A profile that is already complete scores on the opening turn, so the
        // result has to be surfaced here exactly as sendMessage does.
        result: r.complete ? r : null,
        last: r,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(message) {
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setProfiling((p) => ({ ...p, turns: [...p.turns, add("user", message)] }));
    try {
      const r = await api.profilingMessage(message);
      setProfiling((p) => ({
        ...p,
        turns: [...p.turns, add("assistant", r.reply)],
        last: r,
        result: r.complete ? r : null,
      }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function send(e) {
    e.preventDefault();
    const message = text.trim();
    setText("");
    sendMessage(message);
  }

  const { started, turns, result } = profiling;

  return (
    <div className="main">
      <div className="page-header">
        <h1>Risk conversation</h1>
        <p>One short conversation to work out your risk category — there's no separate questionnaire.</p>
      </div>

      <section className="RoboAdvisor">
        <div className="RoboAdvisor-body">
          {!started && (
            <>
              <p>
                I'll use the details already in your <Link to="/profile">profile</Link> and only ask about what's missing.
              </p>
              <button className="btn" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start the conversation"}</button>
            </>
          )}

          {started && (
            <div className="msg-list">
              {turns.map((t, i) => (
                <div key={i} className={`msg ${t.role}`}>
                  <div className="who">{t.role === "user" ? "You" : "Advisor assistant"}</div>
                  <SafeText text={t.content} />
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          <ErrorNote error={error} />

          {started && !result && last?.inconsistencies?.length > 0 && (
            <div className="callout warn">
              <strong>Before I can assign a category, I need to clear something up</strong>
              {last.inconsistencies.map((i) => <div key={i.code} style={{ marginTop: 4 }}>{i.question}</div>)}
            </div>
          )}

          {started && !result && (
            <form onSubmit={send} className="chat-input-row">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" maxLength={4000} disabled={busy} aria-label="Your answer" autoFocus />
              <button className="btn" type="submit" disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</button>
            </form>
          )}
        </div>
      </section>

      {result && (
        <section className="RoboAdvisor">
          <div className="RoboAdvisor-head"><h2>Your result</h2></div>
          <div className="stat-row">
            <div className="stat"><div className="stat-label">Risk category</div><div className="stat-value">{human(result.riskCategory)}</div></div>
            <div className="stat"><div className="stat-label">Risk score</div><div className="stat-value">{num(result.riskScore, 1)}</div></div>
            <div className="stat"><div className="stat-label">Eligible portfolios</div><div className="stat-value" style={{ fontSize: 15 }}>
              {result.eligiblePortfolios.map((c) => `${c} ${portfolioName(c)}`).join(", ")}</div></div>
          </div>
          <div className="RoboAdvisor-body">
            <p>
              Next: review your options and invest in <Link to="/portfolio">Portfolio & trading</Link>.
              {" "}Want to run it again? <button className="linklike" onClick={start}>Start over</button>
            </p>
            <DisclosureBox />
          </div>
        </section>
      )}
    </div>
  );
}
