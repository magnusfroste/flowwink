import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface DashboardWidgetConfig {
  id: string;
  visible: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidgetConfig[];
}

const STORAGE_KEY = 'flowwink-dashboard-layout';

function getStorageKey(userId: string) {
  return `${STORAGE_KEY}-${userId}`;
}

const DEFAULT_WIDGET_ORDER = [
  'needs-attention',
  'content-overview',
  'leads',
  'live-support',
  'chat-analytics',
  'chat-feedback',
  'aeo',
  'recent-pages',
  'quick-actions',
];

function getDefaultLayout(): DashboardLayout {
  return {
    widgets: DEFAULT_WIDGET_ORDER.map(id => ({ id, visible: true })),
  };
}

export function useDashboardLayout() {
  const { profile } = useAuth();
  const userId = profile?.id || 'anonymous';

  const [layout, setLayout] = useState<DashboardLayout>(() => {
    try {
      const stored = localStorage.getItem(getStorageKey(userId));
      if (stored) {
        const parsed = JSON.parse(stored) as DashboardLayout;
        // Merge with defaults to pick up new widgets
        const existingIds = new Set(parsed.widgets.map(w => w.id));
        const merged = [
          ...parsed.widgets,
          ...DEFAULT_WIDGET_ORDER
            .filter(id => !existingIds.has(id))
            .map(id => ({ id, visible: true })),
        ];
        return { widgets: merged };
      }
    } catch (_e) { /* ignore */ }
    return getDefaultLayout();
  });

  // Re-read from localStorage when userId changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getStorageKey(userId));
      if (stored) {
        const parsed = JSON.parse(stored) as DashboardLayout;
        const existingIds = new Set(parsed.widgets.map(w => w.id));
        const merged = [
          ...parsed.widgets,
          ...DEFAULT_WIDGET_ORDER
            .filter(id => !existingIds.has(id))
            .map(id => ({ id, visible: true })),
        ];
        setLayout({ widgets: merged });
      } else {
        setLayout(getDefaultLayout());
      }
    } catch (_e) {
      setLayout(getDefaultLayout());
    }
  }, [userId]);

  const saveLayout = useCallback((newLayout: DashboardLayout) => {
    setLayout(newLayout);
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(newLayout));
    } catch (_e) { /* ignore */ }
  }, [userId]);

  const toggleWidget = useCallback((widgetId: string) => {
    setLayout(prev => {
      const updated = {
        widgets: prev.widgets.map(w =>
          w.id === widgetId ? { ...w, visible: !w.visible } : w
        ),
      };
      try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
      } catch (_e) { /* ignore */ }
      return updated;
    });
  }, [userId]);

  const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const widgets = [...prev.widgets];
      const [moved] = widgets.splice(fromIndex, 1);
      widgets.splice(toIndex, 0, moved);
      const updated = { widgets };
      try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
      } catch (_e) { /* ignore */ }
      return updated;
    });
  }, [userId]);

  const resetLayout = useCallback(() => {
    const defaultLayout = getDefaultLayout();
    setLayout(defaultLayout);
    try {
      localStorage.removeItem(getStorageKey(userId));
    } catch (_e) { /* ignore */ }
  }, [userId]);

  const isWidgetVisible = useCallback((widgetId: string) => {
    return layout.widgets.find(w => w.id === widgetId)?.visible ?? true;
  }, [layout]);

  const getWidgetOrder = useCallback(() => {
    return layout.widgets.map(w => w.id);
  }, [layout]);

  return {
    layout,
    toggleWidget,
    reorderWidgets,
    resetLayout,
    isWidgetVisible,
    getWidgetOrder,
    saveLayout,
  };
}
