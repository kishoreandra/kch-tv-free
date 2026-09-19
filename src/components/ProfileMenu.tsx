// Shared profile menu: signed-in avatar + dropdown with keyboard tips,
// admin links and sign out. Used across every page so the profile is
// always reachable regardless of which route the user is on.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { HelpCircle, Shield } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { AdminApprovalsButton } from "@/components/AdminApprovals";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { NavMenu } from "@/components/NavMenu";

type Row = { keys: string[]; desc: string; where?: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Global",
    rows: [
      { keys: ["⌘/Ctrl", "K"], desc: "Open the symbol search palette", where: "anywhere" },
      { keys: ["/"], desc: "Open the symbol search palette", where: "anywhere" },
      { keys: ["\\", "B"], desc: "Toggle the watchlist sidebar", where: "Charts" },
      { keys: ["Esc"], desc: "Un-focus the active pane / close popover" },
      { keys: ["Shift", "W"], desc: "Add current symbol to the last-used watchlist", where: "Charts" },
      { keys: ["0"], desc: "Restore the grid (show all panes)", where: "Charts" },
      { keys: ["1"], desc: "Focus pane 1 (also 2..9 for other panes)", where: "Charts" },
    ],
  },
  {
    title: "Watchlist navigation",
    rows: [
      { keys: ["↓", "j"], desc: "Next stock in the current list" },
      { keys: ["↑", "k"], desc: "Previous stock in the current list" },
      { keys: ["PgDn"], desc: "Jump 10 stocks down" },
      { keys: ["PgUp"], desc: "Jump 10 stocks up" },
      { keys: ["Home"], desc: "Jump to first stock" },
      { keys: ["End"], desc: "Jump to last stock" },
    ],
  },
  {
    title: "Chart drawing tools",
    rows: [
      { keys: ["Shift", "H"], desc: "Horizontal line + note" },
      { keys: ["Shift", "S"], desc: "Trend line (two clicks)" },
      { keys: ["Shift", "drag"], desc: "Measurement tool (Δ, %, bars)" },
      { keys: ["Ctrl/⌘", "click"], desc: "Snap to nearest OHLC while drawing" },
      { keys: ["Delete", "Backspace"], desc: "Delete the selected drawing" },
      { keys: ["Esc"], desc: "Cancel the current drawing / deselect" },
    ],
  },
  {
    title: "Touch",
    rows: [
      { keys: ["Swipe ↑↓"], desc: "Next / previous stock in the list" },
      { keys: ["Long-press"], desc: "Open the kebab menu on watchlists / rows" },
      { keys: ["Drag rail"], desc: "Resize the sidebar (double-tap to reset)" },
    ],
  },
];

export function ProfileMenu({
  withAdminApprovals = true,
  withNavMenu = true,
}: { withAdminApprovals?: boolean; withNavMenu?: boolean } = {}) {
  const { isAdmin } = useAuth();
  const [tipsOpen, setTipsOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);

  return (
    <>
      {withNavMenu && <NavMenu />}
      <AuthButton
        extraMenuItems={
          <>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTipsOpen(true); }}>
              <HelpCircle className="mr-2 h-4 w-4" /> Shortcuts & tips
            </DropdownMenuItem>
            {isAdmin && withAdminApprovals && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setApprovalsOpen(true); }}>
                <Shield className="mr-2 h-4 w-4" /> Approvals
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/admin/scanners">
                  <Shield className="mr-2 h-4 w-4" /> Scanner editor
                </Link>
              </DropdownMenuItem>
            )}
          </>
        }
      />

      {isAdmin && withAdminApprovals && (
        <AdminApprovalsButton hideTrigger open={approvalsOpen} onOpenChange={setApprovalsOpen} />
      )}

      <Dialog open={tipsOpen} onOpenChange={setTipsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts & tips</DialogTitle>
            <DialogDescription className="text-xs">
              Shortcuts don't fire while you're typing in an input.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </h3>
                <ul className="space-y-1.5">
                  {g.rows.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="flex shrink-0 items-center gap-1">
                        {r.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                      <span className="flex-1">
                        {r.desc}
                        {r.where && (
                          <span className="ml-1 text-[10px] text-muted-foreground">· {r.where}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
