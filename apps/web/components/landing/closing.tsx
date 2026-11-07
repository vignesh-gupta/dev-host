import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { LogoMark } from "@/components/logo"
import { Reveal } from "@/components/landing/reveal"
import { Terminal3D } from "@/components/landing/terminal-3d"

export function LogsSection() {
  return (
    <section id="logs" className="overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <h2 className="display display-lg">
            Watch every
            <br />
            build, live.
          </h2>
          <p className="body-l mt-5 max-w-sm text-lg">
            Progress streams to your browser while your site builds, and stays
            on the deployment afterwards, so you always know what happened.
          </p>
        </Reveal>
        <Terminal3D />
      </div>
    </section>
  )
}

export function Closing() {
  return (
    <>
      <section className="bg-(--l-orange) px-5 py-24 sm:px-8 sm:py-36">
        <Reveal className="mx-auto max-w-7xl">
          <h2 className="display text-[clamp(2.6rem,10vw,6rem)]">
            Ship the
            <br />
            next one.
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/projects/new" className="btn-l btn-ink">
              Connect a repo <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/dashboard" className="btn-l btn-outline">
              Open the dashboard
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="overflow-hidden bg-(--l-ink) text-(--l-concrete)">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pt-16 pb-10 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <LogoMark className="size-7" />
              <span
                className="text-base font-black tracking-tight uppercase"
                style={{ fontStretch: "118%" }}
              >
                Dev Host
              </span>
            </div>
            <p className="body-l max-w-xs text-sm text-white/65">
              Push to Git and it is live. Hosting for Next.js and static
              sites, without the setup.
            </p>
          </div>

          <nav aria-label="Footer" className="space-y-3 text-sm">
            <p className="font-mono-l text-xs text-white/45">Product</p>
            <ul className="space-y-2 font-semibold">
              <li><Link href="/dashboard" className="hover:text-(--l-orange)">Dashboard</Link></li>
              <li><Link href="/projects" className="hover:text-(--l-orange)">Projects</Link></li>
              <li><Link href="/login" className="hover:text-(--l-orange)">Sign in</Link></li>
            </ul>
          </nav>

          <div className="space-y-3 text-sm">
            <p className="font-mono-l text-xs text-white/45">Made by</p>
            <p
              className="text-2xl leading-none font-black uppercase"
              style={{ fontStretch: "118%" }}
            >
              <span className="mt-1 block text-(--l-orange)">Vignesh Gupta</span>
            </p>
          </div>
        </div>

        <div aria-hidden className="select-none">
          <p
            className="display mb-[-0.09em] text-center whitespace-nowrap text-(--l-orange)"
            style={{ fontSize: "min(11.3vw, 14rem)", lineHeight: 0.8, textWrap: "nowrap" }}
          >
            Dev Host
          </p>
        </div>
        <div className="border-t border-white/15">
          <p className="mx-auto max-w-7xl px-5 py-4 text-xs text-white/50 sm:px-8">
            © {new Date().getFullYear()} Dev Host. Built by Vignesh Gupta.
          </p>
        </div>
      </footer>
    </>
  )
}
