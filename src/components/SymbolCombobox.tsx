// Searchable symbol picker backed by the app's NSE symbol master list.
// Matches on ticker or company name and shows an exchange badge.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { NSE_SYMBOLS } from "@/data/nse-symbols";

interface Props {
  value: string;
  onChange: (ticker: string) => void;
  placeholder?: string;
  className?: string;
}

export function SymbolCombobox({ value, onChange, placeholder = "Search symbol…", className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(() => NSE_SYMBOLS.filter((s) => !s.isIndex), []);
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return options.slice(0, 60);
    return options
      .filter((s) => s.ticker.includes(q) || s.name.toUpperCase().includes(q))
      .slice(0, 60);
  }, [options, query]);

  const selected = options.find((s) => s.ticker === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8 w-full justify-between text-sm font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.ticker} · ${selected.name}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Ticker or company name…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching symbol.</CommandEmpty>
            <CommandGroup>
              {filtered.map((s) => (
                <CommandItem
                  key={s.ticker}
                  value={s.ticker}
                  onSelect={() => {
                    onChange(s.ticker);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-3.5 w-3.5", value === s.ticker ? "opacity-100" : "opacity-0")}
                  />
                  <span className="font-medium">{s.ticker}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{s.name}</span>
                  <span className="ml-auto rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
                    NSE
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
