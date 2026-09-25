import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TRANSFER // Phone ↔ PC',
  description: 'Minimal, personal cross-device file transfer utility.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
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
