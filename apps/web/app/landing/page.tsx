import styles from './landing.module.css'

const features = [
  {
    icon: 'pdf',
    title: 'Upload and sign PDFs instantly',
    copy: 'Drop in a contract, place your signature, and send it out in a flow that feels familiar from the first click.',
  },
  {
    icon: 'wallet',
    title: 'x402 payments built into signing',
    copy: 'Each paid signature can be requested, verified, and recorded through an HTTP-native x402 payment flow.',
  },
  {
    icon: 'team',
    title: 'Team collaboration',
    copy: 'Share documents, assign signers, and keep everyone aligned with clear document access states.',
  },
  {
    icon: 'vault',
    title: 'Secure document storage',
    copy: 'Keep signed agreements organized with encrypted storage, activity history, and simple retrieval.',
  },
  {
    icon: 'chain',
    title: 'Smart contract verification',
    copy: 'Every signed document gets a tamper-evident verification trail that can be checked on-chain.',
  },
  {
    icon: 'wallet',
    title: 'MetaMask on Base',
    copy: 'Connect a wallet, review the exact signing fee, and approve payment without a separate checkout page.',
  },
]

const trustCards = [
  {
    title: 'Payment proof per signature',
    copy: 'Paid signing actions are tied to a recorded x402 payment attempt, so the business logic stays auditable from day one.',
  },
  {
    title: 'Document hash verification',
    copy: 'SignHere can verify document integrity without putting the private PDF itself on-chain.',
  },
  {
    title: 'Clear wallet consent',
    copy: 'Users see the action, network, and amount before approving a wallet transaction.',
  },
  {
    title: 'Team access controls',
    copy: 'Team subscriptions can support invite codes so owners decide who joins the workspace.',
  },
]

const plans = [
  {
    name: 'Individual',
    price: '0.000091 ETH',
    cadence: 'per signed PDF',
    copy: 'Best for solo users who want to pay only when they complete a signature.',
    bullets: ['No monthly commitment', 'x402 payment per signature', 'Document hash verification'],
  },
  {
    name: 'Team',
    price: 'Subscription',
    cadence: 'for shared workspaces',
    copy: 'Best for teams that want one owner to manage access and signing coverage.',
    bullets: ['Owner-paid workspace', 'Shareable registration codes', 'Members sign under team access'],
  },
]

