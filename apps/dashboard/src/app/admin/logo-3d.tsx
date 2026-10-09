import logo from "./_assets/logo-arbi-jacob.webp";

/** Logo ARBI JACOB qui flotte en 3D avec un reflet métallique (CSS seul). */
export function Logo3D({ size, small = false }: { size: number; small?: boolean }) {
  return (
    <span className={`ajd-logo3d${small ? " ajd-logo-sm" : ""}`} style={{ width: size }}>
      <span className="ajd-logo3d-inner" style={{ "--ajd-logo-mask": `url(${logo.src})` } as React.CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} width={size} height={size} alt="" aria-hidden="true" />
      </span>
    </span>
  );
}
