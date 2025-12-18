import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Rss, FileText, User, Clock, ArrowLeft } from 'lucide-react';
import { useBlogSettings, useUpdateBlogSettings, BlogSettings } from '@/hooks/useSiteSettings';
import { toast } from 'sonner';

export default function BlogSettingsPage() {
  const { data: settings, isLoading } = useBlogSettings();
  const updateSettings = useUpdateBlogSettings();
  const [localSettings, setLocalSettings] = useState<BlogSettings | null>(null);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!localSettings) return;
    
    try {
      await updateSettings.mutateAsync(localSettings);
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const updateField = <K extends keyof BlogSettings>(key: K, value: BlogSettings[K]) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, [key]: value });
  };

  if (isLoading || !localSettings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <AdminPageHeader
            title="Blog Settings"
            description="Configure blog display and features"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/blog">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Posts
              </Link>
            </Button>
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                General
              </CardTitle>
              <CardDescription>
                Basic blog configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Blog</Label>
                  <p className="text-sm text-muted-foreground">
                    Show blog in public navigation
                  </p>
                </div>
                <Switch
                  checked={localSettings.enabled}
                  onCheckedChange={(checked) => updateField('enabled', checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="archiveTitle">Archive Title</Label>
                <Input
                  id="archiveTitle"
                  value={localSettings.archiveTitle}
                  onChange={(e) => updateField('archiveTitle', e.target.value)}
                  placeholder="Blogg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="archiveSlug">Archive URL Slug</Label>
                <Input
                  id="archiveSlug"
                  value={localSettings.archiveSlug}
                  onChange={(e) => updateField('archiveSlug', e.target.value)}
                  placeholder="blogg"
                />
                <p className="text-xs text-muted-foreground">
                  Blog will be accessible at /{localSettings.archiveSlug}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="postsPerPage">Posts Per Page</Label>
                <Input
                  id="postsPerPage"
                  type="number"
                  min={1}
                  max={50}
                  value={localSettings.postsPerPage}
                  onChange={(e) => updateField('postsPerPage', parseInt(e.target.value) || 10)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Display Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Display Options
              </CardTitle>
              <CardDescription>
                Control what's shown on blog posts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Show Author Bio
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display author information on posts
                  </p>
                </div>
                <Switch
                  checked={localSettings.showAuthorBio}
                  onCheckedChange={(checked) => updateField('showAuthorBio', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Show Reading Time
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display estimated reading time
                  </p>
                </div>
                <Switch
                  checked={localSettings.showReadingTime}
                  onCheckedChange={(checked) => updateField('showReadingTime', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Show Reviewer Badge</Label>
                  <p className="text-sm text-muted-foreground">
                    For compliance: show content reviewer info
                  </p>
                </div>
                <Switch
                  checked={localSettings.showReviewer}
                  onCheckedChange={(checked) => updateField('showReviewer', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* RSS Feed Settings */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rss className="h-5 w-5" />
                RSS Feed
              </CardTitle>
              <CardDescription>
                Configure your blog's RSS feed for subscribers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable RSS Feed</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to subscribe via RSS
                  </p>
                </div>
                <Switch
                  checked={localSettings.rssEnabled}
                  onCheckedChange={(checked) => updateField('rssEnabled', checked)}
                />
              </div>

              {localSettings.rssEnabled && (
                <div className="grid gap-4 md:grid-cols-2 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="rssTitle">Feed Title</Label>
                    <Input
                      id="rssTitle"
                      value={localSettings.rssTitle}
                      onChange={(e) => updateField('rssTitle', e.target.value)}
                      placeholder="RSS Feed"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rssDescription">Feed Description</Label>
                    <Input
                      id="rssDescription"
                      value={localSettings.rssDescription}
                      onChange={(e) => updateField('rssDescription', e.target.value)}
                      placeholder="Latest posts from our blog"
                    />
                  </div>
                </div>
              )}

              {localSettings.rssEnabled && (
                <div className="pt-2 p-3 bg-muted rounded-md">
                  <p className="text-sm text-muted-foreground">
                    RSS feed URL: <code className="bg-background px-1 py-0.5 rounded">/functions/v1/blog-rss</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
