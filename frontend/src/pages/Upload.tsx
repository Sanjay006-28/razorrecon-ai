import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload as UploadIcon,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FileKey = "payments" | "settlements" | "bank_statement";

interface Slot {
  key: FileKey;
  label: string;
  description: string;
  requiredColumns: string;
  formField: string;   // FastAPI /upload form field name
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://127.0.0.1:8001/api/v1";

const SLOTS: Slot[] = [
  {
    key: "payments",
    label: "Payments CSV",
    formField: "payments",
    description: "Export from your payment gateway (Razorpay, Stripe…)",
    requiredColumns: "payment_id, order_id, amount, currency, payment_date, method, status",
  },
  {
    key: "settlements",
    label: "Settlements CSV",
    formField: "settlements",
    description: "Internal settlement records from your ERP or gateway",
    requiredColumns: "settlement_id, payment_id, settled_amount, settlement_date, utr_number",
  },
  {
    key: "bank_statement",
    label: "Bank Statement CSV",
    formField: "bank_statement",
    description: "Bank account statement for the same reconciliation period",
    requiredColumns: "utr_number, credited_amount, credit_date, narration",
  },
];

type Stage = "idle" | "uploading" | "running" | "done" | "error";

// ─── File Drop Zone ────────────────────────────────────────────────────────────

interface DropZoneProps {
  slot: Slot;
  file: File | null;
  onFile: (f: File | null) => void;
  disabled: boolean;
}

function DropZone({ slot, file, onFile, disabled }: DropZoneProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) onFile(f);
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 border rounded-2xl p-5 shadow-sm transition-all duration-200 ${
        dragging
          ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900/40"
          : file
          ? "border-green-300 dark:border-green-700"
          : "border-gray-200 dark:border-gray-700"
      }`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Slot header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{slot.label}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{slot.description}</p>
        </div>
        {file && (
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
        )}
      </div>

      {/* File display / drop zone */}
      {file ? (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2.5">
          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-400 truncate flex-1">{file.name}</span>
          <span className="text-xs text-green-500">{(file.size / 1024).toFixed(1)} KB</span>
          <button
            onClick={() => onFile(null)}
            disabled={disabled}
            className="text-green-400 hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => !disabled && ref.current?.click()}
          disabled={disabled}
          className="w-full border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl py-7 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:border-indigo-300 hover:text-indigo-500 dark:hover:border-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UploadIcon className="w-5 h-5" />
          <span className="text-xs font-medium">Click or drag & drop CSV</span>
        </button>
      )}

      {/* Required columns hint */}
      <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2.5 font-mono leading-relaxed">
        Requires: {slot.requiredColumns}
      </p>

      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// ─── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ stage }: { stage: Stage }) {
  const steps = [
    { key: "uploading", label: "Uploading files" },
    { key: "running",   label: "Running reconciliation" },
    { key: "done",      label: "Complete" },
  ];

  const active = stage === "uploading" ? 0 : stage === "running" ? 1 : stage === "done" ? 3 : 0;

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < active
                ? "bg-green-500 text-white"
                : i === active
                ? "bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900/40"
                : "bg-gray-100 dark:bg-gray-700 text-gray-400"
            }`}>
              {i < active ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] font-medium whitespace-nowrap ${
              i < active || i === active ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "text-gray-400 dark:text-gray-500"
            }`}>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px w-16 mb-4 mx-1 transition-all ${
              i < active - 1 ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

interface RunResultData {
  runId: number;
  matchRate: number;
  totalRecords: number;
  matched: number;
  exceptionCount: number;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Upload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<Record<FileKey, File | null>>({
    payments: null,
    settlements: null,
    bank_statement: null,
  });

  const [stage, setStage] = useState<Stage>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<RunResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slaDays, setSlaDays] = useState<number | "">(2);

  const allReady = Object.values(files).every(Boolean);
  const isActive = stage === "uploading" || stage === "running";

  function setFile(key: FileKey, f: File | null) {
    setFiles(prev => ({ ...prev, [key]: f }));
    setError(null);
    if (stage === "done") {
      setStage("idle");
      setRunResult(null);
    }
  }

  // Extract a human-readable error string from various API response shapes
  function extractErrorDetail(json: Record<string, unknown>): string {
    const d = json.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const obj = d as Record<string, unknown>;
      // Structured validation error: { file, problem, missing, found }
      if (obj.problem && obj.file) {
        const missing = Array.isArray(obj.missing) ? obj.missing.join(", ") : String(obj.missing ?? "");
        return `'${obj.file}': ${obj.problem}${missing ? ` — missing: ${missing}` : ""}`;
      }
      return JSON.stringify(obj);
    }
    // FastAPI validation errors come as detail: [{msg, loc, type}]
    if (Array.isArray(d)) {
      return d.map((e: unknown) => {
        if (typeof e === "object" && e !== null && "msg" in e) return String((e as Record<string, unknown>).msg);
        return JSON.stringify(e);
      }).join("; ");
    }
    return json.message ? String(json.message) : "Unknown error";
  }

  async function handleRun() {
    if (!allReady || isActive) return;
    setError(null);
    setRunResult(null);

    try {
      // ── Step 1: Upload ──────────────────────────────────────────────────
      setStage("uploading");
      const form = new FormData();
      for (const slot of SLOTS) {
        form.append(slot.formField, files[slot.key]!);
      }
      const upRes = await fetch(`${API_BASE}/reconcile/upload`, {
        method: "POST",
        body: form,
      });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(extractErrorDetail(upJson));
      const uploadId: string = upJson.upload_id;

      // ── Step 2: Reconcile ───────────────────────────────────────────────
      setStage("running");
      const runRes = await fetch(`${API_BASE}/reconcile/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId, sla_days: typeof slaDays === "number" ? slaDays : 2 }),
      });
      const runJson = await runRes.json();
      if (!runRes.ok) throw new Error(extractErrorDetail(runJson));

      const id: number = runJson.run_id ?? runJson.id ?? 1;
      const exceptionCount = Object.values(runJson.exception_counts || {}).reduce(
        (acc: number, val: unknown) => acc + (typeof val === "number" ? val : 0),
        0
      );

      setRunId(id);
      setRunResult({
        runId: id,
        matchRate: typeof runJson.match_rate === "number" ? runJson.match_rate : 0,
        totalRecords: typeof runJson.total_records === "number" ? runJson.total_records : 0,
        matched: typeof runJson.matched === "number" ? runJson.matched : 0,
        exceptionCount: exceptionCount || (runJson.unmatched ?? 0),
      });
      localStorage.setItem("lastRunId", String(id));
      setStage("done");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStage("idle");  // reset to idle so button re-enables for retry
    }
  }

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Upload Files</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
          Upload your three CSV files to start a reconciliation run.
        </p>
      </div>

      {/* ── File slots ── */}
      <div className="grid gap-4 mb-6">
        {SLOTS.map(slot => (
          <DropZone
            key={slot.key}
            slot={slot}
            file={files[slot.key]}
            onFile={f => setFile(slot.key, f)}
            disabled={isActive}
          />
        ))}
      </div>

      {/* ── Progress / Success Card ── */}
      {(isActive || stage === "done") && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-6 py-5 shadow-sm mb-5 flex flex-col items-center gap-4">
          <StepIndicator stage={stage} />
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span>{stage === "uploading" ? "Uploading and validating CSVs…" : "Processing reconciliation…"}</span>
            </div>
          )}
          {stage === "done" && runResult && (
            <div className="w-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    Reconciliation complete — {runResult.matchRate.toFixed(1)}% match rate, {runResult.exceptionCount} exceptions found
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Run #{runResult.runId} • {runResult.matched} of {runResult.totalRecords} payments matched cleanly
                  </p>
                </div>
              </div>
              <button
                id="go-to-dashboard"
                onClick={() => navigate("/")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all flex-shrink-0 cursor-pointer"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4 flex items-start gap-3 mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Upload or reconciliation failed</p>
            <p className="text-xs text-red-500 dark:text-red-300 mt-0.5 break-words">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex flex-1 items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Settlement SLA (days)
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={slaDays}
            disabled={isActive}
            onChange={(e) => {
              const val = e.target.value;
              setSlaDays(val === "" ? "" : parseInt(val));
            }}
            className="w-16 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm disabled:opacity-50"
          />
        </div>
        
        {stage === "done" && runResult ? (
          <button
            onClick={() => {
              setStage("idle");
              setRunResult(null);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Reconcile Another Batch
          </button>
        ) : (
          <button
            id="start-reconciliation"
            onClick={handleRun}
            disabled={!allReady || isActive}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              allReady && !isActive
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg cursor-pointer"
                : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            {isActive && <Loader2 className="w-4 h-4 animate-spin text-white" />}
            {isActive ? "Reconciling..." : "Start Reconciliation"}
          </button>
        )}
      </div>

      {/* ── Sample data hint ── */}
      <p className="text-xs text-gray-300 dark:text-gray-600 mt-5">
        Using sample data?  Run{" "}
        <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
          python generate_sample_data.py
        </code>{" "}
        in the backend folder to generate test CSVs.
      </p>
    </div>
  );
}
