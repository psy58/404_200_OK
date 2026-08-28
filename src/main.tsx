/**
 * API INTEGRATION - application bootstrap
 * Contract SOT: src/api/ui-api-boundary-v2.ts; capability map:
 *               api-integration/frontend-api-map.md. Service OpenAPI is not
 *               present, so production real mode fails before network I/O.
 * Configuration: .env.example -> src/services/apiClient.ts; no secret belongs
 *                in a VITE_ variable or the client bundle.
 * Auth/AuthZ: the future same-origin session/CSRF contract must reauthorize
 *             school -> Assignment -> object -> property -> action per request.
 * State/cache: QueryClientProvider + AssignmentProvider cancel and purge all
 *              principal-scoped requests/cache on Assignment context changes.
 * Failure/privacy: RFC9457-like issues are normalized for UI display; payload,
 *                  token, document body, search text and notes are not logged.
 */
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
