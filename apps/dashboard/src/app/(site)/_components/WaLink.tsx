/** Lien externe (WhatsApp, Telegram…) : nouvel onglet, sans referrer opener. */
export function WaLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener" className={className} style={style}>
      {children}
    </a>
  );
}
