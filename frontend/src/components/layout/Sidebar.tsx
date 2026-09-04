import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  BarChart2,
  MessageSquare,
  Clock,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useSidebar } from "../../context/SidebarContext";

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
  { label: "History", to: "/history", icon: <Clock size={18} /> },
  { label: "Chat", to: "/chat", icon: <MessageSquare size={18} /> },
];

export default function Sidebar() {
  const { theme, toggle } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      className={`fixed inset-y-0 left-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col z-20 transition-all duration-200 ease-in-out ${
        isCollapsed ? "w-16" : "w-60"
      }`}
    >
      {/* ── Wordmark & Collapse Button ── */}
      <div
        className={`h-16 flex items-center border-b border-gray-200 dark:border-gray-700 shrink-0 ${
          isCollapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        {!isCollapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white truncate">
            RazorRecon
            <span className="text-indigo-600 font-bold"> AI</span>
          </span>
        )}
        <button
          onClick={toggleSidebar}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1">
        {NAV_ITEMS.map(({ label, to, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={isCollapsed ? label : undefined}
            className={({ isActive }) =>
              [
                "flex items-center rounded-lg text-[13.5px] font-medium transition-colors duration-100 group",
                isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`shrink-0 ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-400 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                  }`}
                >
                  {icon}
                </span>
                {!isCollapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Dark mode toggle + Footer ── */}
      <div
        className={`border-t border-gray-200 dark:border-gray-700 shrink-0 ${
          isCollapsed ? "p-2.5 space-y-2 flex flex-col items-center" : "px-4 py-4 space-y-3"
        }`}
      >
        <button
          onClick={toggle}
          title={isCollapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={`flex items-center rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
            isCollapsed ? "justify-center p-2 w-full" : "gap-2 w-full px-3 py-2"
          }`}
        >
          {theme === "dark" ? (
            <>
              <Sun size={16} className="text-amber-400 shrink-0" />
              {!isCollapsed && <span>Light mode</span>}
            </>
          ) : (
            <>
              <Moon size={16} className="text-indigo-400 shrink-0" />
              {!isCollapsed && <span>Dark mode</span>}
            </>
          )}
        </button>
        {!isCollapsed && (
          <p className="text-[11px] text-gray-400 dark:text-gray-600 px-1 truncate">
            Razorpay Buildathon — Track 04
          </p>
        )}
      </div>
    </aside>
  );
}
