import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, MOCK_MODE } from "../api";
import { useAuth } from "../context/AuthContext";
import { useSession } from "../context/SessionContext";

// Seeded by the backend's `make reset` (development only).
const SEEDED = [
  ["Admin / officer", "admin@roboadvisor.local"],
  ["Client 1 — zero loss tolerance", "c001@roboadvisor.local"],
  ["Client 2 — balanced", "c002@roboadvisor.local"],
  ["Client 3 — aggressive, CKA passed", "c003@roboadvisor.local"],
  ["Client 4 — inconsistent profile", "c004@roboadvisor.local"],
  ["Client 5 — growth, no CKA", "c005@roboadvisor.local"],
];

export default function Login() {
  const { user, login, error, busy } = useAuth();
  const { sessionDate, chooseDate, range, seedRange } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [dateBusy, setDateBusy] = useState(false);

  const needsDate = user?.role === "client" && !sessionDate;

  // Prefill with the date chosen last time, and -- more importantly -- learn the
  // selectable range. This call used to 422 when no date was set, so the catch
  // swallowed it and the input rendered with no min/max at all.
  useEffect(() => {
    if (!needsDate) return;
    api
      .getSessionDate()
      .then((r) => {
        if (r?.sessionDate) setDate(r.sessionDate);
        seedRange(r ?? {});
      })
      .catch(() => {});
  }, [needsDate]);

  if (user && !needsDate) return <Navigate to={user.role === "officer" ? "/officer" : "/dashboard"} replace />;

  async function handleLogin(e) {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) setPassword("");
  }

  async function handleDate(e) {
    e.preventDefault();
    setDateError("");
    setDateBusy(true);
    try {
      await chooseDate(date);
      navigate("/dashboard");
    } catch (err) {
      setDateError(err.message);
    } finally {
      setDateBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="brand-mark">RoboAdvisor</div>
        <p className="tagline">Explainability & human oversight console</p>
        {MOCK_MODE && (
          <div className="callout warn" style={{ marginTop: 16 }}>
            <strong>Mock mode</strong> — no backend is used. Data is in memory and resets on refresh. Session dates: 2026-01-02 to 2026-06-30.
          </div>
        )}

        {!needsDate && (
          <form onSubmit={handleLogin} style={{ marginTop: 32 }}>
            {error && <div className="error-text" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <button className="btn" type="submit" style={{ width: "100%" }} disabled={busy || !email || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {needsDate && (
          <form onSubmit={handleDate} style={{ marginTop: 32 }}>
            <p style={{ color: "var(--ink-soft)" }}>
              Welcome, {user.displayName}. Choose the <strong>session date</strong> for this simulation. All prices and
              valuations use the price file for this date.
            </p>
            {dateError && <div className="error-text" role="alert">{dateError}</div>}
            <div className="field">
              <label htmlFor="sdate">Session date</label>
              <input id="sdate" type="date" value={date} min={range.from || undefined} max={range.to || undefined} onChange={(e) => setDate(e.target.value)} autoFocus />
            </div>
            <button className="btn" type="submit" style={{ width: "100%" }} disabled={dateBusy || !date}>
              {dateBusy ? "Loading prices…" : "Continue"}
            </button>
          </form>
        )}

        {!user && (
          <div className="demo-creds">
            Seeded development logins (password <code>password123</code>) — remove before any real deployment
            <table>
              <tbody>
                {SEEDED.map(([label, mail]) => (
                  <tr key={mail}>
                    <td>{label}</td>
                    <td>
                      <button type="button" className="linklike" onClick={() => setEmail(mail)}>{mail}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
