import { useEffect, useState } from 'react';
import AuthDialog from '../components/AuthDialog';
import ChatWidget from '../components/ChatWidget';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import LoginPage from './LoginPage';
import AdminDashboardPage from './AdminDashboardPage';
import BookPickupPage from './BookPickupPage';
import DashboardPage from './DashboardPage';
import { readRecord } from '../services/databaseService';
import { auth, isFirebaseConfigured } from '../services/firebase';
import { completeVerifiedAdminInvite, hasAdminClaim, logout, observeAuthState } from '../services/authService';

const adminRoutes = ['/admin', '/admin/requests', '/admin/users', '/admin/invites', '/admin/collectors', '/admin/centers', '/admin/reports'];

const categories = [
  { name: 'Mobile Phones', icon: 'phone', description: 'Old phones, tablets, chargers, and small mobile devices.' },
  { name: 'Laptops', icon: 'laptop', description: 'Laptops, notebooks, and their power adapters.' },
  { name: 'Computers', icon: 'computer', description: 'Desktops, monitors, keyboards, and computer parts.' },
  { name: 'Batteries', icon: 'battery', description: 'Rechargeable and household batteries, handled with care.' },
  { name: 'Printers', icon: 'printer', description: 'Printers, scanners, cables, and empty cartridges.' },
  { name: 'Accessories', icon: 'accessories', description: 'Cables, routers, headphones, and other small electronics.' },
];

const benefits = [
  ['Recover valuable materials', 'Keep reusable metals and components in circulation instead of sending them to landfill.'],
  ['Protect people and the planet', 'Responsible processing helps prevent harmful materials from entering soil and water.'],
  ['Make reuse the first choice', 'Working devices and usable parts can find a second life through the right channels.'],
];

