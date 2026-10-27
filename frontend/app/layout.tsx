import type { Metadata } from "next";
import { IBM_Plex_Mono, Montserrat, Oswald } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { ProductsProvider } from "@/components/ProductsProvider";
import { BRAND_NAME, SITE_URL, fetchProducts } from "@/lib/api";
import "./globals.css";

const sans = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
});

const display = Oswald({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} | Daily Football Tips for Ghana & Nigeria`,
    template: `%s | ${BRAND_NAME}`,
  },
  description:
    "Football tips for Ghana and Nigeria: high-odds banker slips, VIP all-access, SportyBet booking codes, and Telegram community.",
  openGraph: {
    title: `${BRAND_NAME} daily football tips`,
    description:
      "Unlock live odds boards or join VIP for full access to every slip and SportyBet booking codes. Mobile Money and Paystack supported.",
    url: SITE_URL,
    siteName: BRAND_NAME,
    locale: "en_GH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} daily football tips`,
    description: "Live daily odds boards, VIP all-access slips and booking codes for Ghana and Nigeria.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialProducts = await fetchProducts().catch(() => []);

  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <AuthProvider>
          <ProductsProvider initialProducts={initialProducts}>{children}</ProductsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
