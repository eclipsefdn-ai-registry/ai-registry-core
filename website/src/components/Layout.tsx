import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { PreviewBanner } from "./PreviewBanner";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col text-foreground">
      <PreviewBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
