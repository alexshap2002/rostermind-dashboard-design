import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./app/queryClient";
import { router } from "./app/router";
import "./styles/index.css";
import { DEMO, installDemoApi } from "./demo/mockApi";

// Демо для показу дизайну: вигадані дані замість сервера (головна веде на дашборд мережі — див. router).
if (DEMO) installDemoApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
