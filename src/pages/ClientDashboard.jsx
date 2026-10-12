import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useSession } from "../context/SessionContext";
import { useAppData } from "../context/AppDataContext";
import { useLoad } from "../hooks";
import { human, money, num, portfolioName } from "../lib/format";
import AnswerCard from "../components/AnswerCard";
import { DisclosureBox } from "../components/DisclosureAndSources";
import { ErrorNote, Loading } from "../components/Notice";

const QUICK = [
  "Why was I assigned this risk category?",
  "What is rebalancing and why does it matter?",
  "What does my portfolio hold?",
];

export default function ClientDashboard() {
  const { user } = useAuth();
  const { sessionDate } = useSession();
  const { turns, ask, pending } = useAppData();
  const [question, setQuestion] = useState("");

  const holdings = useLoad(() => api.getHoldings(), [sessionDate]);
  const perf = useLoad(() => api.getPerformance(90), [sessionDate]);
  const elig = useLoad(() => api.getEligibility(), []);

  const h = holdings.data;
  const e = elig.data;
  const invested = h ? h.totalValue - h.cash : 0;

  async function submit(ev) {
    ev.preventDefault();
    const q = question;
    setQuestion("");
    await ask(q);
  }

  return (
    <div className="main">
      <div className="page-header">
        <h1>Welcome back, {user.displayName}</h1>
        <p>Your investment dashboard · session date {sessionDate}</p>
      </div>

      {/* ------------------------------------------------ C.1 holdings */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>Holdings & performance</h2></div>
        {holdings.loading && <div className="RoboAdvisor-body"><Loading what="Loading holdings" /></div>}
        {holdings.error && <div className="RoboAdvisor-body"><ErrorNote error={holdings.error} onRetry={holdings.reload} /></div>}
        {h && (
          <>
            <div className="stat-row">
              <div className="stat"><div className="stat-label">Cash</div><div className="stat-value">{money(h.cash)}</div></div>
              <div className="stat"><div className="stat-label">Invested</div><div className="stat-value">{money(invested)}</div></div>
              <div className="stat"><div className="stat-label">Total value</div><div className="stat-value">{money(h.totalValue)}</div></div>
            </div>
            <div className="RoboAdvisor-body">
              {!h.portfolioCode && (
                <div className="callout">
                  You haven't invested yet. Complete your <Link to="/profiling">risk conversation</Link>, then invest from{" "}
                  <Link to="/portfolio">Portfolio & trading</Link>.
                </div>
              )}
              <div className="RoboAdvisor-columns">
                <div>
                  <h3 style={{ marginBottom: 12 }}>
                    Current holdings{h.portfolioName ? ` — ${h.portfolioCode} ${h.portfolioName}` : ""}
                  </h3>
                  <table className="RoboAdvisor-table">
                    <thead>
                      <tr>
                        <th>Asset class</th><th className="num">Units</th><th className="num">Price</th>
                        <th className="num">Value</th><th className="num">Target %</th><th className="num">Actual %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.byAssetClass.map((r) => (
                        <tr key={r.asset}>
                          <td>{human(r.asset)}</td>
                          <td className="num">{num(r.units, 4)}</td>
                          <td className="num">{num(r.price, 4)}</td>
                          <td className="num">{money(r.value)}</td>
                          <td className="num">{num(r.targetWeight, 2)}</td>
                          <td className="num">{num(r.actualWeight, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 style={{ marginBottom: 12 }}>Performance (90 days to {sessionDate})</h3>
                  {perf.error && <ErrorNote error={perf.error} onRetry={perf.reload} />}
                  {perf.data && (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={perf.data}>
                        <CartesianGrid stroke="var(--rule)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} interval={Math.max(0, Math.floor(perf.data.length / 6))} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} width={64} domain={["auto", "auto"]} />
                        <Tooltip formatter={(v) => money(v)} contentStyle={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
                        <Line type="monotone" dataKey="value" stroke="var(--status-good)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------- A.4 / C.3 risk profile */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>Your risk profile & recommendation</h2></div>
        <div className="RoboAdvisor-body">
          {elig.loading && <Loading what="Loading your risk profile" />}
          {elig.error && <ErrorNote error={elig.error} onRetry={elig.reload} />}
          {e && !e.riskCategory && (
            <div className="callout">
              You don't have a risk category yet. Start the <Link to="/profiling">risk conversation</Link> — it uses the
              details already in your <Link to="/profile">profile</Link>.
            </div>
          )}
          {e?.riskCategory && (
            <>
              <div className="stat-row" style={{ borderBottom: "none", marginBottom: 20 }}>
                <div className="stat"><div className="stat-label">Risk category</div><div className="stat-value" style={{ fontSize: 18 }}>{human(e.riskCategory)}</div></div>
                <div className="stat"><div className="stat-label">Risk score</div><div className="stat-value" style={{ fontSize: 18 }}>{num(e.riskScore, 1)}</div></div>
                <div className="stat">
                  <div className="stat-label">Highest portfolio available</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>{e.maxPortfolio} · {portfolioName(e.maxPortfolio)}</div>
                </div>
              </div>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
                Eligible portfolios: {e.eligiblePortfolios.map((c) => `${c} ${portfolioName(c)}`).join(" · ") || "none"} ·
                Knowledge check {e.ckaPassed ? "passed" : "not yet passed"} · Satellite exposure cap {num(e.satelliteCapPct, 0)}%
              </p>
              {e.firedRules.length > 0 && (
                <div className="callout">
                  <strong>Policy rules limiting your options</strong>
                  {e.firedRules.map((r) => <div key={r.code} style={{ marginTop: 4 }}>{r.explanation}</div>)}
                </div>
              )}
              <p style={{ marginTop: 12 }}>
                Want to know why? Ask below, or manage your holdings in <Link to="/portfolio">Portfolio & trading</Link>.
              </p>
            </>
          )}
          <div style={{ marginTop: 20 }}><DisclosureBox /></div>
        </div>
      </section>

      {/* ------------------------------------------------ C.2 / C.4 chat */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>Ask about your portfolio or risk category</h2></div>
        <div className="RoboAdvisor-body">
          <p style={{ color: "var(--ink-soft)" }}>
            Answers are grounded in our policy documents, show a confidence level, and list the sources used. If the assistant
            isn't sure, it will say so instead of guessing.
          </p>

          {turns.map((turn, i) => (
            <div className="chat-turn" key={i}>
              <div className="chat-question">You: {turn.question}</div>
              <AnswerCard turn={turn} onPick={ask} disabled={pending} />
            </div>
          ))}
          {pending && <Loading what="The assistant is thinking" />}

          <div className="chip-row">
            {QUICK.map((q) => (
              <button key={q} className="chip" disabled={pending} onClick={() => ask(q)}>{q}</button>
            ))}
          </div>

          <form onSubmit={submit} className="chat-input-row">
            <input
              value={question}
              onChange={(ev) => setQuestion(ev.target.value)}
              placeholder="e.g. Why was I assigned this risk category?"
              maxLength={4000}
              aria-label="Your question"
            />
            <button className="btn" type="submit" disabled={pending || !question.trim()}>Ask</button>
          </form>
        </div>
      </section>
    </div>
  );
}
