import { useRef, useState } from "react";
import { Upload as UploadIcon, FileText, X } from "lucide-react";

interface FileSlot {
  label: string;
  key: "internal" | "bank";
  description: string;
}

const SLOTS: FileSlot[] = [
  {
    label: "Internal Payments File",
    key: "internal",
    description: "CSV / Excel export from your payment gateway or ERP",
  },
  {
    label: "Bank Statement",
    key: "bank",
    description: "CSV / Excel bank statement for the same period",
  },
];

export default function Upload() {
  const [files, setFiles] = useState<Record<string, File | null>>({
    internal: null,
    bank: null,
  });

  const refs = {
    internal: useRef<HTMLInputElement>(null),
    bank: useRef<HTMLInputElement>(null),
  };

  const handleFile = (key: "internal" | "bank", file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const allFilesReady = files.internal && files.bank;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Upload Files</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Upload both files to start a reconciliation run.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {SLOTS.map(({ label, key, description }) => {
          const file = files[key];
          return (
            <div
              key={key}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">{label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{description}</p>

              {file ? (
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md px-3 py-2">
                  <FileText size={16} className="text-indigo-500 shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate flex-1">
                    {file.name}
                  </span>
                  <button
                    onClick={() => handleFile(key, null)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => refs[key].current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-md py-6 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                >
                  <UploadIcon size={20} />
                  <span className="text-xs">Click to select file</span>
                </button>
              )}

              <input
                ref={refs[key]}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(key, e.target.files?.[0] ?? null)}
              />
            </div>
          );
        })}
      </div>

      <button
        disabled={!allFilesReady}
        className={`px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${
          allFilesReady
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
        }`}
      >
        Start Reconciliation
      </button>
    </div>
  );
}
