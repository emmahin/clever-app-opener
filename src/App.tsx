import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Analytics from "./pages/Analytics.tsx";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { SettingsProvider } from "@/contexts/SettingsProvider";
import { ProjectsProvider } from "@/contexts/ProjectsProvider";
import { TwinVoiceProvider } from "@/contexts/TwinVoiceProvider";
import Settings from "./pages/Settings.tsx";
import VideoEditor from "./pages/VideoEditor.tsx";
import Documents from "./pages/Documents.tsx";
import Notifications from "./pages/Notifications.tsx";
import Auth from "./pages/Auth.tsx";
import Install from "./pages/Install.tsx";
import Billing from "./pages/Billing.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import Agenda from "./pages/Agenda.tsx";
import OpenAIDiagnostics from "./pages/OpenAIDiagnostics.tsx";
import VoiceAdmin from "./pages/VoiceAdmin.tsx";
import { AuthGuard } from "@/components/AuthGuard";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { useVoiceNavigation } from "@/hooks/useVoiceNavigation";

const queryClient = new QueryClient();

/** Composant interne pour activer la navigation vocale (doit être dans le Router). */
const VoiceNavigationBridge = () => {
  useVoiceNavigation();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <RootErrorBoundary>
    <LanguageProvider>
      <SettingsProvider>
        <ProjectsProvider>
        <TwinVoiceProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <VoiceNavigationBridge />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/install" element={<Install />} />
            <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
            <Route path="/home" element={<AuthGuard><Index /></AuthGuard>} />
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="/video" element={<AuthGuard><VideoEditor /></AuthGuard>} />
            <Route path="/documents" element={<AuthGuard><Documents /></AuthGuard>} />
            <Route path="/notifications" element={<AuthGuard><Notifications /></AuthGuard>} />
            <Route path="/billing" element={<AuthGuard><Billing /></AuthGuard>} />
            <Route path="/admin/users" element={<AuthGuard><AdminUsers /></AuthGuard>} />
            <Route path="/agenda" element={<AuthGuard><Agenda /></AuthGuard>} />
            <Route path="/openai-diagnostics" element={<OpenAIDiagnostics />} />
            <Route path="/admin/voice" element={<AuthGuard><VoiceAdmin /></AuthGuard>} />
            {/* /voice-orb supprimé : l'unique interface vocale est l'overlay VoiceCallMode (depuis l'icône téléphone du chat). */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
        </TwinVoiceProvider>
        </ProjectsProvider>
      </SettingsProvider>
    </LanguageProvider>
    </RootErrorBoundary>
  </QueryClientProvider>
);

export default App;
