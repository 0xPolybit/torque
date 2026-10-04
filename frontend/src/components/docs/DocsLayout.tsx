import { ArrowDown, ArrowRight, BookOpen, Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { docsGroups } from "../../content/docs";

export function DocsLayout({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const filteredGroups = useMemo(() => docsGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.title} ${item.description} ${group.label}`.toLowerCase().includes(query.toLowerCase().trim())),
  })).filter((group) => group.items.length > 0), [query]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return <div className="docs-shell page-width">
    <div className="docs-mobile-bar"><Link to="/docs"><BookOpen size={15} /> Documentation</Link><button type="button" aria-expanded={mobileOpen} aria-controls="docs-sidebar" onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X size={16} /> : <Menu size={16} />}<span>{mobileOpen ? "Close" : "Contents"}</span></button></div>
    <aside className={`docs-sidebar${mobileOpen ? " is-open" : ""}`} id="docs-sidebar" aria-label="Documentation navigation">
      <div className="docs-sidebar__top"><Link to="/docs" className="docs-sidebar__home"><BookOpen size={15} /> Documentation <ArrowRight size={12} /></Link><Link to="/docs/getting-started" className="docs-start-link">Getting started</Link></div>
      <label className="docs-search"><Search size={14} /><span className="sr-only">Search documentation</span><input type="search" placeholder="Search the docs…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      <nav className="docs-nav">
        {filteredGroups.map((group) => <section className="docs-nav__group" key={group.label}><h2>{group.label}</h2>{group.items.map((item) => <NavLink key={item.slug} to={`/docs/${item.slug}`} className={({ isActive }) => `docs-nav__link${isActive ? " is-active" : ""}`} aria-current={location.pathname === `/docs/${item.slug}` ? "page" : undefined}>{item.title}</NavLink>)}</section>)}
        {!filteredGroups.length && <p className="docs-nav__empty">No guides match “{query}”.</p>}
      </nav>
      <div className="docs-sidebar__bottom"><Link to="/download"><ArrowDown size={13} /> Download Torque</Link><a href="https://github.com/0xPolybit/torque" target="_blank" rel="noreferrer">Source repository <ArrowRight size={12} /></a></div>
    </aside>
    {mobileOpen && <button className="docs-drawer-scrim" type="button" aria-label="Close documentation navigation" onClick={() => setMobileOpen(false)} />}
    {children}
  </div>;
}
