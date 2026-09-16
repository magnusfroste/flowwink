import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import { BlockIcon } from '../BlockIcon';

/**
 * BlockIcon laddar ikonsetet i en egen chunk. Beteendet utåt ska vara exakt
 * det de fem blocken hade med `icons[name] ?? Fallback` — bara senare.
 */
describe('BlockIcon', () => {
  it('tomt namn ger reservikonen direkt, utan att vänta på setet', () => {
    const { container } = render(<BlockIcon name="" fallback={Sparkles} className="h-6 w-6" />);
    expect(container.querySelector('svg.lucide-sparkles')).not.toBeNull();
  });

  it('ett känt namn ger just den ikonen när setet laddat', async () => {
    const { container } = render(<BlockIcon name="Users" fallback={Sparkles} className="h-6 w-6" />);
    await waitFor(() => expect(container.querySelector('svg.lucide-users')).not.toBeNull());
    expect(container.querySelector('svg.lucide-sparkles')).toBeNull();
  });

  it('ett påhittat namn ger reservikonen — aldrig ett hål i kortet', async () => {
    const { container } = render(<BlockIcon name="Sheep" fallback={Sparkles} className="h-6 w-6" />);
    await waitFor(() => expect(container.querySelector('svg.lucide-sparkles')).not.toBeNull());
  });
});