function ArrowIcon() {
  return <svg className="button-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CategoryIcon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    phone: <><rect x="7" y="2.8" width="10" height="18.4" rx="2" {...common} /><path d="M10 5.5h4M11 18.2h2" {...common} /></>,
    laptop: <><rect x="5" y="4" width="14" height="12" rx="1.5" {...common} /><path d="M2.8 19h18.4l-1.4-3H4.2l-1.4 3Z" {...common} /></>,
    computer: <><rect x="3" y="3.5" width="18" height="13" rx="1.5" {...common} /><path d="M12 16.5v4m-4 0h8M7 7.5h10" {...common} /></>,
    battery: <><rect x="4" y="7" width="16" height="11" rx="2" {...common} /><path d="M20 10h1.5v5H20M11 9.5l-2 3h3l-1 3 4-4h-3l1-2Z" {...common} /></>,
    printer: <><path d="M7 8V3.5h10V8M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" {...common} /><path d="M7 14h10v6.5H7zM17 11.5h.01" {...common} /></>,
    accessories: <><path d="M7 7V4a2 2 0 0 1 4 0v3m2 0V4a2 2 0 0 1 4 0v3M5 7h14v5a7 7 0 0 1-14 0V7Z" {...common} /><path d="M12 19v2" {...common} /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function SectionHeading({ eyebrow, title, description }) {
  return <div className="section-heading"><p className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>;
}

function HomePage() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname.replace(/\/$/, '') || '/');
  const [formMessage, setFormMessage] = useState('');
  const [authMode, setAuthMode] = useState(() => new URLSearchParams(window.location.search).get('register') === '1' ? 'register' : null);
  const [authAccountType, setAuthAccountType] = useState(() => new URLSearchParams(window.location.search).get('type') === 'admin' ? 'admin' : 'customer');
  const inviteCode = new URLSearchParams(window.location.search).get('invite') || '';
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminCheckFor, setAdminCheckFor] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [authError, setAuthError] = useState('');
  const [registrationNotice, setRegistrationNotice] = useState('');
  const isAccountRoute = ['/dashboard', '/book-pickup', '/track-request', '/history'].includes(currentPath);
  const isAdminRoute = adminRoutes.includes(currentPath);
  const isProtectedRoute = isAccountRoute || isAdminRoute;
  const currentAdminCheckKey = currentUser ? `${currentUser.uid}:${currentPath}` : '';
  const adminCheckIsCurrent = Boolean(currentAdminCheckKey && adminCheckFor === currentAdminCheckKey);
  const authorizedAdmin = isAdmin && adminCheckIsCurrent && !adminLoading;

  const openAuth = (mode, accountType = 'customer') => {
    setAuthAccountType(accountType);
    setAuthMode(mode);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('completeAdminInvite') !== '1') return undefined;

    let active = true;
    completeVerifiedAdminInvite({
      code: params.get('invite') || '',
      email: params.get('email') || '',
      username: params.get('username') || '',
    })
      .then(async () => {
        if (!active) return;
        window.history.replaceState({}, '', '/');
        const signedInUser = auth?.currentUser;
        if (signedInUser?.email?.toLowerCase() === params.get('email')?.toLowerCase()) {
          await signedInUser.getIdToken(true);
          if (!active) return;
          window.history.replaceState({}, '', '/admin');
          setCurrentPath('/admin');
          setAuthMode(null);
          return;
        }
        setRegistrationNotice('Email verified and admin account activated. Sign in with your new admin email and password.');
        setAuthAccountType('admin');
        setAuthMode('login');
      })
      .catch((error) => {
        if (!active) return;
        window.history.replaceState({}, '', '/');
        setAuthError(error.message || 'Could not finish admin registration from this verification link.');
        setAuthAccountType('admin');
        setAuthMode('login');
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = observeAuthState(
      async (user) => {
        if (!active) return;
        if (!user || authMode) {
          setCurrentUser(user);
          setAuthLoading(false);
          return;
        }

        try {
          const profile = await readRecord(`users/${user.uid}`);
          if (!active) return;
          if (!profile) {
            await logout();
            if (!active) return;
            setCurrentUser(null);
            setAuthError('This account has been deleted. Please contact your administrator if you think this is a mistake.');
          } else {
            setCurrentUser(user);
          }
        } catch {
          if (!active) return;
          setCurrentUser(user);
          setAuthError('We couldn’t verify your account profile. Check your connection and try again.');
        }
        if (active) setAuthLoading(false);
      },
      (error) => {
        if (!active) return;
        setAuthError(error.message);
        setAuthLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authMode]);

  useEffect(() => {
    let active = true;
    if (!currentUser) {
      setIsAdmin(false);
      setAdminCheckFor('');
      setAdminLoading(false);
      return () => { active = false; };
    }

    const checkKey = `${currentUser.uid}:${currentPath}`;
    setAdminLoading(true);
    setAdminError('');
    hasAdminClaim(currentUser, isAdminRoute)
      .then((adminClaim) => {
        if (active) {
          setIsAdmin(adminClaim);
          setAdminCheckFor(checkKey);
        }
      })
      .catch(() => {
        if (active) {
          setIsAdmin(false);
          setAdminCheckFor(checkKey);
          setAdminError('We couldn’t verify admin access. Sign in again or contact your project administrator.');
        }
      })
      .finally(() => {
        if (active) setAdminLoading(false);
      });

    return () => { active = false; };
  }, [currentUser, currentPath, isAdminRoute]);

  useEffect(() => {
    if (!authLoading && isProtectedRoute && !currentUser) {
      window.history.replaceState({}, '', '/');
      setCurrentPath('/');
      setAuthMode('login');
    }
  }, [authLoading, currentUser, isProtectedRoute]);

  useEffect(() => {
    if (!authLoading && isAdminRoute && currentUser && adminCheckIsCurrent && !adminLoading && !isAdmin) {
      window.history.replaceState({}, '', '/dashboard');
      setCurrentPath('/dashboard');
      setAuthError(adminError || 'Admin access is restricted to authorized administrators.');
    }
  }, [adminCheckIsCurrent, adminError, adminLoading, authLoading, currentUser, isAdmin, isAdminRoute]);

  useEffect(() => {
    if (!authLoading && isAccountRoute && currentUser && adminCheckIsCurrent && !adminLoading && isAdmin) {
      window.history.replaceState({}, '', '/admin');
      setCurrentPath('/admin');
    }
  }, [adminCheckIsCurrent, adminLoading, authLoading, currentUser, isAccountRoute, isAdmin]);

  const handleLogout = async () => {
    setAuthError('');
    try {
      await logout();
      if (isProtectedRoute) window.location.assign('/');
    } catch (error) {
      setAuthError(error.message || 'Could not sign out. Please try again.');
    }
  };

  const handleContactSubmit = (event) => {
    event.preventDefault();
    setFormMessage('Thanks for reaching out. This demo form is not connected yet.');
    event.currentTarget.reset();
  };

  if (isProtectedRoute && (authLoading || ((isAdminRoute || isAccountRoute) && (!adminCheckIsCurrent || adminLoading)))) {
    return <main className="route-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Checking your sign-in...</main>;
  }

  if (currentPath === '/' && authLoading) {
    return <main className="route-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Checking your sign-in...</main>;
  }

  if (isAdminRoute && currentUser && authorizedAdmin) {
    return <>
      <Navbar user={currentUser} isAdmin={authorizedAdmin} authLoading={authLoading} onAuthOpen={setAuthMode} onLogout={handleLogout} currentPath={currentPath} />
      {authError && <p className="auth-global-error container" role="alert">{authError}</p>}
      <AdminDashboardPage path={currentPath} adminUid={currentUser.uid} adminUser={currentUser} />
      <Footer />
      <ChatWidget />
    </>;
  }

  if (isAccountRoute && currentUser) {
    return <>
      <Navbar user={currentUser} isAdmin={authorizedAdmin} authLoading={authLoading} onAuthOpen={setAuthMode} onLogout={handleLogout} currentPath={currentPath} />
      {authError && <p className="auth-global-error container" role="alert">{authError}</p>}
      {currentPath === '/book-pickup' ? <BookPickupPage user={currentUser} /> : <DashboardPage user={currentUser} path={currentPath} />}
      <Footer />
      <ChatWidget />
    </>;
  }

  if (currentPath === '/' && (!currentUser || authMode)) {
    return <>
      <LoginPage
        authError={authError}
        registrationNotice={registrationNotice}
        onLogin={(accountType) => openAuth('login', accountType)}
        onRegister={(accountType) => openAuth('register', accountType)}
        inviteCode={inviteCode}
      />
      {authMode && <AuthDialog initialMode={authMode} accountType={authAccountType} inviteCode={inviteCode} allowRegistration={false} onClose={() => setAuthMode(null)} onAuthenticated={(accountType) => window.location.assign(accountType === 'admin' ? '/admin' : '/dashboard')} />}
    </>;
  }

  return <>
    <Navbar user={currentUser} isAdmin={authorizedAdmin} authLoading={authLoading} onAuthOpen={openAuth} onLogout={handleLogout} currentPath={currentPath} />
    {!isFirebaseConfigured && <aside className="firebase-notice container" role="status"><strong>Firebase isn’t configured yet.</strong> Add your Firebase Web App values to <code>client/.env.local</code> to enable authentication and database access. The homepage remains available without them.</aside>}
    {authError && isFirebaseConfigured && <p className="auth-global-error container" role="alert">{authError}</p>}
    <main>
      <section className="hero" id="home">
        <div className="hero-grid container">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" />A brighter future, one device at a time</p>
            <h1>Give Your E-Waste a <span>New Life</span></h1>
            <p className="hero-description">Your unused electronics still have value. Book a convenient pickup and help keep useful materials in circulation.</p>
            <div className="hero-actions"><a className="button button-primary" href="#contact">Book a Pickup <ArrowIcon /></a><a className="button button-light" href="#about">Explore our impact</a></div>
            <div className="hero-note"><span className="avatar-stack" aria-hidden="true"><span>G</span><span>R</span><span>L</span></span><span>Small actions add up to a cleaner tomorrow.</span></div>
          </div>
          <div className="hero-visual">
            <img className="hero-image" src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=85" alt="Recycling bins ready for responsible waste sorting" />
            <div className="image-caption"><span className="caption-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 7h10l-1 13H8L7 7ZM9 7V4h6v3M5 7h14M10 10v7m4-7v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><div><strong>Choose responsible recycling</strong><span>Good for devices. Better for tomorrow.</span></div></div>
          </div>
        </div>
      </section>

      <section className="section categories-section" id="waste"><div className="container">
        <SectionHeading eyebrow="What we collect" title="Ready for a responsible next step" description="From a single phone to a box of old electronics, we can help you find a better route for devices you no longer use." />
        <div className="category-grid">{categories.map((category) => <article className="category-card" key={category.name}><span className="category-icon"><CategoryIcon name={category.icon} /></span><div><h3>{category.name}</h3><p>{category.description}</p></div></article>)}</div>
      </div></section>

      <section className="section steps-section" id="process"><div className="container">
        <SectionHeading eyebrow="Simple by design" title="How it works" description="A few easy steps can keep old electronics out of the wrong places and move them toward a better use." />
        <div className="steps-grid"><article className="step-card"><span className="step-number">01</span><h3>Book Pickup</h3><p>Tell us what you have and choose a convenient time for collection.</p></article><article className="step-card"><span className="step-number">02</span><h3>Collect E-Waste</h3><p>Keep your devices ready. Our collection team will take it from there.</p></article><article className="step-card"><span className="step-number">03</span><h3>Recycle Responsibly</h3><p>Items are directed toward reuse, recovery, or appropriate recycling.</p></article></div>
      </div></section>

      <section className="impact-band" aria-label="Our recycling process"><div className="impact-grid container">
        <div className="impact-intro"><p className="eyebrow">A shared effort</p><h2>Small steps. A better loop.</h2></div>
        <div className="impact-stat"><strong>06</strong><span>categories of e-waste covered</span></div><div className="impact-stat"><strong>03</strong><span>simple steps to recycle</span></div><div className="impact-stat"><strong>01</strong><span>shared planet to protect</span></div>
      </div></section>

      <section className="section" id="about"><div className="about-grid container">
        <div className="about-copy"><p className="eyebrow"><span className="eyebrow-dot" />Why it matters</p><h2>Give valuable materials another chance.</h2><p>Electronics are made from materials worth recovering. When devices are handled thoughtfully, fewer resources go to waste and fewer hazardous materials are mishandled.</p></div>
        <ul className="benefit-list">{benefits.map(([title, description]) => <li key={title}><span className="check-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span><strong>{title}</strong><span>{description}</span></span></li>)}</ul>
      </div></section>

      <section className="centers-section" id="centers"><div className="centers-panel container"><div className="centers-copy"><p className="eyebrow"><span className="eyebrow-dot" />Local recycling</p><h2>Looking for a nearby drop-off point?</h2><p>Get in touch and we’ll help you find an appropriate collection or recycling option in your area.</p></div><a className="button button-primary" href="#contact">Find a center <ArrowIcon /></a></div></section>

      <section className="section contact-section" id="contact"><div className="contact-panel container">
        <div className="contact-copy"><p className="eyebrow"><span className="eyebrow-dot" />Let’s talk</p><h2>Have e-waste? We’re here to help.</h2><p>Ask a question or tell us what you’re ready to recycle. We’ll help you figure out a responsible next step.</p><div className="contact-points"><span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>Send us a message</span><span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>Pickup planning made simple</span></div></div>
        <form className="contact-form" onSubmit={handleContactSubmit}><div className="form-field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" autoComplete="name" placeholder="Name" required /></div><div className="form-field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div><div className="form-field full-width"><label htmlFor="contact-message">How can we help?</label><textarea id="contact-message" name="message" placeholder="Tell us a little about your e-waste..." required /></div><button className="button button-primary" type="submit">Send message <ArrowIcon /></button>{formMessage && <p className="form-feedback" role="status">{formMessage}</p>}</form>
      </div></section>
    </main>
    <Footer />
    <ChatWidget />
    {authMode && <AuthDialog initialMode={authMode} accountType={authAccountType} onClose={() => setAuthMode(null)} onAuthenticated={(accountType) => window.location.assign(accountType === 'admin' ? '/admin' : '/dashboard')} />}
  </>;
}

export default HomePage;