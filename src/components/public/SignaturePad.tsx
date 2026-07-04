/**
 * SignaturePad — minimal draw-signature capture on a plain canvas.
 * No dependencies: pointer events, stroke history for undo, clear.
 * Emits a data:image/png data-URL after every change (null when empty).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Undo2 } from 'lucide-react';

type Point = { x: number; y: number };

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export function SignaturePad({ onChange, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(canvas).color; // follows text-foreground
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const emit = useCallback(() => {
    const empty = strokesRef.current.length === 0;
    setIsEmpty(empty);
    onChange(empty ? null : canvasRef.current?.toDataURL('image/png') ?? null);
  }, [onChange]);

  // Size the backing store for the device pixel ratio once mounted.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
  }, [redraw]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([pointFromEvent(e)]);
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1]?.push(pointFromEvent(e));
    redraw();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    // Drop accidental zero-length taps
    const last = strokesRef.current[strokesRef.current.length - 1];
    if (last && last.length < 2) strokesRef.current.pop();
    redraw();
    emit();
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    redraw();
    emit();
  };

  const handleClear = () => {
    strokesRef.current = [];
    redraw();
    emit();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="w-full rounded-md border bg-background text-foreground touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Signature drawing area"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isEmpty ? 'Draw your signature above' : 'Signature captured'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleUndo} disabled={isEmpty}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={isEmpty}>
            <Eraser className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
