import { ArrowRight, Eye, GitBranch, Scale, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { GITHUB_REPOSITORY } from "../lib/site";
import { Reveal } from "../components/ui/Reveal";

export function AboutPage() {
  return <div className="page-width about-page">
    <section className="page-intro about-intro"><span className="eyebrow">Why Torque</span><h1>Useful by default.<br /><span>Yours by design.</span></h1><p>Torrent software can feel like a control room. Torque aims for something simpler: a clear place to inspect, choose, and manage each transfer.</p></section>
    <section className="about-principles">
      <Reveal><article><span><Eye size={18} /></span><h2>See before starting</h2><p>Metainfo and the nested file list come first. The transfer begins only after you choose a destination, select files, and confirm.</p></article></Reveal>
      <Reveal delay={80}><article><span><UserRoundCheck size={18} /></span><h2>Keep control close</h2><p>Queue order, download limits, destination, and selection stay in your hands. Technical detail is available when it helps.</p></article></Reveal>
      <Reveal delay={160}><article><span><GitBranch size={18} /></span><h2>Built in the open</h2><p>Torque is published under the MIT license. Its desktop interface, Rust backend, and provider code can be reviewed in the source.</p></article></Reveal>
    </section>
    <section className="about-architecture"><div><span className="eyebrow">Under the hood</span><h2>A native shell.<br />A focused Rust service.</h2><p>Tauri hosts the React and TypeScript interface in the operating system’s webview. Rust owns torrent sessions, metainfo, paths, queue scheduling, and provider calls through librqbit.</p><Link className="text-link" to="/docs/torrent-metadata">Read about the engine architecture <ArrowRight size={14} /></Link></div><div className="architecture-stack"><div><b>UI</b><span>React · TypeScript</span></div><i /><div><b>Desktop</b><span>Tauri 2</span></div><i /><div><b>Transfer service</b><span>Rust · librqbit</span></div></div></section>
    <section className="about-law"><Scale size={20} /><div><h2>Use torrent technology responsibly.</h2><p>BitTorrent is a distribution protocol used for many lawful purposes, including Linux distributions, open-source projects, public-domain media, and academic datasets. Only download and share content you are legally authorized to access; you are responsible for respecting the rights and laws that apply.</p><a href={`${GITHUB_REPOSITORY}/blob/main/LICENSE`} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> MIT license <ArrowRight size={12} /></a></div></section>
  </div>;
}
