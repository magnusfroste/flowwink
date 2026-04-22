import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function MyExpensesPage() {
  const { user } = useAuth();
  const { isEmployee } = useEmployeeSelf();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("travel");
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["my_expenses", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user!.id)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const cents = Math.round(parseFloat(amount.replace(",", ".") || "0") * 100);
      if (!cents || cents <= 0) throw new Error("Enter a valid amount");
      if (!description.trim()) throw new Error("Description required");
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        description,
        amount_cents: cents,
        category,
        vendor: vendor || null,
        expense_date: expenseDate,
        status: "submitted",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense submitted");
      setDescription("");
      setAmount("");
      setVendor("");
      qc.invalidateQueries({ queryKey: ["my_expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {!isEmployee && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Tip: Ask your administrator to link your account to an employee profile so HR sees these in the same context.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Submit expense
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Client lunch in Stockholm" />
            </div>
            <div className="space-y-2">
              <Label>Amount (incl. VAT)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="meals">Meals</SelectItem>
                  <SelectItem value="lodging">Lodging</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                  <SelectItem value="software">Software</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendor (optional)</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. SAS" />
            </div>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Submitting…" : "Submit expense"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>My expenses</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !expenses?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No expenses yet.</p>
          ) : (
            <ul className="divide-y">
              {expenses.map((e: any) => (
                <li key={e.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(e.expense_date), "MMM d, yyyy")} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="tabular-nums font-medium">
                      {(e.amount_cents / 100).toLocaleString(undefined, { style: "currency", currency: e.currency || "SEK" })}
                    </span>
                    <Badge variant="outline" className={STATUS_COLORS[e.status] || ""}>{e.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
