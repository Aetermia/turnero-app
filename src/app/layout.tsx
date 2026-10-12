import type { Metadata } from "next";
import Image from "next/image";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Casa de Antón",
  description:
    "Espacio de encuentros en Argentina: talleres, charlas y actividades temáticas. Mirá los próximos eventos y reservá tu lugar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <header className="border-b border-brand-100 bg-paper">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
            <Image
              src="/logo.webp"
              alt="Casa de Antón"
              width={1024}
              height={768}
              className="h-9 w-auto"
              loading="eager"
            />
            <span className="text-lg font-semibold text-brand-800">
              Casa de Antón
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>

        <footer className="border-t border-brand-100 bg-paper py-6 text-center text-sm text-ink-soft">
          Casa de Antón · Talleres y eventos
        </footer>
      </body>
    </html>
  );
}
