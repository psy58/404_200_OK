import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/state/queryClient";
import { ToastProvider } from "@/state/ToastContext";
import { AssignmentProvider } from "@/state/AssignmentContext";
import { OverlayProvider } from "@/state/OverlayContext";
import { App } from "./App";
import "@/styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AssignmentProvider>
          <OverlayProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </OverlayProvider>
        </AssignmentProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
