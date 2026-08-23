import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      <Sidebar />

      {/* Main content — offset by sidebar width */}
      <main className="ml-60 min-h-screen">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
