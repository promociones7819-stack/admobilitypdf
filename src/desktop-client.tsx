import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getDesktopRouter } from "./desktop-router";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("No se ha encontrado el contenedor de la aplicación.");

const router = getDesktopRouter();
createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
