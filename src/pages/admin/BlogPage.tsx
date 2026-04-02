import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen, Tag, Settings, Plus } from "lucide-react";

import BlogPostsTab from "@/components/admin/blog/BlogPostsTab";
import BlogCategoriesTab from "@/components/admin/blog/BlogCategoriesTab";
import BlogTagsTab from "@/components/admin/blog/BlogTagsTab";
import BlogSettingsTab from "@/components/admin/blog/BlogSettingsTab";

const PATH_TO_TAB: Record<string, string> = {
  "/admin/blog": "posts",
  "/admin/blog/categories": "categories",
  "/admin/blog/tags": "tags",
  "/admin/blog/settings": "settings",
};

export default function BlogPage() {
  const location = useLocation();
  const tabFromPath = PATH_TO_TAB[location.pathname] || "posts";
  const [activeTab, setActiveTab] = useState<string>(tabFromPath);

  useEffect(() => {
    const resolved = PATH_TO_TAB[location.pathname] || "posts";
    setActiveTab(resolved);
  }, [location.pathname]);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Blog</h1>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="posts" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Posts
                </TabsTrigger>
                <TabsTrigger value="categories" className="gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Categories
                </TabsTrigger>
                <TabsTrigger value="tags" className="gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
              </TabsList>
              {activeTab === 'posts' && (
                <Button size="sm" asChild>
                  <Link to="/admin/blog/new">
                    <Plus className="h-4 w-4 mr-2" />
                    New Post
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="posts" className="mt-0">
            <BlogPostsTab />
          </TabsContent>
          <TabsContent value="categories" className="mt-0">
            <BlogCategoriesTab />
          </TabsContent>
          <TabsContent value="tags" className="mt-0">
            <BlogTagsTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <BlogSettingsTab />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
