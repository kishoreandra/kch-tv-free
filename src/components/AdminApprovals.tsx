import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listPendingProfiles, setProfileApproval } from "@/lib/admin.functions";

export function AdminApprovalsButton({
  className,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: {
  className?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const list = useServerFn(listPendingProfiles);
  const setApproval = useServerFn(setProfileApproval);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => list(),
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: (v: { userId: string; approved: boolean }) => setApproval({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.approved ? "User approved" : "Approval revoked");
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const profiles = q.data?.profiles ?? [];
  const pending = profiles.filter((p: any) => !p.approved);
  const approved = profiles.filter((p: any) => p.approved);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className={className}>
            <Shield className="mr-1 h-3.5 w-3.5" />
            Approvals {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pending.length}</span>}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>User access approvals</DialogTitle>
          <DialogDescription>Approve new sign-ups so they can use the app.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Pending ({pending.length})</h3>
              {pending.length === 0 ? (
                <p className="text-muted-foreground text-xs">No pending requests.</p>
              ) : (
                <ul className="space-y-1">
                  {pending.map((p: any) => (
                    <li key={p.user_id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                      <div>
                        <div className="font-medium">{p.email ?? p.user_id}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
                      </div>
                      <Button size="sm" onClick={() => mut.mutate({ userId: p.user_id, approved: true })} disabled={mut.isPending}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Approve
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Approved ({approved.length})</h3>
              <ul className="space-y-1 max-h-60 overflow-auto">
                {approved.map((p: any) => (
                  <li key={p.user_id} className="flex items-center justify-between rounded border border-border/50 px-3 py-1.5">
                    <div className="text-xs">
                      {p.email ?? p.user_id}
                      {p.is_admin && <span className="ml-2 rounded bg-primary/10 px-1.5 text-[10px] text-primary">admin</span>}
                    </div>
                    {!p.is_admin && (
                      <Button size="sm" variant="ghost" onClick={() => mut.mutate({ userId: p.user_id, approved: false })} disabled={mut.isPending}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
