import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CampaignsDashboard } from "@/components/admin/content-hub";

export default function ContentCampaignsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Content Campaigns"
          description="Create once, publish everywhere. AI-powered multi-channel content."
        />
        <CampaignsDashboard />
      </div>
    </AdminLayout>
  );
}
