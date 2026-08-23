export default function Dashboard() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Reconciliation overview and key metrics.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-7">
        {[
          { label: "Total Transactions", value: "—", color: "text-gray-900 dark:text-white" },
          { label: "Matched", value: "—", color: "text-green-600" },
          { label: "Unmatched", value: "—", color: "text-red-500" },
          { label: "Match Rate", value: "—%", color: "text-indigo-600 dark:text-indigo-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-5 py-4"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-1">
              {label}
            </p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-6 py-8 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Run a reconciliation to see results here.
        </p>
      </div>
    </div>
  );
}
