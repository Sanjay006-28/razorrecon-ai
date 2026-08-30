import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ExternalLink, Activity, Trash2, Inbox } from "lucide-react";
import { api, RunListItem } from "../lib/api";

export default function History() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchRuns() {
      try {
        setLoading(true);
        const data = await api.reconcile.listRuns();
        setRuns(data.runs);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchRuns();
  }, []);

  const handleRowClick = (runId: number) => {
    localStorage.setItem("lastRunId", runId.toString());
    navigate("/");
  };

  const handleDeleteRun = async (e: React.MouseEvent, runId: number) => {
    e.stopPropagation();
    if (!window.confirm("Delete this run? This cannot be undone.")) return;
    try {
      await api.reconcile.deleteRun(runId);
      setRuns(runs => runs.filter(r => r.run_id !== runId));
    } catch (err: any) {
      alert("Error deleting run: " + err.message);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("This will permanently delete ALL reconciliation runs and exceptions. This cannot be undone.")) return;
    try {
      setLoading(true);
      await api.reconcile.deleteAllRuns();
      setRuns([]);
    } catch (err: any) {
      alert("Error clearing history: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ds: string | null) => {
    if (!ds) return "—";
    const dateStr = ds.endsWith("Z") || ds.includes("+") ? ds : `${ds}Z`;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date(ds).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed") {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Completed</span>;
    }
    if (s === "failed") {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">Running</span>;
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Run History</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Past reconciliation runs</p>
          </div>
        </div>
        {runs.length > 0 && !loading && (
          <button 
            onClick={handleDeleteAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors border border-red-200 dark:border-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Trash2 className="w-4 h-4" /> Clear All History
          </button>
        )}
      </div>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800">
          Error: {error}
        </div>
      ) : loading ? (
        <div className="h-40 flex items-center justify-center">
          <Activity className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date & Time</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Run #</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Match Rate</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Records</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Exceptions</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500">
                          <Inbox className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-200">No reconciliation runs yet</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Go to{" "}
                          <button
                            onClick={() => navigate("/upload")}
                            className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline focus:outline-none"
                          >
                            Upload
                          </button>{" "}
                          to create your first one.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  runs.map(run => (
                    <tr 
                      key={run.run_id}
                      onClick={() => handleRowClick(run.run_id)}
                      className="group hover:bg-indigo-50/40 dark:hover:bg-gray-800/60 cursor-pointer transition-colors duration-150"
                    >
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 font-medium">
                        {formatDate(run.started_at)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                        #{run.run_id}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-200 tabular-nums">
                        {run.match_rate.toFixed(1)}%
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                        {run.total_transactions}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400 font-medium tabular-nums">
                        {run.exception_count}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {getStatusBadge(run.status)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={(e) => handleDeleteRun(e, run.run_id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Run"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
