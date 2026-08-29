import { useEffect, useState } from "react";
import { api, RunListItem, RunListResponse } from "../lib/api";

interface RunSelectorProps {
  value?: string;
  selectedRunId?: string;
  onChange: (runId: string) => void;
}

export default function RunSelector({ value, selectedRunId, onChange }: RunSelectorProps) {
  const currentVal = value ?? selectedRunId ?? "";
  const [runs, setRuns] = useState<RunListItem[]>([]);

  useEffect(() => {
    api.reconcile.listRuns().then((data: RunListResponse) => {
      setRuns(data.runs);
    }).catch(console.error);
  }, []);

  const formatDate = (ds: string | null) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0">
        Run ID:
      </label>
      <select
        value={currentVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 px-3 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-gray-200 shadow-sm cursor-pointer"
      >
        {runs.length === 0 ? (
          <option value={currentVal}>{currentVal ? `Run #${currentVal}` : 'Select...'}</option>
        ) : (
          runs.map((r) => (
            <option key={r.run_id} value={r.run_id.toString()}>
              Run #{r.run_id} · {formatDate(r.started_at)} · {r.match_rate.toFixed(1)}% match
            </option>
          ))
        )}
      </select>
    </div>
  );
}
