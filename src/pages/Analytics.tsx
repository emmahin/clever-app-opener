import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { StockPanel } from "@/components/chatbot/StockPanel";
import { Activity } from "lucide-react";

export default function Analytics() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-0 md:ml-[280px] pt-14 min-h-screen">
        <div className="px-3 md:px-6 py-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Entreprises dont le capital explose — données Yahoo Finance
          </p>
        </div>
        <div className="px-3 md:px-6 pb-8 max-w-5xl">
          <StockPanel />
        </div>
      </main>
    </div>
  );
}