import { ArrowDown, ArrowUpRight, Check, CircleHelp, GitBranch, Monitor, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { GITHUB_RELEASES } from "../lib/site";
import { Reveal } from "../components/ui/Reveal";

const platforms = [
  { name: "Windows", target: "x64", status: "Check releases", primary: true, detail: "The GitHub Releases page shows current Windows installers." },
  { name: "macOS", target: "Apple silicon & Intel", status: "Planned", primary: false, detail: "Build availability depends on a published release." },
  { name: "Linux", target: "x64", status: "Planned", primary: false, detail: "Build availability depends on a published release." },
];

export function DownloadPage() {
  return <div className="page-width download-page">
    <section className="page-intro download-intro"><span className="eyebrow">Get Torque</span><h1>A calmer client<br />for your desktop.</h1><p>Torque is open source and built for Windows, macOS, and Linux. Open GitHub Releases to see the latest installers and current platform availability.</p><a className="button button--primary" href={GITHUB_RELEASES} target="_blank" rel="noreferrer">Check GitHub Releases <ArrowUpRight size={14} /></a></section>
    <section className="download-platforms" aria-labelledby="platforms-heading"><div className="download-platforms__head"><h2 id="platforms-heading">Choose your platform</h2><span>Release availability is managed on GitHub</span></div><div className="download-platform-list">
      {platforms.map((platform) => <Reveal className={`platform-row${platform.primary ? " platform-row--primary" : ""}`} key={platform.name}>
        <div className="platform-row__icon"><Monitor size={18} /></div><div className="platform-row__name"><h3>{platform.name}</h3><span>{platform.target}</span></div><div className="platform-row__detail"><span className={`availability availability--${platform.primary ? "soon" : "planned"}`}><i /> {platform.status}</span><p>{platform.detail}</p></div><a className="platform-row__link" href={GITHUB_RELEASES} target="_blank" rel="noreferrer" aria-label={`Check ${platform.name} builds on GitHub Releases`}><ArrowUpRight size={17} /></a>
      </Reveal>)}
    </div></section>
    <section className="download-notice"><div className="download-notice__icon"><PackageOpen size={18} /></div><div><h2>No bundled downloads on this site</h2><p>Installers are distributed from Torque’s GitHub Releases page so that the version and platform asset stay connected to the source release. This page does not host or simulate downloadable files.</p></div><a href={GITHUB_RELEASES} target="_blank" rel="noreferrer">View releases <ArrowUpRight size={13} /></a></section>
    <section className="download-build"><div><span className="eyebrow">Prefer to build it yourself?</span><h2>Build from source.</h2><p>Use the desktop developer setup to compile Torque on your system.</p></div><div className="download-build__links"><Link className="button button--secondary" to="/docs/building-from-source">Build instructions <ArrowDown size={14} /></Link><a className="button button--quiet" href="https://github.com/0xPolybit/torque" target="_blank" rel="noreferrer"><GitBranch size={15} /> Source repository</a></div></section>
    <section className="download-legal"><CircleHelp size={15} /><p>Use BitTorrent to download and share content you are legally authorized to access. <Link to="/about">Read the legal-use note.</Link></p><span><Check size={12} /> Open-source license: MIT</span></section>
  </div>;
}
