import { cn } from '@/lib/utils';
import { PixelGradient } from '@/components/public/PixelGradient';
import type { PixelGradientDirection, PixelGradientDot } from '@/lib/pixel-gradient';

export interface SectionDividerBlockData {
  shape: 'wave' | 'diagonal' | 'curved' | 'zigzag' | 'triangle' | 'texture' | 'pixel-gradient';
  color?: string;
  bgColor?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  flip?: boolean;
  invert?: boolean;
  /**
   * shape "texture": the band is an IMAGE — a grain, a gradient, a scan line —
   * drawn full-width between two sections. The agency texture synclair's
   * ChatGPT painted onto `main:before` with CSS (2026-10-19) is this block:
   * a transparent PNG laid over the next section's surface
   * (`sectionBackground` on this block), at a height, nothing else.
   */
  imageSrc?: string;
  /** cover (default) crops to the band; contain letterboxes inside it. */
  fit?: 'cover' | 'contain';
  /** Where the crop anchors when fit is cover. */
  position?: 'top' | 'center' | 'bottom';
  /** 0–1, default 1. */
  opacity?: number;
  /**
   * shape "pixel-gradient": the band DRAWN — a dithered gradient from this
   * section's ground to the inverse ground through the brand's deep colour
   * (and the gradientHighlight token when branding sets one). No image, no
   * upload, identical on every page. See lib/pixel-gradient.ts.
   *  direction  in = page ground → inverse band (default when invert is on),
   *             out = inverse band → page ground (default), band = ground on
   *             both sides with the brand tones in the middle.
   */
  direction?: PixelGradientDirection;
  /** shape "pixel-gradient": dot size — pixel 1 px (the grain of a dithered image), fine 2 px, medium 3 px (default), coarse 4 px. */
  dot?: PixelGradientDot;
  /** shape "pixel-gradient": CSS colour of the deep tone; default the light theme's primary. */
  midColor?: string;
  /** shape "pixel-gradient": CSS colour of the light tone before the far ground; default the gradientHighlight brand token, none when unset. */
  highlightColor?: string;
}

interface SectionDividerBlockProps {
  data: SectionDividerBlockData;
}

const HEIGHT_MAP = { sm: 40, md: 80, lg: 120, xl: 200 };

function getSvgPath(shape: string, w: number, h: number): string {
  switch (shape) {
    case 'wave':
      return `M0,${h * 0.6} C${w * 0.25},${h * 1.1} ${w * 0.5},${h * 0.1} ${w * 0.75},${h * 0.6} S${w},${h * 0.2} ${w},${h * 0.5} L${w},${h} L0,${h} Z`;
    case 'diagonal':
      return `M0,${h} L${w},0 L${w},${h} Z`;
    case 'curved':
      return `M0,${h} Q${w * 0.5},${-h * 0.3} ${w},${h} Z`;
    case 'zigzag': {
      const segments = 8;
      const segW = w / segments;
      let d = `M0,${h}`;
      for (let i = 0; i < segments; i++) {
        const peakY = i % 2 === 0 ? 0 : h * 0.6;
        d += ` L${segW * (i + 0.5)},${peakY}`;
      }
      d += ` L${w},${h} Z`;
      return d;
    }
    case 'triangle':
      return `M0,${h} L${w * 0.5},0 L${w},${h} Z`;
    default:
      return `M0,${h} L${w},0 L${w},${h} Z`;
  }
}

export function SectionDividerBlock({ data }: SectionDividerBlockProps) {
  const { shape = 'wave', color, bgColor, height = 'md', flip = false, invert = false } = data;
  const h = HEIGHT_MAP[height] ?? HEIGHT_MAP.md;
  const w = 1440;

  const fillColor = color || 'hsl(var(--background))';
  const backgroundColor = bgColor || 'transparent';

  if (shape === 'pixel-gradient') {
    return (
      <PixelGradient
        direction={data.direction ?? (invert ? 'in' : 'out')}
        height={h}
        dot={data.dot}
        midColor={data.midColor}
        highlightColor={data.highlightColor}
      />
    );
  }

  if (shape === 'texture') {
    const opacity = typeof data.opacity === 'number' ? Math.min(1, Math.max(0, data.opacity)) : 1;
    return (
      <div
        className={cn('relative w-full overflow-hidden leading-[0]', invert && 'rotate-180')}
        style={{ backgroundColor, height: `${h}px` }}
        aria-hidden="true"
      >
        {data.imageSrc && (
          <img
            src={data.imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn('block w-full h-full', data.fit === 'contain' ? 'object-contain' : 'object-cover', flip && 'scale-x-[-1]')}
            style={{ objectPosition: data.position ?? 'center', opacity }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('relative w-full overflow-hidden leading-[0]', invert && 'rotate-180')}
      style={{ backgroundColor }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className={cn('w-full block', flip && 'scale-x-[-1]')}
        style={{ height: `${h}px` }}
      >
        <path d={getSvgPath(shape, w, h)} fill={fillColor} />
      </svg>
    </div>
  );
}
