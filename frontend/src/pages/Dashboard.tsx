import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import RunSelector from "../components/RunSelector";
import { api } from "../lib/api";
import { useCountUp } from "../hooks/useCountUp";
import {
  EXC_HEX_COLORS,
  EXC_SHORT_LABELS,
  EXC_LABELS,
} from "../lib/constants";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  RefreshCw,
  Clock,
  Activity,
} from "lucide-react";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "http://127.0.0.1:8001/api/v1";

// ─── Circular Progress ────────────────────────────────────────────────────────

function CircularProgress({ value }: { value: number }) {
  const animatedValue = useCountUp(value, 900, 1);
  const radius = 72;
  const stroke = 10;
  const norm = radius - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const offset = circ - (animatedValue / 100) * circ;

  const color =
    animatedValue >= 90 ? "#22C55E" : animatedValue >= 70 ? "#6366F1" : animatedValue >= 50 ? "#F59E0B" : "#EF4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
      <svg width={160} height={160} className="rotate-[-90deg]">
        {/* Track */}
        <circle
          cx={80}
          cy={80}
          r={norm}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-gray-100 dark:text-gray-700"
        />
        {/* Progress */}
        <circle
          cx={80}
          cy={80}
          r={norm}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.15s ease-out" }}
        />
      </svg>
      {/* Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {animatedValue.toFixed(1)}%
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-medium">Match Rate</span>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string; // tailwind text color class
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          {label}
        </span>
        <span className={`${accent}`}>{icon}</span>
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      <p className="text-indigo-500 font-bold">{payload[0].value} exception{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onTryRun }: { onTryRun: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
        <Activity className="w-8 h-8 text-indigo-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200">No reconciliation run found</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
        Upload your CSV files and run a reconciliation first, then return here to view the results.
      </p>
      <button
        onClick={onTryRun}
        className="mt-5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Try run 1
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [runId, setRunId] = useState<number>(
    () => Number(localStorage.getItem("lastRunId") || 1)
  );
  const [data, setData] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reconcile/summary/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const json: SummaryData = await res.json();
      setData(json);
      localStorage.setItem("lastRunId", String(id));
      
      try {
        const trendData = await api.summary.trends(30);
        setTrends(trendData.data_points || []);
      } catch (err) {
        console.error("Could not fetch trends:", err);
      }
    } catch (err: any) {
      setError(err.message);
      setData(null);
      localStorage.removeItem("lastRunId");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(runId); }, [runId, fetchSummary]);

  // Build animated numbers for top stat cards
  const animatedTotal = useCountUp(data?.total_transactions ?? 0, 800, 0);
  const animatedMatched = useCountUp(data?.matched_count ?? 0, 800, 0);
  const animatedExceptions = useCountUp(data?.exception_count ?? 0, 800, 0);
  const animatedSettled = useCountUp(data?.settlement_totals.total_settled_amount ?? 0, 900, 2);
  const animatedBilled = useCountUp(data?.settlement_totals.total_payment_amount ?? 0, 900, 2);

  // Financial summary animated numbers
  const animatedDiscrepancy = useCountUp(data?.settlement_totals.total_discrepancy ?? 0, 900, 2);
  const animatedAmtMismatch = useCountUp(data?.settlement_totals.amount_mismatches_total ?? 0, 900, 2);
  const animatedUnsettled = useCountUp(data?.settlement_totals.unsettled_value_total ?? 0, 900, 2);
  const animatedDuplicates = useCountUp(data?.settlement_totals.duplicate_charges_total ?? 0, 900, 2);

  // Build chart data
  const chartData =
    data?.exception_counts
      ? Object.entries(data.exception_counts).map(([type, count]) => ({
          name: EXC_SHORT_LABELS[type] ?? EXC_LABELS[type] ?? type,
          fullName: EXC_LABELS[type] ?? type,
          count,
          type,
        }))
      : [];

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

  const fmtCurrency = (n: number | null | undefined) =>
    `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)}`;

  const runDuration =
    data?.started_at && data?.completed_at
      ? `${((new Date(data.completed_at).getTime() - new Date(data.started_at).getTime()) / 1000).toFixed(1)}s`
      : null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {data?.run_name ? data.run_name : "Reconciliation overview and key metrics"}
          </p>
        </div>

        {/* Run Selector */}
        <div className="flex items-center gap-2">
          <RunSelector 
            value={String(runId)}
            onChange={(id: string) => setRunId(Number(id))} 
          />
          <button
            id="refresh-btn"
            onClick={() => fetchSummary(runId)}
            disabled={loading}
            className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-400 hover:text-indigo-500 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
            ))}
          </div>
          <div className="h-80 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
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
              We couldn't load the data for run #{runId}. The ID might be invalid, or the run was deleted. {error}
            </p>
            <Link 
              to="/upload" 
              className="inline-flex items-center text-xs font-semibold px-3.5 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60 rounded-lg transition-colors shadow-sm"
            >
              Start a New Run
            </Link>
          </div>
        </div>
      )}

      {/* ── No data ── */}
      {!loading && !error && !data && (
        <EmptyState onTryRun={() => setRunId(1)} />
      )}

      {/* ── Main content ── */}
      {!loading && data && (
        <div className="space-y-5">

          {/* Status badge + run meta */}
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              data.status === "completed"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : data.status === "failed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {data.status.toUpperCase()}
            </span>
            {runDuration && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <Clock className="w-3 h-3" /> {runDuration}
              </span>
            )}
            {data.started_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(data.started_at.endsWith("Z") || data.started_at.includes("+") ? data.started_at : `${data.started_at}Z`).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </div>

          {/* ── Top row: Match rate + stat cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Circular match rate */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm flex flex-col items-center justify-center py-8 gap-3">
              <CircularProgress value={data.match_rate} />
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                {data.matched_count} of {data.total_transactions} transactions matched
              </p>
            </div>

            {/* 4 stat cards in a 2×2 grid */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-4">
              <StatCard
                label="Total Records"
                value={fmt(animatedTotal)}
                icon={<TrendingUp className="w-5 h-5" />}
                accent="text-gray-700 dark:text-gray-200"
              />
              <StatCard
                label="Matched"
                value={fmt(animatedMatched)}
                sub={`${data.match_rate.toFixed(1)}% hit rate`}
                icon={<CheckCircle2 className="w-5 h-5" />}
                accent="text-green-500"
              />
              <StatCard
                label="Exceptions"
                value={fmt(animatedExceptions)}
                sub={`${data.unmatched_count} unmatched`}
                icon={<AlertTriangle className="w-5 h-5" />}
                accent="text-red-500"
              />
              <StatCard
                label="Settlement Value"
                value={fmtCurrency(animatedSettled)}
                sub={`of ${fmtCurrency(animatedBilled)} billed`}
                icon={<IndianRupee className="w-5 h-5" />}
                accent="text-indigo-500"
              />
            </div>
          </div>

          {/* ── Bar chart ── */}
          {chartData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm px-6 pt-6 pb-4">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Exceptions by Type
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Count of flagged payments per exception category
                </p>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barSize={38} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:[&>line]:stroke-gray-700" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.type}
                        fill={EXC_HEX_COLORS[entry.type] ?? "#6366F1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                {chartData.map(entry => (
                  <div key={entry.type} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: EXC_HEX_COLORS[entry.type] ?? "#6366F1" }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{entry.fullName}</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Match Rate Trend ── */}
          {data && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm px-6 py-5">
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Match Rate Trend
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Accuracy across recent reconciliation runs
                </p>
              </div>
              
              {trends.length < 2 ? (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  Run more reconciliations to see trends
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trends} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:[&>line]:stroke-gray-700" />
                    <XAxis
                      dataKey="run_id"
                      tickFormatter={(val) => `Run #${val}`}
                      tick={{ fontSize: 12, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "Match Rate"]} 
                      labelFormatter={(label) => `Run #${label}`}
                      contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '14px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="match_rate" 
                      stroke="#6366F1" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#6366F1", strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* ── Settlement financial breakdown ── */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Financial Summary
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Billed vs settled breakdown with distinct mismatch variance and pending settlement value
                </p>
              </div>
              {data.settlement_totals.total_discrepancy > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                  <span>Gross Discrepancy Total:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                    {fmtCurrency(animatedDiscrepancy)}
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-700">
              <div className="px-5 first:pl-0 py-3 sm:py-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-1">
                  Total Billed
                </p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                  {fmtCurrency(animatedBilled)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Total payment volume
                </p>
              </div>

              <div className="px-5 py-3 sm:py-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-1">
                  Total Settled
                </p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                  {fmtCurrency(animatedSettled)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Verified bank credits
                </p>
              </div>

              <div className="px-5 py-3 sm:py-0">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">
                  Amount Mismatches
                </p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {fmtCurrency(animatedAmtMismatch)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Rate / calculation variance
                </p>
              </div>

              <div className="px-5 py-3 sm:py-0">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase tracking-wide mb-1">
                  Unsettled Value
                </p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {fmtCurrency(animatedUnsettled)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Missing settlement records
                </p>
              </div>

              <div className="px-5 last:pr-0 py-3 sm:py-0">
                <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wide mb-1">
                  Duplicate Charges
                </p>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                  {fmtCurrency(animatedDuplicates)}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Duplicate payment volume
                </p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
