export default function Dashboard() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reconciliation overview and key metrics.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-7">
        {[
          { label: "Total Transactions", value: "—", accent: false },
          { label: "Matched", value: "—", accent: false, color: "text-green-600" },
          { label: "Unmatched", value: "—", accent: false, color: "text-red-500" },
          { label: "Match Rate", value: "—%", accent: true },
        ].map(({ label, value, accent, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-lg px-5 py-4"
          >
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
              {label}
            </p>
            <p
              className={`text-2xl font-bold ${
                accent ? "text-indigo-600" : (color ?? "text-gray-900")
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Placeholder content area */}
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-8 text-center">
        <p className="text-sm text-gray-400">
          Run a reconciliation to see results here.
        </p>
      </div>
    </div>
  );
}
