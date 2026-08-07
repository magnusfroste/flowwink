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
import { CoverageDialog } from '@/components/admin/CoverageDialog';

export function LensToggle() {
  const { lens, setLens, coveredUids } = useOwnershipLens();
  return (
    <div className="flex items-center gap-1">
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
      <ToggleGroupItem value="mine" className="px-3">
        {/* "+N": I am covering N colleagues right now, and Mine includes them. */}
        Mine{coveredUids.length > 0 ? ` (+${coveredUids.length})` : ''}
      </ToggleGroupItem>
    </ToggleGroup>
    <CoverageDialog />
    </div>
  );
}
