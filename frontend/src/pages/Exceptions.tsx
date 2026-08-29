import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import RunSelector from "../components/RunSelector";
import {
  AlertTriangle, X, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, SlidersHorizontal, Calendar, Hash, IndianRupee,
  Receipt, RefreshCw, ExternalLink, Sparkles, Loader2,
  CheckCircle2, SearchX, Inbox,
} from "lucide-react";
import { api } from "../lib/api";
import {
  ALL_EXCEPTION_TYPES,
  EXC_LABELS,
  EXC_BADGE_CLASSES,
  SEVERITY_ORDER,
  SEVERITY_STYLES,
} from "../lib/constants";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Exception {
  id: number;
  type: string;
  payment_id: string | null;
  order_id: string | null;
  exception_date: string | null;
  severity: string;
  description: string | null;
  internal_amount: number | null;
  bank_amount: number | null;
  discrepancy_amount: number | null;
  reconciliation_run_id?: number;
  ai_explanation?: string | null;
  ai_root_cause?: string | null;
  ai_suggested_action?: string | null;
}

interface ExceptionsResponse {
  run_id: number;
  total: number;
  page: number;
  page_size: number;
  exceptions: Exception[];
}

type SortKey = "discrepancy_amount" | "severity" | "type";
type SortDir = "asc" | "desc";

// ─── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://127.0.0.1:8001/api/v1";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n != null ? `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}` : "—";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const mono = (s: string | null | undefined, fallback = "—") =>
  s ?? fallback;

// ─── Severity Badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const sevKey = severity?.toLowerCase() ?? "low";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[sevKey] ?? SEVERITY_STYLES.low}`}>
      {severity}
    </span>
  );
}

// ─── Type Badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${EXC_BADGE_CLASSES[type] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600"}`}>
      {EXC_LABELS[type] ?? type}
    </span>
  );
}

// ─── Sort Icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-gray-300 dark:text-gray-600" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-indigo-500" />
    : <ChevronDown className="w-3 h-3 text-indigo-500" />;
}

// ─── Detail Field ──────────────────────────────────────────────────────────────

