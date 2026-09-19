// Shared "three dots" navigation menu so every page can reach the main tools.
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Charts" },
  { to: "/markets", label: "Indices & ETFs" },
  { to: "/breadth", label: "Breadth" },
  { to: "/band-alerts", label: "Circuit band alerts" },
  { to: "/price-alerts", label: "Price alerts (Telegram)" },
  { to: "/position-analyzer", label: "Position analyzer" },
  { to: "/screeners", label: "Screeners" },
  { to: "/journal", label: "Journal" },
];

export function NavMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1 px-2" aria-label="Go to module" title="Go to module">
          <Menu className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Modules</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {LINKS.map((l) => (
          <DropdownMenuItem key={l.to} asChild>
            <Link to={l.to}>{l.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
