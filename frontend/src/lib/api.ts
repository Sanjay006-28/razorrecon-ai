import axios, { AxiosInstance, AxiosResponse } from "axios";

// ─── Base client ─────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
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

// ─── Domain-specific request functions (expand as routes are built) ──────────

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
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
      get<{ runs: unknown[]; total: number }>("/api/v1/reconcile/runs", { skip, limit }),
    getRun: (runId: number) =>
      get<Record<string, unknown>>(`/api/v1/reconcile/runs/${runId}`),
    getExceptions: (runId: number, skip = 0, limit = 50) =>
      get<{ exceptions: unknown[]; total: number }>(
        `/api/v1/reconcile/runs/${runId}/exceptions`,
        { skip, limit }
      ),
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
