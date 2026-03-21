import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({ subsets: ["latin"] });

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/flashcard";

export const metadata: Metadata = {
  title: "AWS Cert Flashcards",
  description: "Study AWS certification exam questions with flashcards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');})();` }} />
        <link rel="manifest" href={`${BASE_PATH}/manifest.webmanifest`} />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#404A5F" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#e7e8e5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Flashcards" />
        <link rel="apple-touch-icon" href={`${BASE_PATH}/icons/icon-192.png`} />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${BASE_PATH}/sw.js',{scope:'${BASE_PATH}/'});});}` }} />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
