'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/targets', label: 'Targets' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/saved-searches', label: 'Saved Searches' },
  { href: '/lookup', label: 'Company Lookup' },
  { href: '/settings', label: 'Settings' },
];

export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <div className="text-[13px] font-semibold leading-tight">Off-Market</div>
        <div className="text-[13px] font-semibold leading-tight text-accent">Acquisition Finder</div>
      </div>

      <ul className="flex-1 py-2">
        {LINKS.map((link) => {
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'block border-l-2 px-4 py-1.5 text-sm transition',
                  active
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-4 py-3">
        <div className="truncate text-[11px] text-ink-faint" title={email}>
          {email}
        </div>
        <button onClick={signOut} className="mt-1 text-[11px] text-ink-muted underline hover:text-ink">
          Sign out
        </button>
      </div>
    </nav>
  );
}
