const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400;500&family=Public+Sans:wght@400;500;600&display=swap";

/** Google Fonts du design (Jost 200-500, Public Sans 400-600) avec préconnexions. */
export function SiteFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
    </>
  );
}
