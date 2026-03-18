import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as originalSonnerToast } from "sonner";
import { toastSilencer } from "@/lib/toast-silencer";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

const silencedToast = Object.assign(
  (...args: Parameters<typeof originalSonnerToast>) => {
    if (toastSilencer.silent) return '' as string | number;
    return originalSonnerToast(...args);
  },
  originalSonnerToast,
);

const toast = silencedToast as typeof originalSonnerToast;

export { Toaster, toast };
