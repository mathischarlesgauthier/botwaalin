/** Bandeau défilant infini : les éléments sont dupliqués pour boucler sans couture. */
export function Ticker({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const separator = "  ·  ";
  const text = `${items.join(separator)}${separator}`;
  return (
    <div className="aj-ticker" aria-hidden="true">
      <div className="aj-ticker-track">
        <span className="aj-ticker-item">{text}</span>
        <span className="aj-ticker-item">{text}</span>
      </div>
    </div>
  );
}
