'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M6 2h12l-1 6H7L6 2z" />
      <path d="M5 8h14v8a3 3 0 01-3 3H8a3 3 0 01-3-3V8z" />
      <path d="M19 10h1a2 2 0 010 4h-1" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-full h-full">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function RoundsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 3v6h-6" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  )
}

const tabs = [
  { href: '/',      label: 'Order', Icon: CupIcon },
  { href: '/menu',  label: 'Menu',  Icon: MenuIcon },
  { href: '/admin', label: 'Rounds', Icon: RoundsIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-amber-100 flex z-40 pb-safe">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold tracking-wide transition-colors ${
              active ? 'text-amber-800' : 'text-amber-300 hover:text-amber-500'
            }`}
          >
            <span className="w-5 h-5">
              <Icon />
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
