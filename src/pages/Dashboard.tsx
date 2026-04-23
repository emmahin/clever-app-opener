import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { NewsPanel } from "@/components/chatbot/NewsPanel";
import { Newspaper } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-0 md:ml-[72px] pt-14 min-h-screen">
        <div className="px-3 md:px-6 py-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" />
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Dernières actualités IA et tech depuis Le Monde, Les Echos, Reuters, BBC
          </p>
        </div>
        <div className="px-3 md:px-6 pb-8">
          <NewsPanel layout="horizontal" />
        </div>
      </main>
    </div>
  );
}