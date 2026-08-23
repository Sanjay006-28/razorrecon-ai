import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useTheme } from "../../context/ThemeContext";

export default function Layout() {
  const { theme } = useTheme();

  return (
    // The `dark` class lives HERE — React-controlled, no DOM mutation needed
    <div className={`${theme === "dark" ? "dark" : ""} min-h-screen`}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors duration-200">
        <Sidebar />
        <main className="ml-60 min-h-screen">
          <div className="max-w-6xl mx-auto px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
