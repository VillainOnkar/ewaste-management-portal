import { useState } from 'react';

function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.5 4.5c-7.7.1-12.4 2.4-13.8 7.1-.9 3 .9 5.3 3.7 5.3 5.5 0 8.8-5.3 10.1-12.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4.5 20c2.2-4.8 5.5-7.6 10-9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon({ admin = false }) {
  return admin ? (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3 27 7v8c0 7-4.7 11.5-11 14-6.3-2.5-11-7-11-14V7l11-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m11.5 16 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="10" r="6" fill="currentColor" />
      <path d="M5 28c.4-6 4.7-9 11-9s10.6 3 11 9H5Z" fill="currentColor" />
    </svg>
  );
}

function RecyclingIllustration() {
  return (
    <svg className="login-illustration" viewBox="0 0 300 260" fill="none" aria-hidden="true">
      <path d="M22 214c43-15 62-8 99 6 47 18 75 4 112-9 24-9 44-9 67-3v52H22v-46Z" fill="#b9e49d" />
      <path d="M0 232c39-12 59-7 94 7 38 16 74 12 117-4 36-13 57-11 89 0v25H0v-28Z" fill="#7cbe6c" />
      <path d="m93 93 8-40 66 12-8 40-66-12Z" fill="#263d42" stroke="#d8e5dd" strokeWidth="4" strokeLinejoin="round" />
      <path d="m111 111 12-43 55 15-12 42-55-14Z" fill="#527985" stroke="#e5eee7" strokeWidth="4" strokeLinejoin="round" />
      <path d="m162 105 34-25 31 39-34 25-31-39Z" fill="#394d53" stroke="#d8e5dd" strokeWidth="4" strokeLinejoin="round" />
      <path d="m65 128 17-14 43 48-17 14-43-48Z" fill="#cbd8d0" stroke="#eaf2ec" strokeWidth="3" strokeLinejoin="round" />
      <path d="M77 140h146l-12 99H89l-12-99Z" fill="#11945b" />
      <path d="M67 135h166v17H67v-17Z" fill="#087648" />
      <text x="150" y="211" fill="white" fontFamily="Arial, sans-serif" fontSize="58" textAnchor="middle">♻︎</text>
      <path d="M45 240c1-25 14-41 29-52M252 235c-1-31 12-48 27-61" stroke="#3d9b55" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 203c-15-4-22-14-22-28 16 2 25 10 27 25m228-39c-2-17 4-29 19-37 4 16-2 29-16 39" fill="#72ba65" />
      <path d="M40 213c-15-8-21-19-18-34 14 6 21 16 21 31m228-47c-1-17 5-28 19-36 3 16-3 28-17 38" fill="#a4d98b" />
    </svg>
  );
}

function LoginPage({ onLogin, onRegister, authError, registrationNotice = '', inviteCode = '' }) {
  const [registrationChoicesOpen, setRegistrationChoicesOpen] = useState(false);
  return (
    <>
    <main className="login-page">
      <header className="login-header">
        <a className="login-brand" href="/" aria-label="GreenLoop home">
          <span className="login-brand-mark"><LeafMark /></span>
          <span><strong>GreenLoop</strong><small>E-Waste Management Portal</small></span>
        </a>
        <div className="login-motto"><LeafMark /><span>Reduce</span><i /> <span>Recycle</span><i /> <span>Restore</span></div>
        <button className="login-header-register" type="button" onClick={() => setRegistrationChoicesOpen(true)}>New user? <strong>Create account</strong></button>
      </header>

      <div className="login-layout">
        <section className="login-intro">
          <h1>Together for a <strong>Greener Tomorrow</strong></h1>
          <p>Responsible e-waste management for a cleaner, healthier and sustainable future.</p>
          <RecyclingIllustration />
        </section>

        <section className="login-choice-panel" aria-labelledby="login-heading">
          <span className="login-panel-leaf"><LeafMark /></span>
          <h2 id="login-heading">Welcome Back</h2>
          <p className="login-panel-description">Choose your login type to continue</p>
          {authError && <p className="login-error" role="alert">{authError}</p>}
          {registrationNotice && <p className="login-success-note" role="status">{registrationNotice}</p>}
          <div className="login-role-cards">
            <article className="login-role-card customer-card">
              <span className="login-role-icon"><AccountIcon /></span>
              <h3>Customer Login</h3>
              <p>For customers who want to book pickups, track requests and manage their e-waste.</p>
              <button className="login-role-button" type="button" onClick={() => onLogin('customer')}>Login as Customer <span aria-hidden="true">→</span></button>
            </article>
            <article className="login-role-card admin-card">
              <span className="login-role-icon"><AccountIcon admin /></span>
              <h3>Admin Login</h3>
              <p>For administrators to manage users, requests, collectors and overall operations.</p>
              <button className="login-role-button" type="button" onClick={() => onLogin('admin')}>Login as Admin <span aria-hidden="true">→</span></button>
            </article>
          </div>
          <p className="login-help"><span />Not sure? Contact your administrator<span /></p>
          <a className="login-home-link" href="/home">Learn about GreenLoop</a>
        </section>

        <aside className="login-benefits" aria-label="GreenLoop benefits">
          <div><span className="benefit-badge"><LeafMark /></span><p>Recycle<br />E-Waste</p></div>
          <div><span className="benefit-badge"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 8 3v6c0 5.1-3.4 8.5-8 11-4.6-2.5-8-5.9-8-11V5l8-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span><p>Protect<br />Environment</p></div>
          <div><span className="benefit-badge"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M3.5 12h17M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z" stroke="currentColor" strokeWidth="1.7" /></svg></span><p>Build a<br />Sustainable Future</p></div>
        </aside>
      </div>
    </main>
    {registrationChoicesOpen && <div className="registration-choice-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setRegistrationChoicesOpen(false)}>
      <section className="registration-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-choice-title">
        <button className="auth-close" type="button" aria-label="Close registration options" onClick={() => setRegistrationChoicesOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <p className="eyebrow"><span className="eyebrow-dot" />Join GreenLoop</p>
        <h2 id="registration-choice-title">Choose account type</h2>
        <p>Customers and additional admins need an invite code. The first admin uses the configured project email.</p>
        {inviteCode && <p className="invite-ready-note" role="status">Admin invite link detected. Choose the matching account type.</p>}
        <button className="registration-choice-button customer-choice" type="button" onClick={() => { setRegistrationChoicesOpen(false); onRegister('customer'); }}>Register as Customer <span aria-hidden="true">→</span></button>
        <button className="registration-choice-button admin-choice" type="button" onClick={() => { setRegistrationChoicesOpen(false); onRegister('admin'); }}>Register as Admin <span aria-hidden="true">→</span></button>
      </section>
    </div>}
    </>
  );
}

export default LoginPage;
