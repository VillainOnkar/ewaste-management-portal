import { useState } from 'react';

const publicLinks = [
  ['Home', '#home'],
  ['About', '#about'],
  ['E-Waste Information', '#waste'],
  ['Recycling Centers', '#centers'],
  ['Contact', '#contact'],
];

function Navbar({ user, isAdmin = false, authLoading, onAuthOpen, onLogout, currentPath = '/' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const adminLinks = [
    ['Dashboard', '/admin'],
    ['Pickup Requests', '/admin/requests'],
    ['Users', '/admin/users'],
    ['Invites', '/admin/invites'],
    ['Collectors', '/admin/collectors'],
    ['Recycling Centers', '/admin/centers'],
    ['Reports', '/admin/reports'],
  ];
  const userLinks = user
    ? [['Dashboard', '/dashboard'], ['Book Pickup', '/book-pickup'], ['Track Request', '/track-request'], ['My History', '/history']]
    : publicLinks;
  const links = isAdmin && currentPath.startsWith('/admin')
    ? adminLinks
    : isAdmin
      ? [...userLinks, ['Admin Dashboard', '/admin']]
      : userLinks;

  return (
    <header className="site-header">
      <nav className={`navbar container${isAdmin && currentPath.startsWith('/admin') ? ' admin-navbar' : ''}`} aria-label="Main navigation">
        <a className="brand" href={user && currentPath !== '/' ? '/#home' : '#home'} aria-label="GreenLoop home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M19.5 4.5c-7.7.1-12.4 2.4-13.8 7.1-.9 3 .9 5.3 3.7 5.3 5.5 0 8.8-5.3 10.1-12.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M4.5 20c2.2-4.8 5.5-7.6 10-9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <span>GreenLoop</span>
        </a>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
        </button>
        <ul id="primary-navigation" className={`nav-links${menuOpen ? ' is-open' : ''}`}>
          {links.map(([label, href]) => <li key={label}><a className={currentPath === href ? 'active' : undefined} href={href} onClick={() => setMenuOpen(false)}>{label}</a></li>)}
        </ul>
        <div className="nav-actions">
          {user ? <>{isAdmin && currentPath.startsWith('/admin') && <a className="button button-primary admin-invite-nav-button" href="/admin/invites">Create Admin Invite</a>}<span className="account-label">{user.email}</span><button className="login-link logout-button" type="button" onClick={onLogout}>Logout</button></> : <>
            <button className="login-link" type="button" onClick={() => onAuthOpen('login')}>Login</button>
            <button className="button button-primary" type="button" onClick={() => onAuthOpen('register')}>Register</button>
          </>}
          {authLoading && <span className="auth-loading" role="status">Checking account...</span>}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;