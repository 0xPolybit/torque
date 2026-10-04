import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { findDoc } from "../../content/docs";

const pageSeo: Record<string, { title: string; description: string }> = {
  "/": { title: "Torque — Downloads, without the clutter", description: "A thoughtful desktop BitTorrent client. Inspect every file before you download." },
  "/features": { title: "Features — Torque", description: "Inspect torrent contents, choose individual files, manage a queue, and keep transfer details close at hand." },
  "/download": { title: "Download Torque", description: "Find Torque desktop builds and release information for Windows, macOS, and Linux." },
  "/docs": { title: "Documentation — Torque", description: "Get started with Torque, learn its torrent workflow, and find detailed settings and troubleshooting guides." },
  "/changelog": { title: "Changelog — Torque", description: "Follow Torque's development from torrent inspection to selective file downloads and queue management." },
  "/about": { title: "About — Torque", description: "Why we are building a clear, user-controlled desktop client for authorized BitTorrent downloads." },
};

function setMeta(selector: string, value: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    const [, attribute, name] = selector.match(/^meta\[(name|property)="([^"]+)"\]$/) ?? [];
    if (!attribute || !name) return;
    meta = document.createElement("meta");
    meta.setAttribute(attribute, name);
    document.head.append(meta);
  }
  meta.setAttribute("content", value);
}

export function Seo({ path }: { path: string }) {
  const location = useLocation();
  const doc = path.startsWith("/docs/") ? findDoc(path.slice("/docs/".length)) : undefined;
  const page = pageSeo[path] ?? (path.startsWith("/docs/")
    ? doc
      ? { title: `${doc.title} — Torque Docs`, description: doc.description }
      : { title: "Page not found — Torque", description: "This page could not be found." }
    : { title: "Page not found — Torque", description: "This page could not be found." });

  useEffect(() => {
    document.title = page.title;
    setMeta('meta[name="description"]', page.description);
    setMeta('meta[property="og:title"]', page.title);
    setMeta('meta[property="og:description"]', page.description);
    setMeta('meta[property="og:url"]', `${window.location.origin}${location.pathname}`);
    setMeta('meta[property="og:image"]', `${window.location.origin}/og-image.svg`);
    setMeta('meta[name="twitter:title"]', page.title);
    setMeta('meta[name="twitter:description"]', page.description);
    setMeta('meta[name="twitter:image"]', `${window.location.origin}/og-image.svg`);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = window.location.href;
  }, [location.pathname, page.title, page.description]);

  return null;
}
