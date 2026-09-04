import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useTheme } from "../../context/ThemeContext";
import { useSidebar } from "../../context/SidebarContext";

export default function Layout() {
  const { theme } = useTheme();
  const { isCollapsed } = useSidebar();

  return (
    // The `dark` class lives HERE — React-controlled, no DOM mutation needed
    <div className={`${theme === "dark" ? "dark" : ""} min-h-screen`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors duration-200">
        <Sidebar />
        <main
          className={`min-h-screen transition-all duration-200 ease-in-out ${
            isCollapsed ? "ml-16" : "ml-60"
          }`}
        >
          <div className="max-w-6xl mx-auto px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