function DetailField({ label, value, mono: isMono, tabular }: { label: string; value: string; mono?: boolean; tabular?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 dark:text-gray-100 break-all ${isMono ? "font-mono" : ""} ${tabular ? "tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}

// ─── Side Panel ────────────────────────────────────────────────────────────────

function SidePanel({ exc, runId, onClose }: { exc: Exception; runId?: number; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [aiAnalysis, setAiAnalysis] = useState<{ explanation?: string; root_cause?: string; suggested_action?: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  useEffect(() => {
    if (exc.ai_explanation) {
      setAiAnalysis({
        explanation: exc.ai_explanation,
        root_cause: exc.ai_root_cause ?? undefined,
        suggested_action: exc.ai_suggested_action ?? undefined,
      });
      setAiLoading(false);
      return;
    }

    const effectiveRunId = exc.reconciliation_run_id || runId;
    if (!effectiveRunId) {
      setAiLoading(false);
      return;
    }

    let active = true;
    setAiLoading(true);
    setAiAnalysis(null);

    api.reconcile.getAiAnalysis(effectiveRunId)
      .then((items) => {
        if (!active) return;
        const match = items.find((it) => it.id === exc.id);
        if (match) {
          setAiAnalysis({
            explanation: match.explanation,
            root_cause: match.root_cause,
            suggested_action: match.suggested_action,
          });
        }
      })
      .catch((err) => console.warn("AI analysis fetch error:", err))
      .finally(() => {
        if (active) setAiLoading(false);
      });

    return () => { active = false; };
  }, [exc, runId]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-30"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-40 flex flex-col border-l border-gray-100 dark:border-gray-800"
        style={{ animation: "slideIn 0.2s ease" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TypeBadge type={exc.type} />
              <SeverityBadge severity={exc.severity} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1 truncate">{exc.payment_id}</p>
          </div>
          <button
            id="close-side-panel"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Alert box */}
          <div className={`rounded-xl p-4 border ${exc.severity === "critical" || exc.severity === "high" ? "bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900" : "bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900"}`}>
            <div className="flex gap-2">
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${exc.severity === "critical" || exc.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
              <p className="text-sm text-gray-700 dark:text-gray-200">{exc.description}</p>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> AI Exception Analysis
            </h3>
            {aiLoading ? (
              <div className="flex items-center gap-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 py-3 px-3.5 bg-indigo-50/80 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>Analyzing exception with Gemini Flash…</span>
              </div>
            ) : aiAnalysis && aiAnalysis.explanation ? (
              <div className="space-y-2.5 text-xs text-gray-700 dark:text-gray-300">
                <p><span className="font-semibold text-indigo-700 dark:text-indigo-300">Explanation:</span> {aiAnalysis.explanation}</p>
                {aiAnalysis.root_cause && (
                  <p><span className="font-semibold text-amber-700 dark:text-amber-300">Root Cause:</span> {aiAnalysis.root_cause}</p>
                )}
                {aiAnalysis.suggested_action && (
                  <p><span className="font-semibold text-emerald-700 dark:text-emerald-300">Suggested Action:</span> {aiAnalysis.suggested_action}</p>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-1">
                No AI analysis available for this transaction.
              </div>
            )}
          </div>

          {/* Payment details */}
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              <Receipt className="w-3.5 h-3.5" /> Payment
            </h3>
            <div className="space-y-3">
              <DetailField label="Payment ID"    value={mono(exc.payment_id)} mono />
              <DetailField label="Order ID"      value={mono(exc.order_id)} mono />
              <DetailField label="Internal Amount" value={fmt(exc.internal_amount)} tabular />
              <DetailField label="Bank Amount"     value={fmt(exc.bank_amount)} tabular />
              <DetailField label="Exception Date"  value={fmtDate(exc.exception_date)} />
            </div>
          </div>

          {/* Financial impact */}
          {exc.discrepancy_amount != null && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 font-medium">Financial Impact</p>
              <p className="text-2xl font-bold text-red-500 tabular-nums">{fmt(exc.discrepancy_amount)}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Copy the payment ID to investigate in your payment gateway dashboard
          </p>
          <button
            id="copy-payment-id"
            onClick={() => navigator.clipboard.writeText(exc.payment_id ?? "")}
            className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Copy Payment ID
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Exceptions() {
  const [runId, setRunId] = useState<number>(
    () => Number(localStorage.getItem("lastRunId") || 1)
  );
  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter + sort state
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("severity");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");

  // Side panel
  const [selected, setSelected] = useState<Exception | null>(null);

  const fetchExceptions = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reconcile/exceptions/${id}?page_size=200`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      localStorage.setItem("lastRunId", String(id));
    } catch (err: any) {
      setError(err.message);
      setData(null);
      localStorage.removeItem("lastRunId");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExceptions(runId); }, [runId, fetchExceptions]);

  // Sort handler
  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("desc"); }
  }

  // Filtered + sorted exceptions
  const visible = (data?.exceptions ?? [])
    .filter(e => typeFilter === "ALL" || e.type === typeFilter)
    .filter(e =>
      !search ||
      (e.payment_id ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.order_id ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === "discrepancy_amount") {
        diff = (a.discrepancy_amount ?? 0) - (b.discrepancy_amount ?? 0);
      } else if (sortKey === "severity") {
        const sevA = (a.severity?.toLowerCase() ?? "low");
        const sevB = (b.severity?.toLowerCase() ?? "low");
        diff = (SEVERITY_ORDER[sevA] ?? 0) - (SEVERITY_ORDER[sevB] ?? 0);
      } else if (sortKey === "type") {
        diff = a.type.localeCompare(b.type);
      }
      return sortDir === "desc" ? -diff : diff;
    });

  // Severity summary counts
  const severitySummary = (data?.exceptions ?? []).reduce<Record<string, number>>((acc, e) => {
    const s = e.severity?.toLowerCase() ?? "low";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Exceptions</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Discrepancies and anomalies detected during reconciliation
          </p>
        </div>

        {/* Run Selector */}
        <div className="flex items-center gap-2">
          <RunSelector 
            value={String(runId)}
            onChange={(id: string) => setRunId(Number(id))} 
          />
          <button
            id="exc-refresh"
            onClick={() => fetchExceptions(runId)}
            disabled={loading}
            className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-400 hover:text-indigo-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Severity summary pills ── */}
      {data && (
        <div className="flex gap-2 flex-wrap mb-5">
          {(["critical", "high", "medium", "low"] as const)
            .filter(s => (severitySummary[s] ?? 0) > 0)
            .map(s => (
              <span key={s} className={`px-3 py-1 rounded-full border text-xs font-semibold ${SEVERITY_STYLES[s]}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}: {severitySummary[s]}
              </span>
            ))}
          <span className="px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 ml-auto">
            {visible.length} of {data.total} exceptions
          </span>
        </div>
      )}

      {/* ── Filters toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 shadow-sm">
        {/* Type filter */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          <select
            id="type-filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-2"
          >
            {ALL_EXCEPTION_TYPES.map(t => (
              <option key={t} value={t} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                {EXC_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            id="exception-search"
            type="text"
            placeholder="Search payment ID or order ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="animate-pulse space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Error banner ── */}
      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-5 flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Reconciliation run not found</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1 max-w-lg mb-3">
              We couldn't load the exceptions for run #{runId}. The ID might be invalid, or the data is missing. {error}
            </p>
            <Link 
              to="/upload" 
              className="inline-flex items-center text-xs font-semibold px-3.5 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 rounded-lg transition-colors shadow-sm"
            >
              Go to Upload
            </Link>
          </div>
        </div>
      )}

      {/* ── Table & Empty States ── */}
      {!loading && !error && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
          {/* Case A: Genuinely clean run with zero exceptions */}
          {data && data.total === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                No exceptions found — this run is fully reconciled!
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
                All transaction amounts matched settlement records and bank statements with zero discrepancies.
              </p>
            </div>
          ) : visible.length === 0 ? (
            /* Case B: Filter or search returned 0 results */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-3 text-gray-400 dark:text-gray-500">
                <SearchX className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                No exceptions match this filter
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4 max-w-xs">
                Try adjusting your type filter or clearing the search keyword.
              </p>
              <button
                onClick={() => { setTypeFilter("ALL"); setSearch(""); }}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                    {/* Type */}
                    <th className="text-left px-5 py-3.5">
                      <button
                        id="sort-type"
                        onClick={() => handleSort("type")}
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      >
                        Type <SortIcon col="type" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    {/* Payment ID */}
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      <div className="flex items-center gap-1"><Hash className="w-3 h-3" /> Payment ID</div>
                    </th>
                    {/* Amount Impact */}
                    <th className="text-left px-5 py-3.5">
                      <button
                        id="sort-amount"
                        onClick={() => handleSort("discrepancy_amount")}
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      >
                        <IndianRupee className="w-3 h-3" /> Impact
                        <SortIcon col="discrepancy_amount" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    {/* Severity */}
                    <th className="text-left px-5 py-3.5">
                      <button
                        id="sort-severity"
                        onClick={() => handleSort("severity")}
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      >
                        Severity <SortIcon col="severity" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    {/* Details */}
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Details
                    </th>
                    {/* Date */}
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/60">
                  {visible.map((exc, i) => (
                    <tr
                      key={exc.id ? `exc-${exc.id}` : `exc-${i}`}
                      id={`exc-row-${i}`}
                      onClick={() => setSelected(exc)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150 group"
                    >
                      <td className="px-5 py-3.5">
                        <TypeBadge type={exc.type} />
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                        {exc.payment_id ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                        {exc.discrepancy_amount != null ? (
                          <span className="text-red-500">{fmt(exc.discrepancy_amount)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <SeverityBadge severity={exc.severity} />
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 max-w-xs truncate text-xs">
                        {exc.description}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {fmtDate(exc.exception_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Side Panel ── */}
      {selected && (
        <SidePanel exc={selected} runId={runId} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
