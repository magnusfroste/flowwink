import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, Rss, FileText, User, Clock, ImageIcon } from 'lucide-react';
import { useBlogSettings, useUpdateBlogSettings, BlogSettings } from '@/hooks/useSiteSettings';
import { blogCoverStyle } from '@/lib/blog-cover';
import { toast } from 'sonner';

export default function BlogSettingsTab() {
  const { data: settings, isLoading } = useBlogSettings();
  const updateSettings = useUpdateBlogSettings();
  const [localSettings, setLocalSettings] = useState<BlogSettings | null>(null);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />General</CardTitle>
            <CardDescription>Basic blog configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label>Enable Blog</Label><p className="text-sm text-muted-foreground">Show blog in public navigation</p></div>
              <Switch checked={localSettings.enabled} onCheckedChange={(checked) => updateField('enabled', checked)} />
            </div>
            <div className="space-y-2"><Label htmlFor="archiveTitle">Archive Title</Label><Input id="archiveTitle" value={localSettings.archiveTitle} onChange={(e) => updateField('archiveTitle', e.target.value)} placeholder="Blog" /></div>
            {/* The blog's address is a fixed system route, like /shop and /kb —
                only its NAME is per site and per language. docs/architecture/addresses.md */}
            <div className="space-y-1">
              <Label>Address</Label>
              <p className="text-sm"><code>/blog</code>, and <code>/&lt;language&gt;/blog</code> in other languages</p>
              <p className="text-xs text-muted-foreground">System addresses are the same on every site and in every language; the name visitors see is the title above. A post's own slug can be translated per language.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minWords">Word floor for agent-written posts</Label>
              <Input
                id="minWords"
                type="number"
                min={0}
                value={localSettings.minWords ?? 600}
                onChange={(e) => updateField('minWords', Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
              <p className="text-xs text-muted-foreground">A post FlowPilot or an external agent writes below this is refused with what to change, instead of published as an introduction. 0 turns the floor off. People in the editor are never gated.</p>
            </div>
            <div className="space-y-2"><Label htmlFor="postsPerPage">Posts Per Page</Label><Input id="postsPerPage" type="number" min={1} max={50} value={localSettings.postsPerPage} onChange={(e) => updateField('postsPerPage', parseInt(e.target.value) || 10)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Display Options</CardTitle>
            <CardDescription>Control what's shown on blog posts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="flex items-center gap-2"><User className="h-4 w-4" />Show Author Bio</Label><p className="text-sm text-muted-foreground">Display author information on posts</p></div>
              <Switch checked={localSettings.showAuthorBio} onCheckedChange={(checked) => updateField('showAuthorBio', checked)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label className="flex items-center gap-2"><Clock className="h-4 w-4" />Show Reading Time</Label><p className="text-sm text-muted-foreground">Display estimated reading time</p></div>
              <Switch checked={localSettings.showReadingTime} onCheckedChange={(checked) => updateField('showReadingTime', checked)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label>Show Reviewer Badge</Label><p className="text-sm text-muted-foreground">For compliance: show content reviewer info</p></div>
              <Switch checked={localSettings.showReviewer} onCheckedChange={(checked) => updateField('showReviewer', checked)} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Cover images</CardTitle>
            <CardDescription>The picture every post gets — on the blog, in post cards, in the latest-posts block and when a post is shared</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={blogCoverStyle(localSettings)}
              onValueChange={(v) => updateField('coverStyle', v === 'brand' ? 'brand' : 'photo')}
              className="grid gap-3 md:grid-cols-2"
            >
              <Label htmlFor="cover-photo" className="flex items-start gap-3 rounded-md border border-border p-4 cursor-pointer has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="photo" id="cover-photo" className="mt-0.5" />
                <span className="space-y-1">
                  <span className="block font-medium">Photo</span>
                  <span className="block text-sm font-normal text-muted-foreground">The post's featured image. Agents look one up from a stock photo library when a post has none.</span>
                </span>
              </Label>
              <Label htmlFor="cover-brand" className="flex items-start gap-3 rounded-md border border-border p-4 cursor-pointer has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="brand" id="cover-brand" className="mt-0.5" />
                <span className="space-y-1">
                  <span className="block font-medium">Brand</span>
                  <span className="block text-sm font-normal text-muted-foreground">Drawn from your branding — colors, heading font and pixel gradient, with the post's title. Consistent on every post, never a stock photo.</span>
                </span>
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Rss className="h-5 w-5" />RSS Feed</CardTitle>
            <CardDescription>Configure your blog's RSS feed for subscribers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5"><Label>Enable RSS Feed</Label><p className="text-sm text-muted-foreground">Allow users to subscribe via RSS</p></div>
              <Switch checked={localSettings.rssEnabled} onCheckedChange={(checked) => updateField('rssEnabled', checked)} />
            </div>
            {localSettings.rssEnabled && (
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                <div className="space-y-2"><Label htmlFor="rssTitle">Feed Title</Label><Input id="rssTitle" value={localSettings.rssTitle} onChange={(e) => updateField('rssTitle', e.target.value)} placeholder="RSS Feed" /></div>
                <div className="space-y-2"><Label htmlFor="rssDescription">Feed Description</Label><Input id="rssDescription" value={localSettings.rssDescription} onChange={(e) => updateField('rssDescription', e.target.value)} placeholder="Latest posts from our blog" /></div>
              </div>
            )}
            {localSettings.rssEnabled && (
              <div className="pt-2 p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">RSS feed URL: <code className="bg-background px-1 py-0.5 rounded">/functions/v1/blog-rss</code></p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
