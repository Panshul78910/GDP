import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../context/SessionContext";
import { useAppData } from "../context/AppDataContext";
import { useLoad } from "../hooks";
import { PORTFOLIOS, fmtTime, human, money, num, portfolioName } from "../lib/format";
import AnswerCard from "../components/AnswerCard";
import { StatusPill } from "../components/ConfidenceBadge";
import { DisclosureBox } from "../components/DisclosureAndSources";
import { ErrorNote, Loading } from "../components/Notice";

// ------------------------------------------------------------------ CKA quiz
// A.3(iii): a short knowledge check gates higher-risk and satellite portfolios.
const CKA = [
  { q: "Which is generally expected to move up and down the most over a few months?", o: ["A cash fund", "A short-term bond fund", "A global equity index fund"], a: 2 },
  { q: "What does rebalancing do when a portfolio has drifted from its targets?", o: ["Sells holdings that have grown above target and buys those that fell below", "Moves everything into cash", "Buys more of whatever went up the most"], a: 0 },
  { q: "The main purpose of diversification is to…", o: ["Guarantee a minimum return", "Reduce the damage if any single holding does badly", "Remove all investment risk"], a: 1 },
  { q: "Past performance of an investment is…", o: ["A reliable guide to future returns", "A guarantee of future returns", "Not a guarantee of future results"], a: 2 },
  { q: "A satellite (thematic or sector) ETF usually carries…", o: ["Higher concentration risk than a broad index fund", "Lower risk than cash", "No market risk"], a: 0 },
];
const PASS_MARK = 4;

