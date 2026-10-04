import { ArrowUpRight, GitCommitHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { GITHUB_REPOSITORY } from "../lib/site";
import { Reveal } from "../components/ui/Reveal";

const milestones = [
  { id: "83f3dee", title: "Queue and bandwidth controls", summary: "Persisted queue order, concurrency scheduling, session-wide download/upload caps, tray handling, and keyboard shortcuts.", type: "Transfer management", current: true },
  { id: "e078e99", title: "Torrent preflight checks", summary: "Duplicate detection, destination space estimates, file type summaries, executable notices, and safe path validation.", type: "Pre-download checks" },
  { id: "282f243", title: "Torrent details view", summary: "A dedicated view for overview, files, peers, trackers, and metainfo, using engine values where available.", type: "Inspection" },
  { id: "2635c51", title: "Browse results and search history", summary: "A compact Browse experience with source details, recent searches, and an inspect-first handoff.", type: "Discovery" },
  { id: "f2ad28a", title: "Authorized content discovery", summary: "A Rust provider interface and Internet Archive adapter for items with supported open-license metadata.", type: "Discovery" },
  { id: "9cec568", title: "Selective file downloads", summary: "Choose torrent files and folders before starting; update selections later where the engine allows it.", type: "File selection" },
  { id: "c60ed31", title: "Inspect before downloading", summary: "Resolve metainfo for supported torrent inputs before content transfer begins.", type: "Torrent preview" },
];

export function ChangelogPage() {
  return <div className="page-width changelog-page">
    <section className="page-intro"><span className="eyebrow">Project history</span><h1>Built in the open.</h1><p>Milestones below are linked to commits in the repository. They describe source history; they are not a substitute for tagged release notes.</p></section>
    <div className="changelog-meta"><span className="changelog-meta__dot" /> Current source milestones <a href={`${GITHUB_REPOSITORY}/commits/main`} target="_blank" rel="noreferrer">View commit history <ArrowUpRight size={13} /></a></div>
    <section className="timeline" aria-label="Torque source history">{milestones.map((item, index) => <Reveal className="timeline-item" delay={index * 25} key={item.id}>
      <div className="timeline-item__track"><span className={item.current ? "is-current" : ""}><GitCommitHorizontal size={15} /></span>{index < milestones.length - 1 && <i />}</div><article className="timeline-item__content"><div className="timeline-item__meta"><span>{item.type}</span>{item.current && <span className="timeline-current">Latest app milestone</span>}<a href={`${GITHUB_REPOSITORY}/commit/${item.id}`} target="_blank" rel="noreferrer">{item.id} <ArrowUpRight size={11} /></a></div><h2>{item.title}</h2><p>{item.summary}</p></article>
    </Reveal>)}</section>
    <section className="changelog-release-note"><p>Release dates, tagged release notes, and packaged download assets are linked from GitHub when published. This timeline follows the source commits behind the desktop application.</p><Link className="text-link" to="/download">Check download availability <ArrowUpRight size={13} /></Link></section>
  </div>;
}
