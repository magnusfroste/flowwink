import { useState, useEffect } from 'react';
import { Globe, Download, CheckCircle2, XCircle, Plug, Chrome, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useExtensionRelay } from '@/hooks/useExtensionRelay';
import { toast } from 'sonner';
import JSZip from 'jszip';

const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content-global.js',
  'popup.html',
  'popup.js',
];

export default function BrowserControlPage() {
  const relay = useExtensionRelay();
  const [extensionId, setExtensionId] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('flowwink_extension_id');
    if (saved) setExtensionId(saved);
  }, []);

  const handleConnect = async () => {
    if (!extensionId.trim()) {
      toast.error('Enter a valid Extension ID');
      return;
    }
    setIsChecking(true);
    relay.setExtensionId(extensionId.trim());
    // Give it a moment to detect
    await new Promise(r => setTimeout(r, 2500));
    setIsChecking(false);
    if (relay.extensionStatus.installed) {
      toast.success(`Connected to extension v${relay.extensionStatus.version}`);
    } else {
      toast.error('Extension not detected. Make sure it\'s installed and the ID is correct.');
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      
      // Fetch each extension file from public/
      for (const file of EXTENSION_FILES) {
        const resp = await fetch(`/chrome-extension/${file}`);
        if (!resp.ok) throw new Error(`Failed to fetch ${file}`);
        const text = await resp.text();
        zip.file(file, text);
      }

      // Try to fetch icons
      for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
        try {
          const resp = await fetch(`/chrome-extension/icons/${icon}`);
          if (resp.ok) {
            const blob = await resp.blob();
            zip.file(`icons/${icon}`, blob);
          }
        } catch {
          // Icons are optional
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signal-capture-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Extension downloaded! Unzip and install in Chrome.');
    } catch (err) {
      toast.error('Failed to create download');
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyId = () => {
    if (relay.extensionStatus.extensionId) {
      navigator.clipboard.writeText(relay.extensionStatus.extensionId);
      toast.success('Extension ID copied');
    }
  };

  return (
    <AdminLayout>
      <AdminContentHeader />
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Browser Control</h1>
            <p className="text-muted-foreground mt-1">
              Chrome Extension for authenticated web browsing — lets FlowPilot read LinkedIn, X, and other login-walled sites using your browser session.
            </p>
          </div>

          {/* Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Connection Status
                </CardTitle>
                <Badge variant={relay.extensionStatus.installed ? 'default' : 'secondary'}>
                  {relay.extensionStatus.installed ? (
                    <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
                  ) : (
                    <><XCircle className="h-3 w-3 mr-1" /> Not detected</>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {relay.extensionStatus.installed ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono">{relay.extensionStatus.version}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Extension ID</span>
                    <button onClick={handleCopyId} className="font-mono text-xs flex items-center gap-1 hover:text-primary transition-colors">
                      {relay.extensionStatus.extensionId?.slice(0, 16)}…
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste Chrome Extension ID here"
                      value={extensionId}
                      onChange={e => setExtensionId(e.target.value)}
                      className="font-mono text-sm"
                      onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    />
                    <Button onClick={handleConnect} disabled={isChecking} size="sm">
                      {isChecking ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Connect'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Find your Extension ID at <code className="px-1 py-0.5 bg-muted rounded text-[10px]">chrome://extensions</code> with Developer mode enabled.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Download & Install */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                Install Extension
              </CardTitle>
              <CardDescription>
                Download, unzip, and load in Chrome Developer mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleDownload} disabled={isDownloading} variant="outline" className="w-full">
                <Chrome className="h-4 w-4 mr-2" />
                {isDownloading ? 'Preparing download…' : 'Download Signal Capture Extension (.zip)'}
              </Button>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Installation Steps</h4>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</span>
                    <span>Click <strong className="text-foreground">Download</strong> above and unzip the file</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</span>
                    <span>Open <code className="px-1 py-0.5 bg-muted rounded text-xs">chrome://extensions</code> in Chrome</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</span>
                    <span>Enable <strong className="text-foreground">Developer mode</strong> (toggle top-right)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">4</span>
                    <span>Click <strong className="text-foreground">Load unpacked</strong> and select the unzipped folder</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">5</span>
                    <span>Copy the <strong className="text-foreground">Extension ID</strong> shown under the extension name</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">6</span>
                    <span>Paste it in the <strong className="text-foreground">Connection Status</strong> card above</span>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" />
                How it Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                When FlowPilot needs to read a <strong className="text-foreground">login-walled site</strong> (LinkedIn, X, Facebook, etc.), 
                instead of server-side scraping (which gets blocked), it uses your Chrome Extension to read the page through your 
                <strong className="text-foreground"> real browser session</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="text-xs font-medium text-foreground">🔒 ToS-Safe</div>
                  <div className="text-xs">Uses your authenticated browser session — indistinguishable from normal browsing</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="text-xs font-medium text-foreground">🔄 Automatic</div>
                  <div className="text-xs">FlowPilot automatically routes to the extension for login-walled URLs</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="text-xs font-medium text-foreground">⚡ Signal Capture</div>
                  <div className="text-xs">Press ⌘⇧S on any page to capture content directly to FlowPilot</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
