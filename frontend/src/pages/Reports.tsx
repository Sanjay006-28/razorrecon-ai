const REPORT_SECTIONS = [
  { title: "Match Rate Trend",         description: "Daily match rate over the last 30 days." },
  { title: "Exception Breakdown",      description: "Count of exceptions grouped by type and severity." },
  { title: "Settlement Delay Analysis",description: "Distribution of settlement days (T+N) against T+2 SLA." },
  { title: "Amount Discrepancy Summary",description: "Total value of discrepancies per reconciliation run." },
];

export default function Reports() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Reports</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Analytical summaries and exportable reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_SECTIONS.map(({ title, description }) => (
          <div key={title} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">{title}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{description}</p>
            <div className="h-36 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 rounded-md flex items-center justify-center">
              <span className="text-xs text-gray-300 dark:text-gray-600">Chart coming soon</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
