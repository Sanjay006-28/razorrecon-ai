import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  BarChart2,
  MessageSquare,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: <LayoutDashboard size={18} /> },
  { label: "Upload", to: "/upload", icon: <Upload size={18} /> },
  { label: "Exceptions", to: "/exceptions", icon: <AlertTriangle size={18} /> },
  { label: "Reports", to: "/reports", icon: <BarChart2 size={18} /> },
  { label: "Chat", to: "/chat", icon: <MessageSquare size={18} /> },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-gray-200 flex flex-col z-20">
      {/* ── Wordmark ── */}
      <div className="h-16 flex items-center px-5 border-b border-gray-200 shrink-0">
        <span className="text-[15px] font-semibold tracking-tight text-gray-900">
          RazorRecon
          <span className="text-indigo-600 font-bold"> AI</span>
        </span>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ label, to, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] font-medium transition-colors duration-100",
                isActive
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? "text-indigo-600" : "text-gray-400"}>
                  {icon}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-gray-200 shrink-0">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Razorpay Buildthon 2024
        </p>
      </div>
    </aside>
  );
}
