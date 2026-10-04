import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { SiteLayout } from "./components/layout/SiteLayout";
import { Seo } from "./components/layout/Seo";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

const FeaturesPage = lazy(() => import("./pages/FeaturesPage").then((module) => ({ default: module.FeaturesPage })));
const DownloadPage = lazy(() => import("./pages/DownloadPage").then((module) => ({ default: module.DownloadPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then((module) => ({ default: module.ChangelogPage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));
const DocsIndexPage = lazy(() => import("./pages/DocsIndexPage").then((module) => ({ default: module.DocsIndexPage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })));

function ScrollToRouteTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [pathname]);
  return null;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("torque-site-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d100f" : "#f2f5f1");
    try { localStorage.setItem("torque-site-theme", theme); } catch { /* Storage is optional. */ }
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";
  return <button className="theme-toggle" type="button" aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`} onClick={() => setTheme(nextTheme)}>
    <span className={`theme-toggle__icon theme-toggle__icon--${theme}`} aria-hidden="true" />
  </button>;
}

function RouteFallback() {
  return <div className="route-loading" role="status"><span className="loading-dot" /> Loading page…</div>;
}

export default function App() {
  const location = useLocation();
  return <>
    <ScrollToRouteTop />
    <Seo path={location.pathname} />
    <SiteLayout themeToggle={<ThemeToggle />}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/docs" element={<DocsIndexPage />} />
          <Route path="/docs/:slug" element={<DocsPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </SiteLayout>
  </>;
}
