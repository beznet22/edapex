import { Search, Sparkles, UserPlus } from "lucide-react";

import { Avatar, AvatarFallback } from "@edapex/ui/components/avatar";
import { Button } from "@edapex/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@edapex/ui/components/sheet";

import {
  PINNED_THREADS,
  PRIMARY_NAV,
  RECENT_THREADS,
  type SurfaceId
} from "@/lib/nav";
import { BrandMark } from "@/components/brand/BrandMark";
import { ICONS } from "@/lib/icons";

/**
 * Frame 2: the drawer, which is now the whole of navigation.
 *
 * The header carries the wordmark and a search affordance, the rows are destinations, and
 * the two sections are conversations — pinned first, because a pinned thread is a decision
 * that outlives the session.
 *
 * The footer is the one piece of Chrome ChatGPT gets right: a primary pill to start
 * something, and the account avatar on the other side, both within thumb reach rather than
 * at the top of a long column.
 */
export function AppDrawer({
  onClose,
  onSelect,
  open,
  selected
}: {
  readonly onClose: () => void;
  readonly onSelect: (id: SurfaceId | "new") => void;
  readonly open: boolean;
  readonly selected: SurfaceId;
}) {
  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent
        className="app-drawer w-5/6 max-w-sm gap-0"
        showCloseButton={false}
        side="left"
      >
        <SheetHeader className="flex-row items-center justify-between px-gutter pt-4">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-auto text-foreground" />
            <SheetTitle className="text-title font-semibold tracking-tight">EDAPEX</SheetTitle>
          </div>
          <Button
            aria-label="Search"
            className="rounded-full bg-muted text-foreground"
            size="icon"
            variant="ghost"
          >
            <Search aria-hidden="true" className="size-5" />
          </Button>
        </SheetHeader>

        <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto px-2 pb-24 pt-3">
          <nav aria-label="Destinations">
            {PRIMARY_NAV.map((entry) => {
              const Icon = ICONS[entry.icon];
              return (
                <button
                  aria-current={selected === entry.id ? "page" : undefined}
                  className="flex min-h-comfortable w-full items-center gap-3 rounded-lg px-3 text-left outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[current=true]:text-foreground"
                  key={entry.id}
                  onClick={() => onSelect(entry.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-body">{entry.label}</span>
                  {entry.badge === undefined ? null : (
                    <span className="rounded-full bg-primary px-1.5 text-chrome font-medium text-primary-foreground">
                      {entry.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              className="mt-2 flex min-h-comfortable w-full items-center gap-3 rounded-lg px-3 text-left text-primary outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelect("make")}
              type="button"
            >
              <Sparkles aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-body">New agent</span>
            </button>

            <button
              className="flex min-h-comfortable w-full items-center gap-3 rounded-lg px-3 text-left outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelect("people")}
              type="button"
            >
              <UserPlus aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-body">Invite staff</span>
            </button>
          </nav>

          <Section label="Pinned">
            {PINNED_THREADS.map((thread) => (
              <ThreadRow key={thread.id} onPress={() => onSelect("chat")} title={thread.title} />
            ))}
          </Section>

          <Section label="Chats">
            {RECENT_THREADS.map((thread) => (
              <ThreadRow key={thread.id} onPress={() => onSelect("chat")} title={thread.title} />
            ))}
          </Section>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-gutter pb-4">
          <Button
            className="pointer-events-auto rounded-dock bg-primary px-5 text-body text-primary-foreground"
            onClick={() => onSelect("new")}
            size="lg"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-primary-foreground/20">
              +
            </span>
            New chat
          </Button>
          <button
            aria-label="Account"
            className="pointer-events-auto rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelect("account")}
            type="button"
          >
            <Avatar className="size-touch">
              <AvatarFallback className="bg-success text-success-foreground">BO</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  children,
  label
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <section className="mt-5">
      <p className="px-3 pb-1 text-label font-medium text-muted-foreground">{label}</p>
      {children}
    </section>
  );
}

function ThreadRow({ title, onPress }: { readonly title: string; readonly onPress: () => void }) {
  return (
    <button
      className="flex min-h-comfortable w-full items-center gap-3 rounded-lg px-3 text-left outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onPress}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-body">{title}</span>
    </button>
  );
}