function Icon({ name }: { name: string }) {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 30 30',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  }

  if (name === 'wallet') {
    return (
      <svg {...common}>
        <path d="M6 9.5h16.5a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-12A2.5 2.5 0 0 1 5.5 6H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20.5 15.5h5v4h-5a2 2 0 0 1 0-4Z" fill="currentColor" opacity=".22" />
        <path d="M21.25 17.5h.1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'team') {
    return (
      <svg {...common}>
        <path d="M11.5 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill="currentColor" opacity=".2" />
        <path d="M11.5 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 24c.6-4.3 3.3-6.5 7.5-6.5s6.9 2.2 7.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 14.2a3.5 3.5 0 1 0-1.1-6.8M19.5 17.8c3.4.3 5.6 2.4 6.1 6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'vault') {
    return (
      <svg {...common}>
        <rect x="5" y="7" width="20" height="17" rx="4" fill="currentColor" opacity=".16" />
        <rect x="5" y="7" width="20" height="17" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M10 7V5.5A4.5 4.5 0 0 1 14.5 1h1A4.5 4.5 0 0 1 20 5.5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M15 14v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="15" cy="13" r="2" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'chain') {
    return (
      <svg {...common}>
        <path d="M12.2 10.2 9.8 7.8a4.5 4.5 0 0 0-6.4 6.4l3 3a4.5 4.5 0 0 0 6.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="m17.8 19.8 2.4 2.4a4.5 4.5 0 0 0 6.4-6.4l-3-3a4.5 4.5 0 0 0-6.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="m11.5 18.5 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M8 3h10l6 6v18H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".14" />
      <path d="M8 3h10l6 6v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 3v7h6M10 16h10M10 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main className={styles.landing} id="top">
      <nav className={styles.navbar} aria-label="Primary navigation">
        <div className="container">
          <div className={styles.navShell}>
            <a className={styles.navCta} href="/sign">Sign Now</a>
            <a className={styles.brand} href="#top" aria-label="SignHere home">
              <img src="/main_logo.png" alt="" width="42" height="42" />
              <span>SignHere</span>
            </a>
            <div className={styles.navLinks}>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#docs">Docs</a>
              <a href="/auth/login">Login</a>
            </div>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.meshOne} aria-hidden="true" />
        <div className={styles.meshTwo} aria-hidden="true" />
        <div className="container">
          <div className="row align-items-center gy-5">
            <div className="col-12 col-lg-6">
              <p className={styles.eyebrow}>The easiest way to sign documents on-chain</p>
              <h1>Sign Documents Smarter, Not Harder</h1>
              <p className={styles.heroCopy}>
                Secure, fast, and blockchain-powered e-signatures for individuals and teams.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryButton} href="/sign">Start Signing</a>
                <a className={styles.secondaryButton} href="/auth/login">Connect Wallet</a>
              </div>
              <div className={styles.heroNotes} aria-label="Product highlights">
                <span>Takes less than 30 seconds</span>
                <span>Create account for security</span>
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className={styles.heroVisual}>
                <div className={styles.documentFloat}>
                  <div className={styles.docTop}>
                    <span>Service Agreement.pdf</span>
                    <b>Ready</b>
                  </div>
                  <div className={styles.docLines}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.signatureBox}>
                    <span>Place signature</span>
                    <svg viewBox="0 0 260 64" aria-hidden="true">
                      <path d="M9 42c23-30 38-30 45-3 5 19 24 12 39-10 17-25 33-23 28 3-5 25 32 16 128-17" />
                    </svg>
                  </div>
                </div>
                <img className={styles.mascot} src="/main_logo.png" alt="Cute SignHere octopus mascot holding a pen" />
                <div className={styles.verifyBadge}>
                  <span className={styles.pulseDot} />
                  Verified on Base
                </div>
                <div className={styles.walletPill}>0x8f...42A connected</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className="container">
          <div className="row align-items-center gy-4">
            <div className="col-12 col-lg-5">
              <p className={styles.sectionKicker}>Product Preview</p>
              <h2>A calm dashboard for real signing work</h2>
              <p className={styles.sectionCopy}>
                See documents, payments, signers, and verification status in one simple workspace.
              </p>
            </div>
            <div className="col-12 col-lg-7">
              <div className={styles.dashboardMock}>
                <div className={styles.dashboardTop}>
                  <div>
                    <strong>Documents</strong>
                    <span>Team workspace</span>
                  </div>
                  <div className={styles.connected}>Wallet connected</div>
                </div>
                <div className="row g-3">
                  <div className="col-12 col-md-7">
                    <div className={styles.docList}>
                      {['Creator agreement', 'Rental addendum', 'Invoice approval'].map((item, index) => (
                        <div className={styles.docRow} key={item}>
                          <div>
                            <b>{item}</b>
                            <span>{index === 0 ? '2 signers waiting' : index === 1 ? 'Signed 12 minutes ago' : 'Hash pending'}</span>
                          </div>
                          <em className={index === 0 ? styles.pending : styles.signed}>{index === 0 ? 'Pending' : index === 1 ? 'Signed' : 'Verify'}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-12 col-md-5">
                    <div className={styles.activityCard}>
                      <span>Activity</span>
                      <div className={styles.timeline}>
                        <i />
                        <p>Wallet approved payment</p>
                      </div>
                      <div className={styles.timeline}>
                        <i />
                        <p>Signature added to page 4</p>
                      </div>
                      <div className={styles.timeline}>
                        <i />
                        <p>Hash queued for Base</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.emptyState}>
                  <img src="/main_logo.png" alt="" width="44" height="44" />
                  <span>No documents yet. Your signature assistant is ready.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="features">
        <div className="container">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionKicker}>Core Features</p>
            <h2>Crypto-native without the crypto headache</h2>
            <p>Clear signing, simple payments, and blockchain verification that feels safe and familiar.</p>
          </div>
          <div className="row g-4">
            {features.map((feature) => (
              <div className="col-12 col-md-6 col-xl-4" key={feature.title}>
                <article className={styles.featureCard}>
                  <span className={styles.featureIcon}><Icon name={feature.icon} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.flowSection} id="docs">
        <div className="container">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionKicker}>Interactive UX</p>
            <h2>You already know how to use it</h2>
            <p>Upload, sign, connect, and verify. Each step keeps blockchain complexity out of the way.</p>
          </div>
          <div className="row g-4 align-items-stretch">
            <div className="col-12 col-lg-4">
              <div className={styles.flowCard}>
                <span className={styles.flowStep}>Step 1</span>
                <div className={styles.dropZone}>
                  <Icon name="pdf" />
                  <b>Drop PDF here</b>
                  <small>or browse from your device</small>
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4">
              <div className={styles.flowCard}>
                <span className={styles.flowStep}>Step 2</span>
                <div className={styles.signatureUi}>
                  <div className={styles.paperLine} />
                  <div className={styles.paperLineShort} />
                  <div className={styles.placeBox}>
                    <span>Signature</span>
                    <svg viewBox="0 0 210 54" aria-hidden="true">
                      <path d="M6 35c23-25 38-25 45 0 4 15 21 12 34-9 14-21 29-20 27 1-3 22 30 16 91-11" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4">
              <div className={styles.flowCard}>
                <span className={styles.flowStep}>Step 3</span>
                <div className={styles.walletModal}>
                  <div className={styles.walletHeader}>
                    <Icon name="wallet" />
                    <b>MetaMask</b>
                  </div>
                  <div className={styles.walletRow}><span>Network</span><b>Base</b></div>
                  <div className={styles.walletRow}><span>Signing fee</span><b>0.000091 ETH</b></div>
                  <button type="button">Confirm and sign</button>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.progressRail} aria-label="Signing progress preview">
            <span className={styles.progressActive}>Upload</span>
            <span className={styles.progressActive}>Place signature</span>
            <span className={styles.progressActive}>Connect wallet</span>
            <span>Verified</span>
          </div>
        </div>
      </section>

      <section className={styles.trustSection}>
        <div className="container">
          <div className="row align-items-center gy-4">
            <div className="col-12 col-lg-5">
              <p className={styles.sectionKicker}>Powered by blockchain security</p>
              <h2>Trust users can verify from day one</h2>
              <p className={styles.sectionCopy}>
                No inflated startup metrics. Just clear product mechanics users can inspect: payment proof, document hashes, wallet consent, and controlled team access.
              </p>
            </div>
            <div className="col-12 col-lg-7">
              <div className="row g-3">
                {trustCards.map((card) => (
                  <div className="col-12 col-md-6" key={card.title}>
                    <div className={styles.trustCard}>
                      <b>{card.title}</b>
                      <span>{card.copy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-12 col-lg-10">
              <div className={styles.ctaPanel}>
                <img src="/main_logo.png" alt="" width="92" height="92" />
                <p className={styles.sectionKicker}>Simple pricing model</p>
                <h2>Pay per signature, or bring the team</h2>
                <p>
                  Individual users pay only when they sign. Teams get a shared workspace with owner-managed access and registration codes.
                </p>
                <div className={styles.planGrid}>
                  {plans.map((plan) => (
                    <article className={styles.planCard} key={plan.name}>
                      <div>
                        <h3>{plan.name}</h3>
                        <strong>{plan.price}</strong>
                        <span>{plan.cadence}</span>
                      </div>
                      <p>{plan.copy}</p>
                      <ul>
                        {plan.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                <div className={styles.heroActions}>
                  <a className={styles.primaryButton} href="/sign">Start Signing</a>
                  <a className={styles.secondaryButton} href="/auth/login">Connect Wallet</a>
                </div>
                <div className={styles.successState}>Signed successfully. Verification hash saved.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerShell}>
            <a className={styles.footerBrand} href="#top">
              <img src="/main_logo.png" alt="" width="36" height="36" />
              SignHere
            </a>
            <div>
              <a href="#docs">Docs</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
