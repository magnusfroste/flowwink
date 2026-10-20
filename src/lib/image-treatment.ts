import type { ImageEdge, ImageFrame, ImageTreatmentKind } from '@/components/public/ImageTreatment';

/** The Tailwind classes the image itself carries for a treatment. */
export function imageTreatmentClass(treatment?: ImageTreatmentKind): string {
  return treatment === 'grayscale' ? 'grayscale contrast-110' : '';
}

/** True when any dial is on — the wrapper renders nothing extra otherwise. */
export function hasImageTreatment(p: { treatment?: ImageTreatmentKind; edge?: ImageEdge; frame?: ImageFrame }): boolean {
  return (p.treatment ?? 'none') !== 'none' || (p.edge ?? 'none') !== 'none' || (p.frame ?? 'none') !== 'none';
}
