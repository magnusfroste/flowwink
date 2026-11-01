import { OpenRolesList } from '@/components/public/careers/OpenRolesList';

export interface JobListingsBlockData {
  title?: string;
  intro?: string;
  /** Only this department's roles (empty = every open role). */
  department?: string;
  maxItems?: number;
  showFilters?: boolean;
}

/**
 * The open roles on any page — the landing page included. An interface to the
 * recruitment module (Law 3): it lists what is published and links each role
 * to /jobs/<slug>, where the one application form lives.
 */
export function JobListingsBlock({ data }: { data: JobListingsBlockData }) {
  return (
    <div className="space-y-6">
      {(data.title || data.intro) && (
        <div className="max-w-2xl">
          {data.title && <h2 className="text-3xl font-bold tracking-tight">{data.title}</h2>}
          {data.intro && <p className="mt-3 text-lg text-muted-foreground">{data.intro}</p>}
        </div>
      )}
      <OpenRolesList
        limit={data.maxItems && data.maxItems > 0 ? data.maxItems : undefined}
        showFilters={data.showFilters !== false}
        department={data.department?.trim() || undefined}
      />
    </div>
  );
}
