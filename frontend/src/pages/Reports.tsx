import { useState, useEffect, useCallback } from "react";
import RunSelector from "../components/RunSelector";
import { api } from "../lib/api";
import { EXC_LABELS, EXC_BADGE_CLASSES, EXC_HEX_COLORS } from "../lib/constants";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryData {
  run_id: number;
  status: string;
  match_rate: number;
  total_transactions: number;
  matched_count: number;
  unmatched_count: number;
  exception_count: number;
  exception_counts: Record<string, number>;
  settlement_totals: {
    total_payment_amount: number;
    total_settled_amount: number;
    total_discrepancy: number;
    amount_mismatches_total?: number;
    unsettled_value_total?: number;
    duplicate_charges_total?: number;
    currency: string;
  };
  run_name: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const API_BASE = "http://127.0.0.1:8001/api/v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (ds: string | null) => {
  if (!ds) return "—";
  return new Date(ds).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [runId, setRunId] = useState<string>("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select first run
  useEffect(() => {
    api.reconcile.listRuns().then((data) => {
      if (data.runs.length > 0 && !runId) {
        setRunId(data.runs[0].run_id.toString());
      }
    }).catch(console.error);
  }, []);

  // Fetch summary when run changes
  const fetchSummary = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reconcile/summary/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SummaryData = await res.json();
      setSummary(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (runId) fetchSummary(runId);
  }, [runId, fetchSummary]);

  const handleDownload = async () => {
    if (!runId) return;
    setDownloading(true);
    try {
      await api.reconcile.downloadReport(Number(runId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const st = summary?.settlement_totals;

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Reports
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Download detailed Excel reconciliation reports.
          </p>
        </div>
        <RunSelector value={runId} onChange={setRunId} />
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Report Preview + Download ────────────────────────────────────── */}
      {!loading && summary && (
        <div className="space-y-6">
          {/* Download Card */}
          <div className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-200" />
                  Excel Reconciliation Report
                </h2>
                <p className="text-sm text-indigo-100 mt-1">
                  {summary.run_name || `Run #${summary.run_id}`} — 3 sheets: Summary, Exceptions, and Raw Data
                </p>
              </div>
              <button
                id="download-report-btn"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-xl shadow hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-wait shrink-0"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-indigo-600" />
                    Download .xlsx
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Report Preview Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

            {/* Run Info */}
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Run Info
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{summary.run_name || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                  <dd>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {summary.status.toUpperCase()}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Started</dt>
                  <dd className="font-medium text-gray-900 dark:text-white text-xs">{fmtDate(summary.started_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
                  <dd className="font-medium text-gray-900 dark:text-white text-xs">{fmtDate(summary.completed_at)}</dd>
                </div>
              </dl>
            </div>

            {/* Match Stats */}
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Match Statistics
              </h3>
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" className="dark:stroke-gray-700" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#6366f1" strokeWidth="3"
                      strokeDasharray={`${summary.match_rate * 0.9742} 97.42`}
                      strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {summary.match_rate.toFixed(1)}%
                  </span>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-gray-500 dark:text-gray-400">Total</dt>
                    <dd className="font-semibold text-gray-900 dark:text-white tabular-nums">{summary.total_transactions}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-emerald-500">Matched</dt>
                    <dd className="font-semibold text-gray-900 dark:text-white tabular-nums">{summary.matched_count}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-red-500">Unmatched</dt>
                    <dd className="font-semibold text-gray-900 dark:text-white tabular-nums">{summary.unmatched_count}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Financial Summary
              </h3>
              {st && (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Total Billed</dt>
                    <dd className="font-medium text-gray-900 dark:text-white tabular-nums">{fmt(st.total_payment_amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Total Settled</dt>
                    <dd className="font-medium text-gray-900 dark:text-white tabular-nums">{fmt(st.total_settled_amount)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
                    <dt className="text-red-500 font-medium">Gross Discrepancy</dt>
                    <dd className="font-semibold text-red-600 dark:text-red-400 tabular-nums">{fmt(st.total_discrepancy)}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>

          {/* Discrepancy Breakdown */}
          {st && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Discrepancy Breakdown
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Amount Mismatches", value: st.amount_mismatches_total ?? 0, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
                  { label: "Unsettled Value", value: st.unsettled_value_total ?? 0, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
                  { label: "Duplicate Charges", value: st.duplicate_charges_total ?? 0, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                    <p className={`text-lg font-bold ${color} tabular-nums`}>{fmt(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exception Breakdown with Unified Colors */}
          {Object.keys(summary.exception_counts).length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Exception Breakdown ({summary.exception_count} total)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(summary.exception_counts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between bg-gray-50/70 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700/50 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: EXC_HEX_COLORS[type] ?? "#6366F1" }}
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {EXC_LABELS[type] || type}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white bg-gray-200 dark:bg-gray-600 rounded-full px-2.5 py-0.5 tabular-nums">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Sheet Preview Note */}
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              📊 What's in the Excel report?
            </h3>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              {[
                {
                  sheet: "Summary",
                  color: "border-l-indigo-500",
                  desc: "Match rate, record counts, settlement totals, and 3-way discrepancy breakdown.",
                },
                {
                  sheet: "Exceptions",
                  color: "border-l-amber-500",
                  desc: "Full exception list with type, severity, amounts, dates, and AI explanations.",
                },
                {
                  sheet: "Raw Reconciliation",
                  color: "border-l-emerald-500",
                  desc: "Transaction-level data with match status per row and financial details.",
                },
              ].map(({ sheet, color, desc }) => (
                <div key={sheet} className={`border-l-4 ${color} pl-3 py-0.5`}>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{sheet}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !summary && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select a run to preview and download the report.</p>
        </div>
      )}
    </div>
  );
}
