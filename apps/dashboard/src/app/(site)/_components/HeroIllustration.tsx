/**
 * SVG d'illustration du design, copié tel quel (attributs en camelCase JSX,
 * animations inline portées en classes dans site.css).
 */
export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 540 470"
      width="100%"
      role="img"
      aria-label="Illustration : Arbi au travail devant son écran"
    >
      <defs>
        <radialGradient id="ajBlob" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF6A2B" stopOpacity=".85" />
          <stop offset="60%" stopColor="#FF9A6B" stopOpacity=".35" />
          <stop offset="100%" stopColor="#FF6A2B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="392" cy="96" r="96" fill="url(#ajBlob)" className="aj-svg-blob" />
      <g stroke="#B7B7BE" strokeWidth="1" fill="none" opacity=".85" className="aj-svg-orbits">
        <ellipse cx="270" cy="235" rx="238" ry="168" />
        <ellipse cx="270" cy="235" rx="180" ry="212" />
      </g>
      <circle cx="70" cy="120" r="3" fill="#B7B7BE" />
      <circle cx="498" cy="286" r="3" fill="#B7B7BE" />
      <circle cx="120" cy="430" r="3" fill="#B7B7BE" />
      <circle cx="452" cy="60" r="2.5" fill="#B7B7BE" />
      <g className="aj-svg-float-b">
        <rect x="44" y="176" width="92" height="118" rx="10" fill="#FFFFFF" stroke="#1C1C1E" strokeWidth="1.6" />
        <rect x="58" y="192" width="40" height="7" rx="3.5" fill="#7C2AE8" />
        <rect x="58" y="210" width="64" height="5" rx="2.5" fill="#D6D6DB" />
        <rect x="58" y="224" width="52" height="5" rx="2.5" fill="#D6D6DB" />
        <rect x="58" y="252" width="64" height="26" rx="13" fill="#1C1C1E" />
      </g>
      <g className="aj-svg-float">
        <rect x="424" y="228" width="84" height="104" rx="10" fill="#22E1B9" />
        <rect x="438" y="246" width="46" height="6" rx="3" fill="rgba(255,255,255,.85)" />
        <rect x="438" y="262" width="56" height="6" rx="3" fill="rgba(255,255,255,.55)" />
        <rect x="438" y="298" width="34" height="18" rx="9" fill="#0F3F36" />
      </g>
      <rect x="158" y="86" width="278" height="192" rx="14" fill="#FFFFFF" stroke="#1C1C1E" strokeWidth="2" />
      <g>
        <rect x="184" y="196" width="20" height="46" rx="4" fill="#FF6A2B" className="aj-svg-bar aj-svg-bar-1" />
        <rect x="214" y="176" width="20" height="66" rx="4" fill="#7C2AE8" className="aj-svg-bar aj-svg-bar-2" />
        <rect x="244" y="206" width="20" height="36" rx="4" fill="#22E1B9" className="aj-svg-bar aj-svg-bar-3" />
        <rect x="274" y="158" width="20" height="84" rx="4" fill="#1C1C1E" className="aj-svg-bar aj-svg-bar-4" />
      </g>
      <path
        d="M184 146 L228 118 L272 132 L318 100 L410 118"
        fill="none"
        stroke="#FF6A2B"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="420"
        className="aj-svg-dash"
      />
      <rect x="322" y="176" width="88" height="66" rx="8" fill="#F1F1F3" />
      <rect x="334" y="190" width="52" height="6" rx="3" fill="#C9C9CF" />
      <rect x="334" y="204" width="40" height="6" rx="3" fill="#C9C9CF" />
      <rect x="334" y="222" width="10" height="12" rx="2" fill="#1C1C1E" className="aj-svg-blink" />
      <path d="M282 278 V312" stroke="#1C1C1E" strokeWidth="2" />
      <path d="M244 314 H320" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 352 H516" stroke="#B7B7BE" strokeWidth="1.4" />
      <path
        d="M212 452 C218 380 246 342 282 342 C318 342 346 380 352 452 Z"
        fill="#FFFFFF"
        stroke="#1C1C1E"
        strokeWidth="2"
      />
      <path d="M212 452 C218 380 246 342 282 342 C318 342 346 380 352 452 Z" fill="#1C1C1E" opacity=".06" />
      <circle cx="282" cy="316" r="30" fill="#FFFFFF" stroke="#1C1C1E" strokeWidth="2" />
      <path d="M250 314 A32 32 0 0 1 314 314" fill="none" stroke="#1C1C1E" strokeWidth="3" strokeLinecap="round" />
      <rect x="242" y="308" width="14" height="24" rx="7" fill="#FF6A2B" />
      <rect x="308" y="308" width="14" height="24" rx="7" fill="#FF6A2B" />
      <path d="M226 404 C252 396 262 372 258 356" fill="none" stroke="#1C1C1E" strokeWidth="1.6" />
      <path d="M338 404 C312 396 302 372 306 356" fill="none" stroke="#1C1C1E" strokeWidth="1.6" />
    </svg>
  );
}
