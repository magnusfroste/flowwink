import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useKbCategories, useCreateKbCategory, useUpdateKbCategory } from "@/hooks/useKnowledgeBase";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  description: z.string().optional(),
  icon: z.string().default("HelpCircle"),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface KbCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId?: string | null;
}

export function KbCategoryDialog({ open, onOpenChange, categoryId }: KbCategoryDialogProps) {
  const { data: categories } = useKbCategories();
  const createCategory = useCreateKbCategory();
  const updateCategory = useUpdateKbCategory();

  const existingCategory = categories?.find(c => c.id === categoryId);
  const isEditing = !!categoryId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      icon: "HelpCircle",
      is_active: true,
    },
  });

  useEffect(() => {
    if (existingCategory) {
      form.reset({
        name: existingCategory.name,
        slug: existingCategory.slug,
        description: existingCategory.description || "",
        icon: existingCategory.icon,
        is_active: existingCategory.is_active,
      });
    } else {
      form.reset({
        name: "",
        slug: "",
        description: "",
        icon: "HelpCircle",
        is_active: true,
      });
    }
  }, [existingCategory, form]);

  // Auto-generate slug from name
  const watchName = form.watch("name");
  useEffect(() => {
    if (!isEditing && watchName) {
      const slug = watchName
        .toLowerCase()
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", slug);
    }
  }, [watchName, isEditing, form]);

  const onSubmit = async (values: FormValues) => {
    if (isEditing && categoryId) {
      await updateCategory.mutateAsync({ id: categoryId, ...values });
    } else {
      await createCategory.mutateAsync({ 
        name: values.name,
        slug: values.slug,
        description: values.description,
        icon: values.icon,
        is_active: values.is_active,
      });
    }
    onOpenChange(false);
  };

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Getting Started" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="getting-started" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="A brief description..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">Show category on public pages</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Category"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
