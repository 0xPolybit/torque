import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <section className="not-found page-width"><div className="not-found__mark"><Compass size={20} /></div><h1>This page isn’t here.</h1><p>The address may have changed, or the link may be out of date.</p><Link className="button button--secondary" to="/"><ArrowLeft size={14} /> Back to Torque</Link></section>;
}
