import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  BarChart2,
  MessageSquare,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

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
  const { theme, toggle } = useTheme();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col z-20 transition-colors duration-200">
      {/* ── Wordmark ── */}
      <div className="h-16 flex items-center px-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
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
                  ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"}>
                  {icon}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Dark mode toggle + Footer ── */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0 space-y-3">
        <button
          onClick={toggle}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {theme === "dark" ? (
            <><Sun size={15} className="text-amber-400" /> Light mode</>
          ) : (
            <><Moon size={15} className="text-indigo-400" /> Dark mode</>
          )}
        </button>
        <p className="text-[11px] text-gray-400 dark:text-gray-600">
          Razorpay Buildthon 2026
        </p>
      </div>
    </aside>
  );
}
