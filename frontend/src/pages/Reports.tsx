const REPORT_SECTIONS = [
  {
    title: "Match Rate Trend",
    description: "Daily match rate over the last 30 days.",
  },
  {
    title: "Exception Breakdown",
    description: "Count of exceptions grouped by type and severity.",
  },
  {
    title: "Settlement Delay Analysis",
    description: "Distribution of settlement days (T+N) against the T+2 SLA.",
  },
  {
    title: "Amount Discrepancy Summary",
    description: "Total value of discrepancies per reconciliation run.",
  },
];

export default function Reports() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Analytical summaries and exportable reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_SECTIONS.map(({ title, description }) => (
          <div
            key={title}
            className="bg-white border border-gray-200 rounded-lg p-6"
          >
            <p className="text-sm font-semibold text-gray-800 mb-1">{title}</p>
            <p className="text-xs text-gray-400 mb-4">{description}</p>
            {/* Chart placeholder */}
            <div className="h-36 bg-gray-50 border border-gray-100 rounded-md flex items-center justify-center">
              <span className="text-xs text-gray-300">Chart coming soon</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
