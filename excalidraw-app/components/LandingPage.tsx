import "../global.scss";
import "./LandingPage.scss";

type LandingPageProps = {
  onGetStarted: () => void;
  onLogin: () => void;
};

export const LandingPage = ({ onGetStarted, onLogin }: LandingPageProps) => {
  return (
    <div className="an-page landing">
      {/* Nav */}
      <nav className="landing__nav">
        <div className="landing__nav-inner">
          <div className="landing__nav-brand">
            <div className="landing__logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <span className="landing__nav-title">Aladdin Notes</span>
          </div>
          <div className="landing__nav-actions">
            <button className="an-btn an-btn--ghost" onClick={onLogin}>
              Log in
            </button>
            <button className="an-btn an-btn--primary" onClick={onGetStarted}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing__hero">
        <div className="landing__hero-inner">
          <div className="landing__badge">
            <span className="landing__badge-dot" />
            Free &amp; Open Source
          </div>
          <h1 className="landing__hero-title">
            Sketch your ideas,<br />
            <span className="landing__hero-accent">save them to the cloud.</span>
          </h1>
          <p className="landing__hero-desc">
            A beautiful whiteboard app for brainstorming, wireframing, and visual thinking.
            Create drawings, organize them in folders, and access them from anywhere.
          </p>
          <div className="landing__hero-actions">
            <button className="an-btn an-btn--primary an-btn--lg" onClick={onGetStarted}>
              Start Drawing — It's Free
            </button>
            <button className="an-btn an-btn--outline an-btn--lg" onClick={onLogin}>
              Log in to your account
            </button>
          </div>
        </div>
        <div className="landing__hero-visual">
          <div className="landing__hero-mockup">
            <div className="landing__mockup-bar">
              <span /><span /><span />
            </div>
            <div className="landing__mockup-body">
              <svg viewBox="0 0 600 340" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="40" y="60" width="180" height="120" rx="12" stroke="#19789E" strokeWidth="2" strokeDasharray="6 4" />
                <rect x="60" y="80" width="140" height="20" rx="4" fill="#E0F4F8" />
                <rect x="60" y="110" width="100" height="12" rx="3" fill="#F0F0F1" />
                <rect x="60" y="130" width="120" height="12" rx="3" fill="#F0F0F1" />
                <circle cx="380" cy="120" r="60" stroke="#19789E" strokeWidth="2" />
                <line x1="340" y1="80" x2="420" y2="160" stroke="#19789E" strokeWidth="1.5" strokeDasharray="4 3" />
                <path d="M260 250 Q350 200 440 260" stroke="#6B7280" strokeWidth="2" fill="none" />
                <rect x="100" y="230" width="100" height="70" rx="8" fill="#E0F4F8" stroke="#19789E" strokeWidth="1" />
                <text x="120" y="270" fontSize="11" fill="#19789E" fontFamily="IBM Plex Sans">Notes</text>
                <circle cx="500" cy="80" r="8" fill="#19789E" opacity="0.3" />
                <circle cx="520" cy="260" r="12" fill="#E0F4F8" />
                <path d="M480 180 L510 160 L540 190" stroke="#6B7280" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing__features">
        <div className="landing__features-inner">
          <h2 className="landing__section-title">Everything you need to think visually</h2>
          <p className="landing__section-desc">
            Simple, fast, and organized — your whiteboard, your way.
          </p>
          <div className="landing__features-grid">
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
              </div>
              <h3>Infinite Canvas</h3>
              <p>Draw freely with shapes, text, arrows, and freehand tools on an infinite whiteboard.</p>
            </div>
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                </svg>
              </div>
              <h3>Cloud Storage</h3>
              <p>Save your drawings to the cloud and access them from any device, anytime.</p>
            </div>
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3>Folder Organization</h3>
              <p>Keep your work tidy with nested folders. Move drawings between projects effortlessly.</p>
            </div>
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Real-time Collaboration</h3>
              <p>Work together in real-time with your team. Share a link and start collaborating instantly.</p>
            </div>
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Secure &amp; Private</h3>
              <p>Your data is encrypted and stored securely. Only you can access your drawings.</p>
            </div>
            <div className="landing__feature-card">
              <div className="landing__feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <h3>Export Anywhere</h3>
              <p>Export your drawings as PNG, SVG, or share them with a unique link.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing__cta">
        <div className="landing__cta-inner">
          <h2>Ready to start drawing?</h2>
          <p>Create your free account and start sketching in seconds.</p>
          <button className="an-btn an-btn--primary an-btn--lg" onClick={onGetStarted}>
            Get Started for Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <span>© {new Date().getFullYear()} Aladdin Notes. Built with Excalidraw.</span>
        </div>
      </footer>
    </div>
  );
};
