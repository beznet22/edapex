import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AdminPage } from "./AdminPage";
import { ClaimPage } from "./ClaimPage";
import { WorkspacePage } from "./workspace/WorkspacePage";
import "./app.css";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isWorkspace = path === "/workspace" || path.startsWith("/workspace/");
const root = document.getElementById("root");

if (root === null) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    {path === "/claim" ? (
      <ClaimPage />
    ) : isWorkspace ? (
      <WorkspacePage />
    ) : (
      <AdminPage />
    )}
  </StrictMode>
);
