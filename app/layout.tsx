import "./globals.css";

export const metadata = {
  title: "Vorpium",
  description: "Everyone's story built together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
