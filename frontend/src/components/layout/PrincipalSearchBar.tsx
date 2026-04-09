import { useEffect, useState } from 'react'
import { Brain, Zap, DollarSign, Settings } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command.js"

/**
 * PrincipalSearchBar
 * The central agentic entry point for EdApex.
 * Uses official shadcn CommandDialog components.
 * Responds to Cmd+K and routes intents to the PrincipalAgent.
 */

export function PrincipalSearchBar() {
  const [open, setOpen] = useState(false)

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelect = (intent: string) => {
    console.log(`Dispatching intent: ${intent}`)
    // Logic: Map input to PrincipalAgent.dispatch(intent)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="What is the objective?" />
      <CommandList className="bg-(--island-shell) border-t border-(--line)">
        <CommandEmpty className="p-4 text-center text-sm text-(--sea-ink-soft)">
          No results found. Start typing to dispatch an intent...
        </CommandEmpty>

        <CommandGroup heading="Agentic Intents" className="text-(--kicker)">
          <CommandItem onSelect={() => handleSelect('decompose')} className="flex items-center gap-2 cursor-pointer">
            <Brain className="h-4 w-4" />
            <span>Decompose complex goal...</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('execute')} className="flex items-center gap-2 cursor-pointer">
            <Zap className="h-4 w-4" />
            <span>Execute quick task...</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator className="bg-(--line)" />

        <CommandGroup heading="Ledgers" className="text-(--kicker)">
          <CommandItem onSelect={() => handleSelect('ledgers')} className="flex items-center gap-2 cursor-pointer">
            <DollarSign className="h-4 w-4" />
            <span>Review Financial Ledger</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('settings')} className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            <span>Manage System Configuration</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      
      <div className="border-t border-(--line) bg-(--bg-base) px-4 py-2 text-[10px] text-(--sea-ink-soft) flex justify-between">
        <span>Tip: Use Cmd+K to jump here anytime</span>
        <span>Press Esc to close</span>
      </div>
    </CommandDialog>
  )
}
