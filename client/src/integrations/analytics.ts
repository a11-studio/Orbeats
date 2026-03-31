/**
 * Vercel Web Analytics — only on our production / Vercel preview hosts.
 * Skipped on CrazyGames, static file servers, localhost, and other third-party embeds
 * to avoid 404s on /_vercel/insights/script.js when not served by Vercel.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

function shouldLoadVercelAnalytics(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return false;
  return (
    h === 'orbeats.online' ||
    h === 'www.orbeats.online' ||
    h.endsWith('.vercel.app')
  );
}

export function mountAnalytics(): void {
  if (!shouldLoadVercelAnalytics()) return;
  const root = document.getElementById('analytics-root');
  if (!root) return;
  createRoot(root).render(createElement(Analytics));
}
