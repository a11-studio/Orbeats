/**
 * Vercel Web Analytics integration.
 * Isolated in its own React root so the rest of the app stays vanilla TS.
 * No-ops silently if the mount element is missing (e.g. during tests).
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

export function mountAnalytics(): void {
  const root = document.getElementById('analytics-root');
  if (!root) return;
  createRoot(root).render(createElement(Analytics));
}
