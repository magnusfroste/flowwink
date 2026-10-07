import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The collapsed sidebar rail is 3rem (SIDEBAR_WIDTH_ICON). shadcn's SidebarGroup pads
 * 0.5rem on each side and the icon-mode menu button is 2rem, so the rail is filled
 * exactly. AdminSidebar added another px-2 on SidebarContent for the expanded look;
 * in icon mode that left 1rem for a 2rem button — every icon sat 8 px right of
 * centre and was clipped (reported more than once, fixed by hand each time). The
 * same arithmetic bit the footer: p-2 + button p-2 + a 2rem avatar is 4rem in a 3rem
 * rail. The extra padding is now expanded-only, and the lone icons centre.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the collapsed sidebar rail centres its icons', () => {
  const sidebar = read('src/components/admin/AdminSidebar.tsx');

  it('SidebarContent keeps its horizontal padding for the expanded sidebar only', () => {
    expect(sidebar).toMatch(/<SidebarContent[^>]*className="[^"]*px-2[^"]*group-data-\[collapsible=icon\]:px-0/);
  });

  it('the footer user button and the search button centre their icon in icon mode', () => {
    expect(sidebar).toMatch(/rounded-md hover:bg-sidebar-accent transition-colors text-left group-data-\[collapsible=icon\]:p-0 group-data-\[collapsible=icon\]:justify-center/);
    expect(sidebar).toMatch(/hover:bg-sidebar-accent rounded-md transition-colors group-data-\[collapsible=icon\]:justify-center/);
    expect(read('src/components/admin/RolePreview.tsx')).toMatch(/group-data-\[collapsible=icon\]:justify-center/);
  });

  it('the header trigger centres when it is alone', () => {
    expect(sidebar).toMatch(/<SidebarHeader[^>]*group-data-\[collapsible=icon\]:justify-center/);
  });

  it('the rail arithmetic the fix relies on still holds in the shadcn primitive', () => {
    const ui = read('src/components/ui/sidebar.tsx');
    expect(ui).toMatch(/SIDEBAR_WIDTH_ICON = "3rem"/);
    expect(ui).toMatch(/data-sidebar="group"\s+className=\{cn\("relative flex w-full min-w-0 flex-col p-2"/);
    expect(ui).toMatch(/group-data-\[collapsible=icon\]:!size-8 group-data-\[collapsible=icon\]:!p-2 group-data-\[collapsible=icon\]:justify-center/);
  });
});
