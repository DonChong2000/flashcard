import type { Metadata } from "next";
import "./globals.css";

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
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
