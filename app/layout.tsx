import "./globals.css";

export const metadata = {
  title: "Feather Quest",
  description: "A D&D 5e multiplayer RPG. Play on the web or through Discord.",
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
