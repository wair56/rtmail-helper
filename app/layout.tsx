import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RT Mail Fetcher | rtmail.helper.is',
  description: 'Securely fetch and read your Microsoft Outlook/Hotmail emails using a Refresh Token.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
