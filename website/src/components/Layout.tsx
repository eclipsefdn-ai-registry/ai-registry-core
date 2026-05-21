import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { PreviewBanner } from "./PreviewBanner";

export function Layout() {
  return (
    <div className="layout">
      <PreviewBanner />
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
