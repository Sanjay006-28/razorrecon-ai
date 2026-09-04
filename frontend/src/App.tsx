import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider } from "./context/SidebarContext";
import { ChatProvider } from "./context/ChatContext";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Exceptions from "./pages/Exceptions";
import Reports from "./pages/Reports";
import History from "./pages/History";
import Chat from "./pages/Chat";

export default function App() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <ChatProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="upload" element={<Upload />} />
                <Route path="exceptions" element={<Exceptions />} />
                <Route path="reports" element={<Reports />} />
                <Route path="history" element={<History />} />
                <Route path="chat" element={<Chat />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ChatProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
