import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { BlockAnimation, AnimationType, AnimationSpeed } from '@/types/cms';

interface BlockAnimationControlProps {
  animation?: BlockAnimation;
  onChange: (animation: BlockAnimation) => void;
}

const ANIMATION_OPTIONS: { value: AnimationType; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No animation' },
  { value: 'fade-up', label: 'Fade Up', description: 'Fade in while moving up' },
  { value: 'fade-in', label: 'Fade In', description: 'Simple fade in' },
  { value: 'slide-up', label: 'Slide Up', description: 'Slide up with more movement' },
  { value: 'scale-in', label: 'Scale In', description: 'Grow from smaller size' },
  { value: 'slide-left', label: 'Slide Left', description: 'Slide in from right' },
  { value: 'slide-right', label: 'Slide Right', description: 'Slide in from left' },
];

const SPEED_OPTIONS: { value: AnimationSpeed; label: string; duration: string }[] = [
  { value: 'fast', label: 'Fast', duration: '300ms' },
  { value: 'normal', label: 'Normal', duration: '500ms' },
  { value: 'slow', label: 'Slow', duration: '800ms' },
];

export function BlockAnimationControl({ animation, onChange }: BlockAnimationControlProps) {
  const currentType = animation?.type || 'none';
  const currentSpeed = animation?.speed || 'normal';
  const currentDelay = animation?.delay || 0;

  const updateAnimation = (updates: Partial<BlockAnimation>) => {
    onChange({
      type: currentType,
      speed: currentSpeed,
      delay: currentDelay,
      ...updates,
    });
  };

  const hasAnimation = currentType !== 'none';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-7 w-7 bg-card ${hasAnimation ? 'border-primary text-primary' : ''}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Animation</h4>
          </div>

          {/* Animation Type */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Effect</Label>
            <Select
              value={currentType}
              onValueChange={(value) => updateAnimation({ type: value as AnimationType })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANIMATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasAnimation && (
            <>
              {/* Animation Speed */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Speed</Label>
                <Select
                  value={currentSpeed}
                  onValueChange={(value) => updateAnimation({ speed: value as AnimationSpeed })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEED_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.duration}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Animation Delay */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Delay</Label>
                  <span className="text-xs text-muted-foreground">{currentDelay}ms</span>
                </div>
                <Slider
                  value={[currentDelay]}
                  onValueChange={([value]) => updateAnimation({ delay: value })}
                  min={0}
                  max={1000}
                  step={50}
                  className="w-full"
                />
              </div>
            </>
          )}

          {/* Preview indicator */}
          {hasAnimation && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Animation will play when block enters viewport
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
