import manifest from "./school-atlases.generated";
import positions from "./school-atlas-positions.module.css";
import { SchoolAtlasImage } from "./school-atlas-image";

type SchoolLogoProps = { id: string; alt: string; kind: "chinese" | "foreign" };

export function SchoolLogo({ id, alt, kind }: SchoolLogoProps) {
  const logo = manifest.logos[id as keyof typeof manifest.logos];
  if (!logo) throw new Error(`School logo is missing from the static atlas: ${id}`);
  const atlas = manifest.atlases[logo.group as keyof typeof manifest.atlases];

  return <SchoolAtlasImage id={id} alt={alt} kind={kind} position={positions[id]}
    src={atlas.variants[0].src} srcSet={atlas.variants.map(variant => `${variant.src} ${variant.dpr}x`).join(", ")}
    width={atlas.width} height={atlas.height} priority={logo.group === "partners-1"} />;
}
