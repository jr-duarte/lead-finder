"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * Searchable multi-select: like Combobox, but the list stays open so several
 * options can be ticked in a row. An empty selection means "all".
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Selecionar",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  allLabel = "Todos",
  getLabel = (option) => option,
  countLabel = (count) => `${count} selecionadas`,
  className,
  disabled,
}: {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  /** Text shown (and searched) for an option, e.g. a country name. */
  getLabel?: (option: string) => string
  /** Trigger text when several are picked. */
  countLabel?: (count: number) => string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  allLabel?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = React.useMemo(() => new Set(value), [value])

  const toggle = (option: string) =>
    onChange(
      selected.has(option)
        ? value.filter((item) => item !== option)
        : [...value, option]
    )

  // Ticked options first, so the selection is visible without scrolling.
  const sorted = React.useMemo(
    () => [
      ...options.filter((option) => selected.has(option)),
      ...options.filter((option) => !selected.has(option)),
    ],
    // Reordering while the list is open would move items under the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, open]
  )

  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? getLabel(value[0])
        : countLabel(value.length)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          title={value.length > 1 ? value.map(getLabel).join(", ") : undefined}
          className={cn(
            "w-full justify-between font-normal",
            value.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => onChange([])}>
                <Check
                  className={cn(
                    "size-4",
                    value.length === 0 ? "opacity-100" : "opacity-0"
                  )}
                />
                {allLabel}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {sorted.map((option) => (
                <CommandItem
                  key={option}
                  value={getLabel(option)}
                  keywords={[option]}
                  onSelect={() => toggle(option)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected.has(option) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{getLabel(option)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
