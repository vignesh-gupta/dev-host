"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { LogoMark } from "@/components/logo"

const LINKS = [
  ["How it works", "#pipeline"],
  ["Live logs", "#logs"],
  ["Features", "#features"],
]

/**
 * Flat, full-width bar in the brand orange so it reads as part of the page.
 * It sits on a 2px rule and tightens its height once you scroll.
 */
export function LandingNav() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      setCompact(window.scrollY > 24)
    }
    const onScroll = () => {
      raf ||= requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <header data-compact={compact} className="navbar fixed inset-x-0 top-0 z-50">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 outline-none focus-visible:underline"
        >
          <LogoMark className="size-7 bg-(--l-ink) text-(--l-orange)" />
          <span
            className="text-base font-black tracking-tight uppercase"
            style={{ fontStretch: "118%" }}
          >
            Dev Host
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="nav-link outline-none">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="nav-link hidden outline-none sm:inline">
            Sign in
          </Link>
          <Link href="/dashboard" className="btn-l btn-ink nav-cta">
            <span className="sm:hidden">Dashboard</span>
            <span className="hidden sm:inline">Open dashboard</span>
          </Link>
        </div>
      </nav>
    </header>
  )
}
