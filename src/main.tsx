import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register push-only service worker (skip in Lovable preview iframe to avoid SW conflicts)
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const inIframe = window.self !== window.top;
  const isPreviewHost = /lovable\.app$/i.test(window.location.hostname) && window.location.hostname.includes("id-preview");
  if (!inIframe && !isPreviewHost) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
        console.warn("SW register failed", e);
      });
    });
  }
}
