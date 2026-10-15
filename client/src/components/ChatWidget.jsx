import { useState } from 'react';

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen && <section className="chat-panel" aria-label="GreenLoop help chat">
        <div className="chat-header"><strong>GreenLoop assistant</strong><button className="chat-close" type="button" aria-label="Close chat" onClick={() => setIsOpen(false)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
        <div className="chat-body" aria-live="polite"><p className="chat-message">Hi there! I can help with e-waste questions soon. For now, send us a note through the contact form.</p><p className="chat-note">Chat support is a preview and is not connected to an AI service.</p></div>
      </section>}
      <button className="chat-launcher" type="button" aria-label={isOpen ? 'Close help chat' : 'Open help chat'} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        {isOpen ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.1-.6L4 20l1.6-4.7A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 11.5h.01M12.5 11.5h.01M17 11.5h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>}
      </button>
    </>
  );
}

export default ChatWidget;