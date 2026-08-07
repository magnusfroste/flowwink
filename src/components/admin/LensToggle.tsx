/**
 * All / Mine — the focus toggle, deliberately small.
 *
 * "All" is the default and the point of the system: everyone sees the same
 * picture. "Mine" is the focused pass through your own list. The toggle only
 * ever narrows the LIST it sits above — never a stat card, never what a
 * colleague or an agent can see.
 */
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useOwnershipLens } from '@/hooks/useOwnershipLens';

export function LensToggle() {
  const { lens, setLens } = useOwnershipLens();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={lens}
      onValueChange={(v) => {
        // Radio behaviour: ignore deselect, a lens is always one of the two.
        if (v === 'all' || v === 'mine') setLens(v);
      }}
      aria-label="Ownership lens"
    >
      <ToggleGroupItem value="all" className="px-3">All</ToggleGroupItem>
      <ToggleGroupItem value="mine" className="px-3">Mine</ToggleGroupItem>
    </ToggleGroup>
  );
}
