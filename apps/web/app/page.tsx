import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      {/* ── LEFT ZONE ─────────────────────────────── */}
      <aside className={styles.left}>
        {/* Subtle grid texture */}
        <div className={styles.grid} aria-hidden="true" />

        <div className={styles.inner}>
          {/* Top border accent */}
          <div className={styles.topRule} />

          {/* Logo / Brand */}
          <header className={styles.logoZone}>
            <h1 className={styles.logoLine1}>Build</h1>
            <h1 className={styles.logoLine2}>Mindz</h1>
          </header>

          {/* Rule + Tagline */}
          <div className={styles.taglineBlock}>
            <div className={styles.ruleWrap}>
              <span className={styles.ruleFull} />
              <span className={styles.ruleAccent} />
            </div>
            <p className={styles.tagline}>Secure document signing system.</p>
          </div>

          {/* Metadata stats */}
          <div className={styles.metaBlock}>
            <div className={styles.metaRule} />
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>FORM</span>
                <span className={styles.metaVal}>Document<br />Architecture</span>
              </div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>SIGNAL</span>
                <span className={styles.metaVal}>Commitment<br />&amp; Authority</span>
              </div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>GROUND</span>
                <span className={styles.metaVal}>Ink on<br />Formal Surface</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className={styles.ctaBlock}>
            <a href="/auth/login" className={styles.ctaBtn}>
              Continue &nbsp;→
            </a>
          </div>

          {/* Footer identity */}
          <footer className={styles.footerLeft}>
            <p className={styles.footerLine1}>
              ESIGN PLATFORM · Document Intelligence · 2026
            </p>
            <p className={styles.footerLine2}>
              Identity &amp; Interface Direction — Studio Release
            </p>
          </footer>
        </div>

        {/* Divider ticks on right edge */}
        <div className={styles.dividerTicks} aria-hidden="true">
          {Array.from({ length: 48 }).map((_, i) => (
            <span key={i} className={styles.tick} />
          ))}
        </div>
      </aside>

      {/* ── RIGHT ZONE ────────────────────────────── */}
      <main className={styles.right}>
        {/* Top border */}
        <div className={styles.topRuleRight} />

        {/* Card stack */}
        <div className={styles.cardStack} aria-hidden="true">
          <div className={`${styles.card} ${styles.cardB1}`} />
          <div className={`${styles.card} ${styles.cardB2}`} />
          <div className={`${styles.card} ${styles.cardMid}`} />
          <div className={`${styles.card} ${styles.cardHero}`}>
            <div className={styles.cardContent}>
              <span className={styles.signText}>SIGN</span>
              <div className={styles.cardDivider} />
              <span className={styles.hereText}>HERE</span>

              {/* Ruled signature lines */}
              <div className={styles.ruledLines}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.ruleLine}>
                    <span className={styles.xMark}>×</span>
                    <span className={styles.ruleLineBar} />
                  </div>
                ))}
              </div>

              {/* Abstract signature strokes */}
              <svg
                className={styles.sigSvg}
                viewBox="0 0 400 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 30 Q45 12 75 26 Q115 6 145 20"
                  stroke="#6E6E6E" strokeWidth="2" strokeLinecap="round"
                />
                <path
                  d="M180 38 Q215 18 250 32 Q285 12 315 26"
                  stroke="#6E6E6E" strokeWidth="2" strokeLinecap="round"
                />
                <path
                  d="M18 78 Q60 58 100 72 Q148 50 188 64 Q225 44 262 58"
                  stroke="#5A5A5A" strokeWidth="1.5" strokeLinecap="round"
                />
                <path
                  d="M18 100 Q55 84 88 96 Q130 76 170 90"
                  stroke="#484848" strokeWidth="1" strokeLinecap="round"
                />
              </svg>

              {/* Pen schematic */}
              <svg
                className={styles.penSvg}
                viewBox="0 0 160 110"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line x1="20" y1="100" x2="130" y2="14" stroke="#D2D2D2" strokeWidth="5" strokeLinecap="round"/>
                <line x1="130" y1="14" x2="144" y2="0" stroke="#B8B8B8" strokeWidth="3" strokeLinecap="round"/>
                <path d="M0 108 Q16 128 38 142" stroke="#969696" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M18 116 Q34 136 56 148" stroke="#969696" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M36 122 Q52 142 74 154" stroke="#969696" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Dot matrix */}
        <div className={styles.dotMatrix} aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i} className={styles.dot} />
          ))}
        </div>

        {/* Right footer rule */}
        <div className={styles.footerRight}>
          <div className={styles.footerRightRule} />
          <p className={styles.footerRightLabel}>
            INK COVENANT — Visual System 01 · Form &amp; Authority
          </p>
        </div>
      </main>
    </div>
  );
}