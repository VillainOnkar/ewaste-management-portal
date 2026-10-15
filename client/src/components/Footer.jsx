function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content container">
        <a className="brand footer-brand" href="#home" aria-label="GreenLoop home">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M19.5 4.5c-7.7.1-12.4 2.4-13.8 7.1-.9 3 .9 5.3 3.7 5.3 5.5 0 8.8-5.3 10.1-12.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M4.5 20c2.2-4.8 5.5-7.6 10-9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
          <span>GreenLoop</span>
        </a>
        <p className="footer-copy">© {new Date().getFullYear()} GreenLoop. A better loop for our electronics.</p>
        <nav className="footer-links" aria-label="Footer navigation"><a href="#about">About</a><a href="#waste">What we collect</a><a href="#contact">Contact</a></nav>
      </div>
    </footer>
  );
}

export default Footer;