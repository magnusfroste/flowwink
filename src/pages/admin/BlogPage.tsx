import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FolderOpen, Tag, Settings } from "lucide-react";

// Lazy-load tab content from existing pages (extract their inner content)
import BlogPostsTab from "@/components/admin/blog/BlogPostsTab";
import BlogCategoriesTab from "@/components/admin/blog/BlogCategoriesTab";
import BlogTagsTab from "@/components/admin/blog/BlogTagsTab";
import BlogSettingsTab from "@/components/admin/blog/BlogSettingsTab";

const TAB_KEYS = ["posts", "categories", "tags", "settings"] as const;
type BlogTab = typeof TAB_KEYS[number];

export default function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as BlogTab) || "posts";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams(value === "posts" ? {} : { tab: value });
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Blog"
          description="Manage posts, categories, tags, and settings"
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="posts" className="gap-2">
              <FileText className="h-4 w-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            <BlogPostsTab />
          </TabsContent>
          <TabsContent value="categories">
            <BlogCategoriesTab />
          </TabsContent>
          <TabsContent value="tags">
            <BlogTagsTab />
          </TabsContent>
          <TabsContent value="settings">
            <BlogSettingsTab />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
