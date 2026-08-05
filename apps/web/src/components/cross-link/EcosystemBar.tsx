/**
 * Mossland ecosystem wayfinding bar.
 *
 * The three sister sites (BRIDGE, Algora, MOSS.AO) render this same set —
 * identical order and role copy — so the family reads as one ecosystem;
 * only the styling is local to each site. Mounted at the end of the root
 * layout's scroll content, mirroring the footer placement BRIDGE and
 * MOSS.AO use.
 *
 * Accessibility notes carried over from the MOSS.AO implementation review
 * (agentic-orchestrator PR #2950): a real space text node must separate
 * the site name from its role — CSS margins add no text, so the
 * accessible name would otherwise read "BRIDGEGovernance OS" — and the
 * external links disclose their new-tab behavior with an aria-hidden ↗
 * marker plus localized screen-reader text.
 */
import { getTranslations } from 'next-intl/server';

// Order and content are kept identical across the sister sites.
const ECOSYSTEM = [
  {
    name: 'BRIDGE',
    roleKey: 'bridgeRole',
    href: 'https://bridge.moss.land',
    current: false,
  },
  {
    name: 'Algora',
    roleKey: 'algoraRole',
    href: 'https://algora.moss.land',
    current: true,
  },
  {
    name: 'MOSS.AO',
    roleKey: 'aoRole',
    href: 'https://ao.moss.land',
    current: false,
  },
] as const;

export async function EcosystemBar() {
  const t = await getTranslations('Ecosystem');

  return (
    <footer className="mt-6 border-t border-agora-border pt-4">
      <nav aria-label={t('label')}>
        <p className="text-[10px] uppercase tracking-[0.22em] text-agora-muted">
          {t('label')}
        </p>
        <ul className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-xs">
          {/* The {' '} after each site name is load-bearing — see the doc
              comment above before "cleaning it up". */}
          {ECOSYSTEM.map((site) => (
            <li key={site.name}>
              {site.current ? (
                <span
                  aria-current="true"
                  className="font-semibold text-agora-text"
                >
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-agora-primary align-middle"
                  />
                  {site.name}{' '}
                  <span className="ml-1 font-normal text-agora-muted">
                    {t(site.roleKey)}
                  </span>
                </span>
              ) : (
                <a
                  href={site.href}
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-agora-muted transition-colors hover:text-agora-text"
                >
                  {site.name}{' '}
                  <span className="ml-1 font-normal">{t(site.roleKey)}</span>
                  <span aria-hidden="true" className="ml-1">
                    ↗
                  </span>
                  <span className="sr-only">{` (${t('newTab')})`}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
