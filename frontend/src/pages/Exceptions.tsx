const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-red-50 text-red-600 border-red-100",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

const PLACEHOLDER_EXCEPTIONS = [
  { id: 1, type: "amount_mismatch", severity: "high", description: "Settlement amount differs from payment by ₹12.50", resolved: false },
  { id: 2, type: "missing_settlement", severity: "critical", description: "No settlement found for pay_ABC123456", resolved: false },
  { id: 3, type: "delayed_settlement", severity: "medium", description: "Settlement arrived T+6 (SLA: T+2)", resolved: false },
  { id: 4, type: "duplicate_payment", severity: "medium", description: "Duplicate payment for ord_XYZ987654", resolved: true },
  { id: 5, type: "ghost_bank_entry", severity: "low", description: "Bank credit with no matching settlement UTR", resolved: false },
];

export default function Exceptions() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">Exceptions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Discrepancies and anomalies detected during reconciliation.
        </p>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { label: "Critical", count: 1, style: "bg-red-50 text-red-700 border-red-200" },
          { label: "High", count: 1, style: "bg-orange-50 text-orange-700 border-orange-200" },
          { label: "Medium", count: 2, style: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "Low", count: 1, style: "bg-gray-50 text-gray-600 border-gray-200" },
        ].map(({ label, count, style }) => (
          <span
            key={label}
            className={`px-3 py-1 rounded-full border text-xs font-semibold ${style}`}
          >
            {label}: {count}
          </span>
        ))}
      </div>

      {/* Exceptions table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_EXCEPTIONS.map((exc, i) => (
              <tr
                key={exc.id}
                className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}
              >
                <td className="px-5 py-3 font-mono text-xs text-gray-600">
                  {exc.type}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${SEVERITY_STYLES[exc.severity]}`}
                  >
                    {exc.severity}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-700">{exc.description}</td>
                <td className="px-5 py-3">
                  {exc.resolved ? (
                    <span className="text-green-600 text-xs font-medium">Resolved</span>
                  ) : (
                    <span className="text-amber-600 text-xs font-medium">Open</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
