import { ArrowLeft, Bell, ChevronRight, Gauge, Info, ScanLine, Search, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@edapex/ui/components/avatar";
import { Button } from "@edapex/ui/components/button";

import { ListRow } from "@/components/shell/ListRow";
import { Screen } from "@/components/shell/Screen";

const PROFILE = { name: "Brown Onojeta", initials: "BO", school: "Bronotek Academy" } as const;

/**
 * Frame 3: settings as grouped rows, not a grid of switches.
 *
 * A settings row is a row — label and description left, control right, hairline between —
 * which is the rule the workspace already enforces on the web. Cards group *concepts*, and
 * only two things get their own card: the account, and the one section that changes how the
 * agent behaves.
 *
 * Search sits at the bottom, within thumb reach, because settings pages grow and the thing
 * you came for is rarely on the first screen.
 */
export function SettingsSurface({ onBack }: { readonly onBack: () => void }) {
  return (
    <Screen className="relative">
      <header className="flex items-center justify-between px-gutter py-2">
        <Button
          aria-label="Back"
          className="rounded-full border border-border bg-card text-foreground"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Button>
        <h1 className="text-title font-semibold tracking-tight">Settings</h1>
        <Button
          aria-label="About EDAPEX"
          className="rounded-full border border-border bg-card text-foreground"
          size="icon"
          variant="ghost"
        >
          <Info aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="scrollbar-auto flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-gutter pb-24 pt-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            className="flex min-h-row w-full items-center gap-3 px-gutter text-left outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-success text-success-foreground">
                {PROFILE.initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-body">Account</span>
            <span className="truncate text-label text-muted-foreground">{PROFILE.name}</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <ListRow control={<Value text={PROFILE.school} />} label="School" />
          <ListRow
            className="border-b-0 text-primary"
            control={<ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
            label="Invite staff"
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            className="flex min-h-row w-full items-center gap-3 px-gutter text-left outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body">Agent behaviour</span>
              <span className="mt-0.5 block text-label text-muted-foreground">
                Persona, memory, tools and approval rules
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <NavRow icon={Bell} label="Notifications" />
          <NavRow icon={ScanLine} label="Scan and OCR" />
          <NavRow icon={Gauge} label="Usage and limits" />
          <NavRow icon={Shield} label="Safety" />
          <NavRow icon={Info} label="About EDAPEX" last />
        </section>
      </div>

      <div className="float-bottom absolute inset-x-0 px-gutter">
        <Button
          className="min-h-comfortable w-full justify-start rounded-dock border-border bg-card text-label text-muted-foreground"
          variant="outline"
        >
          <Search aria-hidden="true" className="size-4" />
          Search settings
        </Button>
      </div>
    </Screen>
  );
}

function Value({ text }: { readonly text: string }) {
  return <span className="truncate text-label text-muted-foreground">{text}</span>;
}

function NavRow({
  icon: Icon,
  label,
  last = false
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly last?: boolean;
}) {
  return (
    <ListRow
      className={last ? "border-b-0" : undefined}
      control={<ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
      label={label}
      leading={<Icon aria-hidden="true" className="size-5" />}
      onPress={() => undefined}
    />
  );
}
