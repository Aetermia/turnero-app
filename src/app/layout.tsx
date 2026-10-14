import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { FloralGarland } from "@/components/floral-garland";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

// Classic serif for headings, echoing the "CASA de ANTÓN" lettering of the
// brand. Body text stays in Montserrat, which reads better at small sizes.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Casa de Antón",
  description:
    "Espacio de encuentros en Argentina: talleres, charlas y actividades temáticas. Mirá los próximos eventos y reservá tu lugar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${montserrat.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <header className="relative border-b border-brand-100 bg-paper">
          <FloralGarland />
          <div className="relative flex w-full items-center px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
            >
              <Image
                src="/logo.webp"
                alt="Casa de Antón"
                width={562}
                height={262}
                className="h-9 w-auto"
                loading="eager"
              />
              <span className="font-display text-xl font-semibold text-brand-800 sm:text-2xl">
                Casa de Antón
              </span>
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>

        <SiteFooter />
      </body>
    </html>
  );
}
