import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/* Presents a semantic 404 state for unmatched client routes and offers recovery links to the home and preference entry points. */
export default function NotFoundPage() {
  return (
    <section className="not-found-page page-shell" aria-labelledby="not-found-heading">
      <div className="not-found-card">
        <p className="not-found-code" aria-hidden="true">404</p>
        <p className="eyebrow">PAGE NOT FOUND</p>
        <h1 id="not-found-heading">We couldn&apos;t find that page.</h1>
        <p className="not-found-message">
          The address may be incorrect, or the page may have moved. Check the URL or return to a known page.
        </p>
        <div className="not-found-actions">
          <Link className="button primary" to="/">
            <Home aria-hidden="true" size={18} />
            Return home
          </Link>
          <Link className="button secondary" to="/explore">
            <ArrowLeft aria-hidden="true" size={18} />
            Explore regions
          </Link>
        </div>
      </div>
    </section>
  );
}
