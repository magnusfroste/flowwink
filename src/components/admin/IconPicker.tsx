import { useState } from 'react';
import { Check, ChevronsUpDown, icons } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Grouped icons for healthcare context
const ICON_GROUPS = {
  'Kommunikation': ['Phone', 'Mail', 'MessageCircle', 'Send'],
  'Plats & Tid': ['MapPin', 'Clock', 'Calendar', 'CalendarCheck'],
  'Sjukvård': ['Heart', 'HeartPulse', 'Stethoscope', 'Hospital', 'Ambulance', 'Pill', 'Syringe', 'Activity', 'Thermometer', 'Bandage'],
  'Personer': ['Users', 'User', 'UserPlus', 'Baby', 'Accessibility'],
  'Dokument': ['FileText', 'Files', 'ClipboardList', 'BookOpen', 'Newspaper'],
  'Navigation': ['ArrowRight', 'ExternalLink', 'Search', 'Download', 'Link', 'ChevronRight'],
  'Information': ['Info', 'HelpCircle', 'AlertCircle', 'CheckCircle', 'CircleAlert'],
  'Övrigt': ['Star', 'Shield', 'Lock', 'Key', 'Settings', 'Home', 'Building', 'Briefcase', 'CreditCard', 'Globe'],
};

function renderIcon(iconName: string, className?: string) {
  const LucideIcon = icons[iconName as keyof typeof icons];
  if (LucideIcon && typeof LucideIcon === 'function') {
    return <LucideIcon className={className} />;
  }
  return null;
}

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            {renderIcon(value, "h-4 w-4")}
            <span>{value || 'Välj ikon...'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Sök ikon..." />
          <CommandList>
            <CommandEmpty>Ingen ikon hittades.</CommandEmpty>
            {Object.entries(ICON_GROUPS).map(([group, iconNames]) => (
              <CommandGroup key={group} heading={group}>
                {iconNames.map((iconName) => (
                  <CommandItem
                    key={iconName}
                    value={iconName}
                    onSelect={() => {
                      onChange(iconName);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {renderIcon(iconName, "h-4 w-4")}
                      <span>{iconName}</span>
                    </div>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === iconName ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
