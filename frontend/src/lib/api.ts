import axios, { AxiosInstance, AxiosResponse } from "axios";

// ─── Base client ─────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: "http://127.0.0.1:8001",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// Longer timeout for AI chat (Gemini can take 20-40s with retries)
const chatClient: AxiosInstance = axios.create({
  baseURL: "http://127.0.0.1:8001",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 90_000,
});

// Extra-long timeout for AI exception analysis: the first (cold) call for a run
// analyzes every exception via sequential Gemini batches (~80s for ~20 exceptions),
// far beyond the default 30s. Once cached, the list endpoint serves it instantly.
const analysisClient: AxiosInstance = axios.create({
  baseURL: "http://127.0.0.1:8001",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 150_000,
});

// ─── Request interceptor (attach auth tokens if needed later) ────────────────
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// ─── Response interceptor (centralised error handling) ───────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ?? error.message ?? "Unknown error";
    console.error("[API Error]", message);
    return Promise.reject(new Error(message));
  }
);

// ─── Typed helpers ───────────────────────────────────────────────────────────
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res: AxiosResponse<T> = await apiClient.get(url, { params });
  return res.data;
}

export async function post<T, B = unknown>(url: string, body?: B): Promise<T> {
  const res: AxiosResponse<T> = await apiClient.post(url, body);
  return res.data;
}

export async function uploadFile<T>(url: string, file: File, fieldName = "file"): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  const res: AxiosResponse<T> = await apiClient.post(url, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function del<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res: AxiosResponse<T> = await apiClient.delete(url, { params });
  return res.data;
}

// ─── Domain-specific request functions (expand as routes are built) ──────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface Exception {
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
  is_resolved: boolean;
  reconciliation_run_id: number;
}

export interface ExceptionsResponse {
  limit: number;
  exceptions: Exception[];
}

export interface RunListItem {
  run_id: number;
  run_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  match_rate: number;
  total_transactions: number;
  exception_count: number;
}

export interface RunListResponse {
  total: number;
  skip: number;
  limit: number;
  runs: RunListItem[];
}

export const api = {
  health: () => get<HealthResponse>("/health"),

  upload: {
    internal: (file: File) =>
      uploadFile<{ message: string; filename: string }>("/api/v1/upload/internal", file),
    bank: (file: File) =>
      uploadFile<{ message: string; filename: string }>("/api/v1/upload/bank", file),
  },

  reconcile: {
    trigger: () => post<{ run_id: number | null; status: string }>("/api/v1/reconcile/run"),
    listRuns: (skip = 0, limit = 20) =>
      get<RunListResponse>("/api/v1/reconcile/runs", { skip, limit }),
    getRun: (runId: number) =>
      get<Record<string, unknown>>(`/api/v1/reconcile/runs/${runId}`),
    getExceptions: (runId: number, skip = 0, limit = 50) =>
      get<ExceptionsResponse>(
        `/api/v1/reconcile/exceptions/${runId}`,
        { skip, limit }
      ),
    deleteRun: (runId: number) =>
      del<{ message: string; run_id: number }>(`/api/v1/reconcile/runs/${runId}`),
    deleteAllRuns: () =>
      del<{ message: string; count: number }>("/api/v1/reconcile/runs", { confirm: true }),
    getAiAnalysis: async (runId: number) => {
      const res = await analysisClient.get<Array<{
        id: number;
        payment_id: string | null;
        order_id: string | null;
        exception_type: string;
        severity: string;
        explanation: string;
        root_cause: string;
        suggested_action: string;
      }>>(`/api/v1/reconcile/exceptions/${runId}/ai-analysis`);
      return res.data;
    },
    downloadReport: async (runId: number) => {
      const res = await apiClient.get(`/api/v1/reconcile/report/${runId}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reconciliation_report_run_${runId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  },

  chat: {
    sendMessage: (data: {
      run_id: number;
      message: string;
      conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
    }) =>
      chatClient.post<{ response: string }>("/api/v1/reconcile/chat", data).then(r => r.data),
  },


  summary: {

    overview: () => get<Record<string, unknown>>("/api/v1/summary/overview"),
    run: (runId: number) =>
      get<Record<string, unknown>>(`/api/v1/summary/run/${runId}`),
    trends: (days = 30) =>
      get<{ days: number; data_points: unknown[] }>("/api/v1/summary/trends", { days }),
  },
};

export default apiClient;
