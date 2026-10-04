import { ArrowRight, BookOpen, CircleHelp, Gauge, Keyboard, ListChecks, Search, ShieldCheck, Waves } from "lucide-react";
import { Link } from "react-router-dom";
import { docsGroups } from "../content/docs";
import { Reveal } from "../components/ui/Reveal";

const docIcons = [BookOpen, ListChecks, Gauge, CircleHelp];

export function DocsIndexPage() {
  return <div className="page-width docs-index">
    <section className="docs-index__hero"><div><span className="eyebrow">Torque documentation</span><h1>A clear path<br />through the app.</h1><p>Learn the torrent workflow, understand each control, and find answers when something doesn’t go to plan.</p></div><Link to="/docs/getting-started" className="docs-index__start"><span><BookOpen size={18} /></span><div><small>NEW TO TORQUE?</small><strong>Start with the guide</strong><i>Installation through first download <ArrowRight size={13} /></i></div></Link></section>
    <section className="docs-index__quick"><Link to="/docs/adding-torrents"><ListChecks size={15} /><span>Adding a torrent</span><ArrowRight size={13} /></Link><Link to="/docs/download-queue"><Waves size={15} /><span>Managing the queue</span><ArrowRight size={13} /></Link><Link to="/docs/bandwidth-limits"><Gauge size={15} /><span>Bandwidth limits</span><ArrowRight size={13} /></Link><Link to="/docs/keyboard-shortcuts"><Keyboard size={15} /><span>Keyboard shortcuts</span><ArrowRight size={13} /></Link></section>
    <div className="docs-index__body"><div className="docs-index__catalog"><div className="docs-index__catalog-head"><h2>Browse documentation</h2><span>{docsGroups.reduce((total, group) => total + group.items.length, 0)} guides</span></div>{docsGroups.map((group, index) => { const Icon = docIcons[index % docIcons.length]; return <Reveal className="docs-index__group" key={group.label}><div className="docs-index__group-label"><Icon size={15} /><h3>{group.label}</h3></div><div className="docs-index__links">{group.items.map((doc) => <Link key={doc.slug} to={`/docs/${doc.slug}`}><span>{doc.title}<small>{doc.description}</small></span><ArrowRight size={14} /></Link>)}</div></Reveal>; })}</div><aside className="docs-index__help"><div><Search size={17} /><h2>Can’t find a topic?</h2><p>Search the guide sidebar or browse the repository for the latest source.</p><a href="https://github.com/0xPolybit/torque/issues" target="_blank" rel="noreferrer">Ask on GitHub <ArrowRight size={13} /></a></div><span><ShieldCheck size={14} /> Docs follow shipped behavior</span></aside></div>
  </div>;
}
