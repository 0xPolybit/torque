import type { ReactNode } from "react";

export function SectionHeading({ title, children, align = "left", action }: { title: string; children?: ReactNode; align?: "left" | "center"; action?: ReactNode }) {
  return <div className={`section-heading section-heading--${align}`}><div><h2>{title}</h2>{children && <p>{children}</p>}</div>{action}</div>;
}
