import { ArrowLeft, ArrowRight, Check, CircleHelp, Link2 } from "lucide-react";
import { Navigate, Link, useParams } from "react-router-dom";
import { allDocs, findDoc, type DocBlock } from "../content/docs";
import { DocsLayout } from "../components/docs/DocsLayout";
import { CodeBlock } from "../components/docs/CodeBlock";
import { slugifyHeading } from "../lib/site";

function InlineText({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`") && part.endsWith("`")
    ? <code className="inline-code" key={`${part}-${index}`}>{part.slice(1, -1)}</code>
    : part)}</>;
}

function RenderBlock({ block }: { block: DocBlock }) {
  if (block.type === "paragraph") return <p><InlineText text={block.text} /></p>;
  if (block.type === "list") return <ul>{block.items.map((item) => <li key={item}><InlineText text={item} /></li>)}</ul>;
  if (block.type === "steps") return <ol className="docs-steps">{block.items.map((item) => <li key={item}><span><Check size={12} /></span><div><InlineText text={item} /></div></li>)}</ol>;
  if (block.type === "code") return <CodeBlock value={block.value} language={block.language} title={block.title} />;
  if (block.type === "note") return <aside className={`docs-note${block.tone === "warning" ? " docs-note--warning" : ""}`}><CircleHelp size={15} /><div><strong>{block.title}</strong><p><InlineText text={block.text} /></p></div></aside>;
  return <div className="docs-table-wrap"><table><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}><InlineText text={cell} /></td>)}</tr>)}</tbody></table></div>;
}

export function DocsPage() {
  const { slug } = useParams();
  const article = findDoc(slug);
  if (!article) return <Navigate to="/docs" replace />;
  const index = allDocs.findIndex((item) => item.slug === article.slug);
  const previous = allDocs[index - 1];
  const next = allDocs[index + 1];
  const anchors = article.sections.map((section) => ({ label: section.heading, id: slugifyHeading(section.heading) }));

  return <DocsLayout>
    <div className="docs-page">
      <article className="docs-article">
        <div className="docs-breadcrumb"><Link to="/docs">Documentation</Link><span>/</span><span>{article.group}</span></div>
        <header className="docs-article__header"><div className="docs-article__group">{article.group}</div><h1>{article.title}</h1><p>{article.description}</p></header>
        <div className="docs-article__body">{article.sections.map((section) => <section className="docs-section" key={section.heading} id={slugifyHeading(section.heading)}><h2>{section.heading}<a href={`#${slugifyHeading(section.heading)}`} className="docs-anchor" aria-label={`Link to ${section.heading}`}><Link2 size={15} /></a></h2>{section.blocks.map((block, blockIndex) => <RenderBlock key={`${section.heading}-${blockIndex}`} block={block} />)}</section>)}</div>
        <nav className="docs-prev-next" aria-label="Previous and next documentation pages">
          {previous ? <Link to={`/docs/${previous.slug}`} className="docs-prev-next__link"><ArrowLeft size={14} /><span><small>PREVIOUS</small><strong>{previous.title}</strong></span></Link> : <span />}
          {next ? <Link to={`/docs/${next.slug}`} className="docs-prev-next__link docs-prev-next__link--next"><span><small>NEXT</small><strong>{next.title}</strong></span><ArrowRight size={14} /></Link> : <Link to="/docs" className="docs-prev-next__link docs-prev-next__link--next"><span><small>FINISH</small><strong>Documentation home</strong></span><ArrowRight size={14} /></Link>}
        </nav>
      </article>
      <aside className="docs-toc" aria-label="On this page"><div className="docs-toc__label">ON THIS PAGE</div>{anchors.map((anchor) => <a key={anchor.id} href={`#${anchor.id}`}>{anchor.label}</a>)}<Link className="docs-toc__help" to="/docs/faq">Need help? <ArrowRight size={12} /></Link></aside>
    </div>
  </DocsLayout>;
}
