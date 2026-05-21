import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { ToolPage } from "./pages/ToolPage.tsx";
import { AboutPage } from "./pages/AboutPage.tsx";
import { ApiDocsPage } from "./pages/ApiDocsPage.tsx";
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
        { path: "about", element: <AboutPage /> },
        { path: "api-docs", element: <ApiDocsPage /> },
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
