import { ArrowRight, Check, CircleGauge, Database, FolderTree, Gauge, ShieldCheck, SlidersHorizontal, Sparkles, Waves } from "lucide-react";
import { Link } from "react-router-dom";
import { BrowseMockup, DetailsMockup, FileSelectionMockup, QueueMockup } from "../components/marketing/ProductPreview";
import { Reveal } from "../components/ui/Reveal";
import { SectionHeading } from "../components/ui/SectionHeading";

export function FeaturesPage() {
  return <div className="page-width feature-page">
    <section className="page-intro"><span className="eyebrow">Less guesswork, more control</span><h1>Everything you need.<br /><span>Nothing in the way.</span></h1><p>Torque keeps the full torrent workflow understandable, from the first magnet link to the files on disk.</p></section>
    <section className="feature-chapter feature-chapter--wide">
      <Reveal className="feature-chapter__copy"><span className="feature-index">METADATA FIRST</span><h2>Inspect the contents.<br />Then make the call.</h2><p>Metadata resolves before content transfer begins. Check the complete file list, relative sizes, trackers, and info hash, then decide whether to continue.</p><ul className="check-list"><li><Check size={14} /> Magnet links resolve metadata first</li><li><Check size={14} /> Local `.torrent` files parse without starting</li><li><Check size={14} /> HTTP and HTTPS torrent URLs are supported</li></ul></Reveal>
      <Reveal className="feature-chapter__visual" delay={100}><FileSelectionMockup /></Reveal>
    </section>
    <section className="feature-chapter feature-chapter--reverse">
      <Reveal className="feature-chapter__copy"><span className="feature-index">SELECT WHAT YOU NEED</span><h2>Keep the files.<br />Skip the rest.</h2><p>Choose an entire folder, a single file, or a few essentials. Selection is preserved through the download session and restored with your library.</p><div className="feature-inline-note"><FolderTree size={16} /> Folder checkboxes reflect partial selections.</div><Link className="text-link" to="/docs/selecting-files">Selective download guide <ArrowRight size={14} /></Link></Reveal>
      <Reveal className="feature-chapter__visual feature-selection-visual" delay={80}><FileSelectionMockup /></Reveal>
    </section>
    <section className="feature-chapter feature-chapter--browse">
      <Reveal className="feature-chapter__copy"><span className="feature-index">AUTHORIZED DISCOVERY</span><h2>Browse sources.<br />Not just keywords.</h2><p>Search configured content providers through one normalized interface. Each result keeps its provider, category, size, license context, and source page in view.</p><div className="feature-inline-note"><Database size={16} /> Search queries do not start a torrent.</div></Reveal>
      <Reveal className="feature-chapter__visual" delay={80}><BrowseMockup /></Reveal>
    </section>
    <section className="feature-details-band"><Reveal><SectionHeading title="The detail is there when you want it">A compact download list stays calm. Open a torrent to see the deeper transfer picture.</SectionHeading><div className="feature-details-band__mock"><DetailsMockup /></div></Reveal></section>
    <section className="feature-queue-band"><Reveal><div className="feature-queue-band__copy"><span className="feature-index">TRANSFER MANAGEMENT</span><h2>Put the queue in order.</h2><p>Move waiting torrents, set how many can run at once, and apply session-wide download and upload caps. Pause, resume, and reopen a completed folder from the list.</p><div className="feature-mini-points"><span><CircleGauge size={15} /> Concurrency cap</span><span><Gauge size={15} /> Global rate limits</span><span><SlidersHorizontal size={15} /> Queue ordering</span></div></div><QueueMockup /></Reveal></section>
    <section className="feature-safety-row"><Reveal><div><span className="feature-index">BEFORE THE FIRST BYTE</span><h2>A few useful checks.</h2><p>Duplicate detection, destination-space estimates, file type summaries, and path validation help you make an informed start.</p></div><div className="safety-marks"><div><ShieldCheck size={17} /><span>Existing torrent check</span></div><div><Sparkles size={17} /><span>Space and type summary</span></div><div><Waves size={17} /><span>Safe relative paths</span></div></div></Reveal></section>
  </div>;
}