function CkaCheck({ onPassed }) {
  const [picked, setPicked] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const score = CKA.filter((q, i) => picked[i] === q.a).length;
    setError(null);
    if (score < PASS_MARK) return setResult({ passed: false, score });
    setBusy(true);
    try {
      await api.passCka();
      setResult({ passed: true, score });
      onPassed();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>Knowledge check</h3>
      <p style={{ color: "var(--ink-soft)" }}>
        Answer at least {PASS_MARK} of {CKA.length} correctly to unlock higher-risk and satellite portfolios.
      </p>
      {CKA.map((item, i) => (
        <fieldset key={i} className="quiz-q">
          <legend>{i + 1}. {item.q}</legend>
          {item.o.map((opt, j) => (
            <label key={j} className="quiz-opt">
              <input type="radio" name={`cka${i}`} checked={picked[i] === j} onChange={() => setPicked((p) => ({ ...p, [i]: j }))} /> {opt}
            </label>
          ))}
        </fieldset>
      ))}
      <ErrorNote error={error} />
      {result && !result.passed && <div className="callout warn">You got {result.score} of {CKA.length}. Have another look and try again.</div>}
      {result?.passed && <div className="callout good">Passed ({result.score}/{CKA.length}). Your eligible portfolios have been updated.</div>}
      <button className="btn" onClick={submit} disabled={busy || Object.keys(picked).length < CKA.length}>
        {busy ? "Submitting…" : "Submit answers"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function PortfolioPage() {
  const { sessionDate } = useSession();
  const { ask, pending } = useAppData();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const holdings = useLoad(() => api.getHoldings(), [sessionDate, tick]);
  const elig = useLoad(() => api.getEligibility(), [tick]);
  const events = useLoad(() => api.getEvents(), [tick]);
  const audit = useLoad(() => api.myAudit(50), [tick]);

  const [investing, setInvesting] = useState(null);
  const [investResult, setInvestResult] = useState(null);
  const [investError, setInvestError] = useState(null);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [rbError, setRbError] = useState(null);
  const [rbResult, setRbResult] = useState(null);
  const [rbBusy, setRbBusy] = useState(false);
  const [explained, setExplained] = useState(null);

  const h = holdings.data;
  const e = elig.data;
  const eligible = new Set(e?.eligiblePortfolios || []);

  async function invest(code) {
    setInvesting(code);
    setInvestError(null);
    setInvestResult(null);
    try {
      const r = await api.invest(code);
      setInvestResult({ ...r, code });
      refresh();
    } catch (err) {
      setInvestError(err);
      refresh(); // a refusal still creates an audit + escalation record
    } finally {
      setInvesting(null);
    }
  }

  async function loadPreview() {
    setPreviewing(true);
    setRbError(null);
    setRbResult(null);
    setExplained(null);
    try {
      setPreview(await api.rebalancePreview());
    } catch (err) {
      setPreview(null);
      setRbError(err);
    } finally {
      setPreviewing(false);
    }
  }

  async function doRebalance() {
    setRbBusy(true);
    setRbError(null);
    try {
      const r = await api.rebalance();
      setRbResult({ kind: "rebalance", ...r });
      setPreview(null);
      refresh();
    } catch (err) {
      setRbError(err);
    } finally {
      setRbBusy(false);
    }
  }

  async function doRevert() {
    if (!window.confirm("Revert your most recent rebalance and restore the holdings you had just before it?")) return;
    setRbBusy(true);
    setRbError(null);
    try {
      const r = await api.revertRebalance();
      setRbResult({ kind: "revert", ...r });
      setPreview(null);
      refresh();
    } catch (err) {
      setRbError(err);
    } finally {
      setRbBusy(false);
    }
  }

  async function explainRebalance() {
    const turn = await ask("Explain the rebalance I just performed and why those trades restore my target allocation.");
    setExplained(turn);
  }

  return (
    <div className="main">
      <div className="page-header">
        <h1>Portfolio & trading</h1>
        <p>Session date {sessionDate}. All trades are simulated at that date's published prices.</p>
      </div>

      {/* --------------------------------------------- A.3 eligibility */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>What you're eligible for</h2></div>
        <div className="RoboAdvisor-body">
          {elig.loading && <Loading what="Checking eligibility" />}
          <ErrorNote error={elig.error} onRetry={elig.reload} />
          {e && !e.riskCategory && (
            <div className="callout">Complete your <Link to="/profiling">risk conversation</Link> first — your category decides which portfolios you can use.</div>
          )}
          {e?.riskCategory && (
            <>
              <p>
                Risk category <strong>{human(e.riskCategory)}</strong> · highest portfolio <strong>{e.maxPortfolio} {portfolioName(e.maxPortfolio)}</strong> ·
                knowledge check <strong>{e.ckaPassed ? "passed" : "not passed"}</strong> · policy {e.policyVersion}
              </p>
              {e.firedRules.length > 0 && (
                <div className="callout">
                  <strong>Rules applied to you</strong>
                  {e.firedRules.map((r) => <div key={r.code} style={{ marginTop: 4 }}>{r.explanation}</div>)}
                </div>
              )}
              {!e.ckaPassed && <CkaCheck onPassed={refresh} />}
            </>
          )}
        </div>
      </section>

      {/* --------------------------------------------- A.5 invest */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>Invest</h2></div>
        <div className="RoboAdvisor-body">
          {holdings.loading && <Loading what="Loading balance" />}
          <ErrorNote error={holdings.error} onRetry={holdings.reload} />
          {h && (
            <p>
              Cash available: <strong>{money(h.cash)}</strong>
              {h.portfolioCode ? <> · currently holding <strong>{h.portfolioCode} {h.portfolioName}</strong></> : " · nothing invested yet"}
            </p>
          )}
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
            Portfolios above your category are shown so you can see why they're closed. If you request one, it will be refused
            with an explanation and sent to an officer.
          </p>

          <div className="p-grid">
            {PORTFOLIOS.map((p) => {
              const ok = eligible.has(p.code);
              return (
                <div key={p.code} className={`p-card ${ok ? "" : "closed"}`}>
                  <div className="p-code">{p.code}</div>
                  <div className="p-name">{p.name}</div>
                  <span className={`pill ${ok ? "good" : "neutral"}`}>{ok ? "Eligible" : "Not eligible"}</span>
                  <button className={`btn ${ok ? "" : "secondary"}`} style={{ marginTop: 10, width: "100%" }}
                    disabled={investing !== null || !e?.riskCategory} onClick={() => invest(p.code)}>
                    {investing === p.code ? "Placing order…" : ok ? "Invest cash here" : "Request anyway"}
                  </button>
                </div>
              );
            })}
          </div>

          {investError && (
            <div className={`callout ${investError.code === "suitability_refused" ? "warn" : "bad"}`} role="alert">
              <strong>{investError.code === "suitability_refused" ? "Request refused" : "Order not placed"}</strong>
              <div>{investError.message}</div>
              {investError.code === "suitability_refused" && (
                <div className="hint">This request has been recorded and sent to an officer for review.</div>
              )}
              {investError.correlationId && <div className="hint">Reference: {investError.correlationId}</div>}
            </div>
          )}
          {investResult && (
            <div className="callout good">
              Order executed in <strong>{investResult.code} {portfolioName(investResult.code)}</strong> at {investResult.sessionDate} prices.
              {" "}{investResult.trades?.length ?? 0} trades · cash left {money(investResult.cash)} · decision {investResult.decisionId}
            </div>
          )}

          {h && h.byInstrument?.length > 0 && (
            <>
              <h3 style={{ margin: "20px 0 8px" }}>Positions</h3>
              <div className="tbl-scroll">
                <table className="RoboAdvisor-table">
                  <thead><tr><th>Instrument</th><th className="num">Units</th><th className="num">Price</th><th className="num">Value</th><th className="num">Target %</th><th className="num">Actual %</th></tr></thead>
                  <tbody>
                    {h.byInstrument.map((r) => (
                      <tr key={r.instrumentId}>
                        <td>{r.symbol} — {r.name}{r.isSatellite ? " (satellite)" : ""}</td>
                        <td className="num">{num(r.units, 6)}</td><td className="num">{num(r.price, 4)}</td>
                        <td className="num">{money(r.value)}</td><td className="num">{num(r.targetWeight, 2)}</td><td className="num">{num(r.actualWeight, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div style={{ marginTop: 20 }}><DisclosureBox /></div>
        </div>
      </section>

      {/* --------------------------------------------- A.6 / A.7 rebalance */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>Rebalance</h2></div>
        <div className="RoboAdvisor-body">
          <p style={{ color: "var(--ink-soft)" }}>
            Preview the trades needed to bring your portfolio back to its target weights at the {sessionDate} prices. Nothing
            happens until you confirm.
          </p>
          <button className="btn" onClick={loadPreview} disabled={previewing || rbBusy}>{previewing ? "Calculating…" : "Preview rebalance"}</button>{" "}
          <button className="btn secondary" onClick={doRevert} disabled={rbBusy || previewing}>Revert last rebalance</button>
          <ErrorNote error={rbError} />

          {preview && (
            <div style={{ marginTop: 20 }}>
              <p><strong>{preview.portfolioCode} {preview.portfolioName}</strong> · total value {money(preview.totalValue)} · cash {money(preview.cash)}</p>
              <div className="callout">{preview.explanation}</div>
              <h3 style={{ margin: "16px 0 8px" }}>Drift from target</h3>
              <div className="tbl-scroll">
                <table className="RoboAdvisor-table">
                  <thead><tr><th>Instrument</th><th className="num">Target %</th><th className="num">Actual %</th><th className="num">Drift (pts)</th></tr></thead>
                  <tbody>
                    {preview.drift.map((d) => (
                      <tr key={d.symbol}><td>{d.symbol}</td><td className="num">{num(d.targetWeight, 2)}</td><td className="num">{num(d.actualWeight, 2)}</td><td className="num">{num(d.driftPct, 2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ margin: "16px 0 8px" }}>Proposed trades</h3>
              {preview.trades.length === 0 ? (
                <div className="hint">No trades needed — you're already on target.</div>
              ) : (
                <div className="tbl-scroll">
                  <table className="RoboAdvisor-table">
                    <thead><tr><th>Side</th><th>Instrument</th><th className="num">Units</th><th className="num">Price</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {preview.trades.map((t, i) => (
                        <tr key={i}><td>{t.side}</td><td>{t.symbol} — {t.name}</td><td className="num">{num(t.units, 6)}</td><td className="num">{num(t.price, 4)}</td><td className="num">{money(t.grossAmount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="btn" style={{ marginTop: 14 }} onClick={doRebalance} disabled={rbBusy || preview.trades.length === 0}>
                {rbBusy ? "Executing…" : "Confirm and rebalance"}
              </button>
            </div>
          )}

          {rbResult && (
            <div style={{ marginTop: 20 }}>
              <div className="callout good">
                {rbResult.kind === "rebalance"
                  ? `Rebalance executed at ${rbResult.sessionDate} prices (${rbResult.trades?.length ?? 0} trades). Decision ${rbResult.decisionId}.`
                  : `Last rebalance reverted — holdings restored to how they were just before it. Decision ${rbResult.decisionId}.`}
              </div>
              {rbResult.kind === "rebalance" && (
                <>
                  <button className="btn secondary" onClick={explainRebalance} disabled={pending}>
                    {pending ? "Asking…" : "Explain this rebalance to me"}
                  </button>
                  {explained && <div style={{ marginTop: 12 }}><AnswerCard turn={explained} /></div>}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* --------------------------------------------- audit trail */}
      <section className="RoboAdvisor">
        <div className="RoboAdvisor-head"><h2>My activity & decision history</h2></div>
        <div className="RoboAdvisor-body">
          <h3 style={{ marginBottom: 8 }}>Portfolio events</h3>
          {events.data && (
            <div className="tbl-scroll">
              <table className="RoboAdvisor-table">
                <thead><tr><th className="num">#</th><th>Event</th><th>Session date</th><th>Decision</th><th>Recorded</th></tr></thead>
                <tbody>
                  {events.data.length === 0 && <tr><td colSpan={5} className="hint">No portfolio events yet.</td></tr>}
                  {events.data.map((ev) => (
                    <tr key={ev.eventId}>
                      <td className="num">{ev.seq}</td><td>{human(ev.eventType)}{ev.revertsEventId ? " (reverts an earlier event)" : ""}</td>
                      <td>{ev.sessionDate}</td><td>{ev.decisionId ? "linked" : "—"}</td><td>{fmtTime(ev.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 style={{ margin: "20px 0 8px" }}>Decisions about you</h3>
          <ErrorNote error={audit.error} onRetry={audit.reload} />
          {audit.data && audit.data.length === 0 && <div className="hint">Nothing recorded yet.</div>}
          {audit.data?.map((d) => (
            <details key={d.decisionId} className="source-item">
              <summary style={{ cursor: "pointer" }}>
                <strong>{d.decisionId}</strong> · {human(d.decisionType)} · <StatusPill status={d.status} /> · {fmtTime(d.timestamp)}
              </summary>
              <div style={{ marginTop: 8 }}>
                <div><strong>Input:</strong> {d.input || "—"}</div>
                <div style={{ marginTop: 6 }}><strong>Outcome:</strong> {d.output || "—"}</div>
                {d.humanOverride && <div style={{ marginTop: 6 }}><strong>Reviewed by an officer:</strong> {human(d.humanOverride.action)} — {d.humanOverride.finalOutput}</div>}
                <div className="hint">Policy {d.policyVersion || "—"} · session date {d.sessionDate || "—"}</div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
