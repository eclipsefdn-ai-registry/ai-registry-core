import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { ToolPage } from "./pages/ToolPage.tsx";
import { OrgPage } from "./pages/OrgPage.tsx";
import { AboutPage } from "./pages/AboutPage.tsx";
import { DocsLayout } from "./components/docs/DocsLayout.tsx";
import { ApiPage } from "./pages/docs/ApiPage.tsx";
import { ClientsPage } from "./pages/docs/ClientsPage.tsx";
import { TermsPage } from "./pages/TermsPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "tools/:toolId", element: <ToolPage /> },
        { path: "orgs/:orgId", element: <OrgPage /> },
        { path: "about", element: <AboutPage /> },
        {
          path: "docs",
          element: <DocsLayout />,
          children: [
            { index: true, element: <Navigate to="/docs/api" replace /> },
            { path: "api", element: <ApiPage /> },
            { path: "clients", element: <ClientsPage /> },
          ],
        },
        // /api-docs is a published URL for a public registry, so it redirects
        // to its replacement rather than 404ing.
        { path: "api-docs", element: <Navigate to="/docs/api" replace /> },
        { path: "terms", element: <TermsPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
