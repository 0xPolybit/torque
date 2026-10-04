import { ArrowUpRight, GitBranch, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { GITHUB_REPOSITORY } from "../../lib/site";

export function SiteHeader({ themeToggle, mobileOpen, onToggleMobile, onNavigate }: {
  themeToggle: ReactNode;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onNavigate: () => void;
}) {
  return <header className="site-header">
    <div className="site-header__inner page-width">
      <Link to="/" className="site-brand" aria-label="Torque home" onClick={onNavigate}><img src="/favicon.svg" width="34" height="34" alt="" /><span>Torque</span></Link>
      <nav className="site-nav" aria-label="Main navigation">
        <NavLink to="/features" className={({ isActive }) => `site-nav__link${isActive ? " is-active" : ""}`}>Features</NavLink>
        <NavLink to="/docs" className={({ isActive }) => `site-nav__link${isActive ? " is-active" : ""}`}>Docs</NavLink>
        <NavLink to="/download" className={({ isActive }) => `site-nav__link${isActive ? " is-active" : ""}`}>Download</NavLink>
        <NavLink to="/changelog" className={({ isActive }) => `site-nav__link site-nav__link--wide${isActive ? " is-active" : ""}`}>Changelog</NavLink>
        <NavLink to="/about" className={({ isActive }) => `site-nav__link site-nav__link--wide${isActive ? " is-active" : ""}`}>About</NavLink>
      </nav>
      <div className="site-header__actions">
        {themeToggle}
        <a className="github-link" href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer" aria-label="Torque on GitHub"><GitBranch size={16} aria-hidden="true" /><span>GitHub</span><ArrowUpRight size={12} aria-hidden="true" /></a>
        <button className="mobile-menu-toggle" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="mobile-menu" onClick={onToggleMobile}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
  </header>;
}
