import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CampaignsDashboard } from "@/components/admin/content-hub";

export default function ContentCampaignsPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Content Campaigns"
          description="Create once, publish everywhere"
        />
        <CampaignsDashboard />
      </AdminPageContainer>
    </AdminLayout>
  );
}
