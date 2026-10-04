import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function SiteLayout({ children, themeToggle }: { children: ReactNode; themeToggle: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <SiteHeader themeToggle={themeToggle} mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen((open) => !open)} onNavigate={() => setMobileOpen(false)} />
    {mobileOpen && <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile navigation">
      <Link to="/features" onClick={() => setMobileOpen(false)}>Features</Link>
      <Link to="/docs" onClick={() => setMobileOpen(false)}>Docs</Link>
      <Link to="/download" onClick={() => setMobileOpen(false)}>Download</Link>
      <Link to="/changelog" onClick={() => setMobileOpen(false)}>Changelog</Link>
      <Link to="/about" onClick={() => setMobileOpen(false)}>About Torque</Link>
    </nav>}
    <main id="main-content" tabIndex={-1}>{children}</main>
    <SiteFooter />
  </div>;
}
