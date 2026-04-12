'use client';
import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const API = '/api';
const NAV_ITEMS = [
  { section: 'MAIN' },
  { href: '/', icon: '◎', label: 'Dashboard' },
  { href: '/conversations', icon: '💬', label: 'Conversations', badgeKey: 'conversations' },
  { href: '/leads', icon: '🔥', label: 'Leads', badgeKey: 'leads' },
  { section: '' },
  { href: '/businesses', icon: '🏢', label: 'Businesses' },
  { href: '/whatsapp', icon: '📱', label: 'WhatsApp' },
  { href: '/automation', icon: '⚡', label: 'Automation' },
];

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [health, setHealth] = useState({ whatsapp: false, api: true });
  const [counts, setCounts] = useState({ conversations: 0, leads: 0 });

  useEffect(() => {
    async function check() {
      try {
        const [waRes, dashRes] = await Promise.all([
          fetch(`${API}/whatsapp/status`).then(r => r.json()).catch(() => ({ connected: false })),
          fetch(`${API}/dashboard`).then(r => r.json()).catch(() => null),
        ]);
        setHealth({ whatsapp: waRes?.connected || false, api: true });
        if (dashRes) setCounts({ conversations: dashRes.active_conversations || 0, leads: dashRes.total_leads || 0 });
      } catch { setHealth(h => ({ ...h, api: false })); }
    }
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <html lang="en">
      <head><title>FlowBot AI — WhatsApp Automation</title><meta name="description" content="AI-Powered WhatsApp Automation Platform" /></head>
      <body>
        <div className="app-container">
          <aside className="sidebar">
            <div className="sidebar-brand">
              <div className="brand-icon">⚡</div>
              <div className="brand-text"><h1>FlowBot AI</h1><p>WhatsApp Automation</p></div>
            </div>
            <nav className="sidebar-nav">
              {NAV_ITEMS.map((item, i) => {
                if (item.section !== undefined) return <div key={`s${i}`} className="sidebar-section-label">{item.section}</div>;
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                const badge = item.badgeKey ? counts[item.badgeKey] : null;
                return (
                  <Link href={item.href} key={item.href} className={`sidebar-link ${isActive ? 'active' : ''}`}>
                    <span className="link-icon">{item.icon}</span>{item.label}
                    {badge > 0 && <span className="link-badge">{badge}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="sidebar-footer">
              <div className="issue-bar">
                <span className="issue-dot" style={{ background: !health.api ? 'var(--danger)' : !health.whatsapp ? 'var(--warning)' : 'var(--success)' }}></span>
                <div className="issue-text">
                  <strong>{!health.api ? 'Issues Detected' : !health.whatsapp ? 'WhatsApp Offline' : 'All Systems OK'}</strong>
                  <span>{!health.api ? 'Backend unreachable' : !health.whatsapp ? 'Connect in WhatsApp page' : 'No issues detected'}</span>
                </div>
              </div>
            </div>
          </aside>
          <main className="main-content">
            <div className="top-bar">
              <div className="status-badges">
                {!health.api && <span className="status-badge error"><span className="dot"></span>API Error</span>}
                <span className={`status-badge ${health.whatsapp ? 'live' : 'error'}`}><span className="dot"></span>{health.whatsapp ? 'WhatsApp Live' : 'WhatsApp Offline'}</span>
              </div>
            </div>
            <div className="page-body">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
