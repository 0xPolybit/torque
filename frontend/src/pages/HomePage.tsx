import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronRight, Compass, FileCheck2, FolderTree, HardDrive, Radio, ShieldCheck, SlidersHorizontal, Waves } from "lucide-react";
import { Link } from "react-router-dom";
import { BrowseMockup, FileSelectionMockup, ProductPreview } from "../components/marketing/ProductPreview";
import { Reveal } from "../components/ui/Reveal";
import { SectionHeading } from "../components/ui/SectionHeading";
import { GITHUB_REPOSITORY } from "../lib/site";

export function HomePage() {
  return <>
    <section className="home-hero page-width">
      <div className="home-hero__copy">
        <div className="product-badge"><span /> Open source desktop client <span className="product-badge__version">v0.1.0</span></div>
        <h1>Downloads,<br /><span>without the clutter.</span></h1>
        <p className="home-hero__lead">A thoughtful BitTorrent client that puts you in control. See every file in a torrent before you decide what to download.</p>
        <div className="home-hero__actions">
          <Link className="button button--primary" to="/download">Download options <ArrowDown size={15} /></Link>
          <a className="button button--secondary" href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer">View on GitHub <ArrowUpRight size={14} /></a>
        </div>
        <div className="home-hero__subactions"><Link to="/docs">Read the documentation <ArrowRight size={13} /></Link><span className="hero-release-note">Release assets are listed on GitHub</span></div>
      </div>
      <div className="home-hero__visual"><ProductPreview /></div>
      <div className="home-hero__rail" aria-hidden="true"><span>USER CONTROL</span><i /><span>FILE BY FILE</span><i /><span>TORQUE · 0.1</span></div>
    </section>

    <section className="proof-strip" aria-label="Product overview">
      <div className="page-width proof-strip__inner"><span><Waves size={16} /> Rust-powered torrent engine</span><span><FileCheck2 size={15} /> Inspect before downloading</span><span><SlidersHorizontal size={15} /> Select files, set the pace</span><span><ShieldCheck size={15} /> Open-source · MIT</span></div>
    </section>

    <section className="home-inspection page-width section-pad">
      <Reveal className="home-inspection__copy">
        <span className="eyebrow">A better first step</span>
        <h2>Know what’s inside<br />before anything starts.</h2>
        <p>Magnet, file, or URL: Torque resolves the torrent’s metadata first. Open the file tree, see the size and contents, then choose only what belongs on your drive.</p>
        <ul className="check-list"><li><Check size={15} /> Preview without starting the transfer</li><li><Check size={15} /> Select individual files or whole folders</li><li><Check size={15} /> Review space and file-type checks</li></ul>
        <Link className="text-link" to="/docs/inspecting-torrent-files">How inspection works <ChevronRight size={15} /></Link>
      </Reveal>
      <Reveal className="home-inspection__visual" delay={100}><FileSelectionMockup /></Reveal>
    </section>

    <section className="home-browse-section">
      <div className="page-width home-browse section-pad">
        <Reveal className="home-browse__visual"><BrowseMockup /></Reveal>
        <Reveal className="home-browse__copy" delay={100}>
          <span className="eyebrow">Discovery with context</span>
          <h2>Find open content.<br />Review it on your terms.</h2>
          <p>Browse is built around documented, authorized sources. Search results lead to a details panel; nothing downloads until you inspect the torrent and confirm it.</p>
          <div className="provider-note"><Compass size={16} /><div><strong>Internet Archive</strong><span>Current provider · items with supported open licenses</span></div><span className="provider-note__led" /></div>
          <Link className="text-link" to="/docs/searching-content">Explore Browse in the docs <ChevronRight size={15} /></Link>
        </Reveal>
      </div>
    </section>

    <section className="home-control section-pad page-width">
      <Reveal className="home-control__heading"><SectionHeading title="A whole transfer, at a glance">Keep progress and controls close. Reach the technical detail only when you need it.</SectionHeading></Reveal>
      <div className="home-control__grid">
        <Reveal className="home-control__story"><div className="story-mark"><HardDrive size={17} /></div><h3>Details that stay useful</h3><p>Progress, selected bytes, speed, ETA, ratio, and peers in one view. Files, peers, trackers, and metainfo get their own tabs.</p><Link to="/docs/torrent-details">Torrent details <ChevronRight size={14} /></Link></Reveal>
        <Reveal delay={100}><div className="home-control__mock"><div className="home-control__mock-label"><span>ILLUSTRATIVE DETAILS</span><span>LIVE VALUES UNAVAILABLE IN THIS PREVIEW</span></div><div className="home-control__mock-body"><div className="home-control__mock-tabs">Overview <span>Files</span><span>Peers</span><span>Trackers</span><span>Info</span></div><div className="detail-summary-line"><div><span>Overall progress</span><strong>82%</strong><div className="detail-summary-bar"><i /></div></div><div><span>Remaining</span><strong>3m 12s</strong></div></div><div className="detail-summary-stats"><span><ArrowDown size={12} /> 18.4 MB/s</span><span><ArrowUp size={12} /> 1.2 MB/s</span><span><Radio size={12} /> 24 peers</span></div><div className="detail-summary-path"><FolderTree size={13} /> D:/Downloads/Ubuntu <button type="button" aria-label="Sample copy path"><Check size={12} /></button></div></div></div></Reveal>
      </div>
    </section>

    <section className="home-close page-width">
      <Reveal><div className="home-close__inner"><div className="home-close__mark"><img src="/favicon.svg" alt="" /></div><h2>Start with a closer look.</h2><p>Torque makes the transfer yours—from the first file in the tree to the final piece.</p><div><Link className="button button--primary" to="/download">Explore downloads <ArrowRight size={15} /></Link><Link className="button button--quiet" to="/docs/getting-started">Get started <ArrowRight size={14} /></Link></div></div></Reveal>
    </section>
  </>;
}
