import { ArrowUpRight, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";
import { GITHUB_REPOSITORY } from "../../lib/site";

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="page-width site-footer__main">
      <div className="site-footer__brand"><Link to="/" className="site-brand"><img src="/favicon.svg" width="30" height="30" alt="" /><span>Torque</span></Link><p>A calmer home for downloads.<br />Only download what you have the right to access.</p></div>
      <div className="site-footer__links">
        <div><h2>Explore</h2><Link to="/features">Features</Link><Link to="/download">Download</Link><Link to="/changelog">Changelog</Link></div>
        <div><h2>Learn</h2><Link to="/docs">Documentation</Link><Link to="/docs/getting-started">Getting started</Link><Link to="/docs/keyboard-shortcuts">Keyboard shortcuts</Link></div>
        <div><h2>Project</h2><Link to="/about">About</Link><a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><a href={`${GITHUB_REPOSITORY}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT license</a></div>
      </div>
    </div>
    <div className="site-footer__bottom page-width"><span>© {new Date().getFullYear()} Torque contributors</span><a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer"><GitBranch size={14} /> Open source on GitHub</a></div>
  </footer>;
}
