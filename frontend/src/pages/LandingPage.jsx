import { Link } from 'react-router-dom';

/* Introduces the Victoria relocation journey, discloses the landing image credit, and routes the primary action to preferences. */
export default function LandingPage() {
  return (
    <section className="landing page-shell">
      <div className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">REGIONAL VICTORIA · 2050</p>
          <h1>
            <span>Thinking about leaving Melbourne?</span>
            <span>See where you&apos;d actually land.</span>
          </h1>
          <p className="lead">Compare regional towns on jobs, housing and who lives there - as they are today, and where they&apos;re heading by 2050.</p>
          <div className="landing-actions">
            <Link className="button primary" to="/preferences">Find my region</Link>
          </div>
        </div>

        {/* Decorative hero photography is intentionally hidden on mobile to keep the opening content concise. */}
        <figure className="landing-visual">
          <img src="/images/victoria-coast.jpg" alt="The Twelve Apostles on Victoria's Great Ocean Road" />
          <span className="image-location">Port Campbell National Park · Victoria</span>
          <figcaption>
            Photo by <a href="https://commons.wikimedia.org/wiki/File:The_Twelve_Apostles,_The_Great_Ocean_Road,_Victoria,_Australia.jpg" target="_blank" rel="noreferrer">Jess Miller</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
