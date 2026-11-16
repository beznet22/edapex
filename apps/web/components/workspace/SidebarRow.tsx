"use client";

import Link from "next/link";
import {
  Archive,
  ArrowUpDown,
  Check,
  ChevronDown,
  Folder,
  FolderInput,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Share2,
  SlidersHorizontal,
  Trash2,
  Plus
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { SidebarGroupLabel } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * A conversation row: label, and on hover a pin toggle plus an overflow menu.
 *
 * The actions are declarative (`SidebarRowActions`) rather than hardcoded, because the
 * same row serves Pinned and Recents where the pin action means the opposite thing. A
 * row that offers "Pin" when it is already pinned is the kind of detail that makes a menu
 * feel untrustworthy.
 */
export interface SidebarRowActions {
  readonly onRename?: (() => void) | undefined;
  readonly onTogglePin?: (() => void) | undefined;
  readonly pinned?: boolean;
  readonly onLock?: (() => void) | undefined;
  readonly onShare?: (() => void) | undefined;
  readonly onArchive?: (() => void) | undefined;
  readonly onDelete?: (() => void) | undefined;
  readonly onMoveToProject?: (() => void) | undefined;
}

export function SidebarRow({
  id,
  label,
  href,
  active = false,
  actions
}: {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly active?: boolean;
  readonly actions?: SidebarRowActions | undefined;
}) {
  const hasActions = actions !== undefined;

  return (
    <div
      className={cn(
        "group/row flex items-center rounded-[var(--radius-sm)] pr-1",
        "hover:bg-sidebar-accent",
        active && "bg-sidebar-accent"
      )}
      data-sidebar-row={id}
    >
      <Link
        className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        href={href}
      >
        {label}
      </Link>

      {/*
        The two affordances stay mounted and fade in on hover. Mounting them on hover
        would shrink the row's hit area as the pointer approaches, so the row would flicker
        between states.
      */}
      {hasActions ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <RowButton
            active={actions.pinned === true}
            label={actions.pinned === true ? "Unpin" : "Pin"}
            onClick={actions.onTogglePin}
          >
            {actions.pinned === true ? (
              <Pin aria-hidden="true" className="size-3.5 fill-current" />
            ) : (
              <Pin aria-hidden="true" className="size-3.5" />
            )}
          </RowButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`More actions for ${label}`}
                className="flex size-6 items-center justify-center rounded-[var(--radius-xs)] text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                type="button"
              >
                <MoreHorizontal aria-hidden="true" className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-52">
              <RowItem icon={Pencil} label="Rename" onSelect={actions.onRename} />
              <RowItem
                icon={actions.pinned === true ? PinOff : Pin}
                label={actions.pinned === true ? "Unpin" : "Pin"}
                onSelect={actions.onTogglePin}
              />
              <RowItem icon={Lock} label="Lock conversation" onSelect={actions.onLock} />
              <DropdownMenuSeparator />
              <RowItem icon={Share2} label="Share" onSelect={actions.onShare} />
              <DropdownMenuSeparator />
              <RowItem icon={Archive} label="Archive" onSelect={actions.onArchive} />
              <RowItem destructive icon={Trash2} label="Delete" onSelect={actions.onDelete} />
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput aria-hidden="true" />
                  Move to project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {/*
                    Empty until projects exist. A submenu that lists nothing is honest;
                    one listing invented projects would create rows in a store that has no
                    project table.
                  */}
                  <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
                    No projects yet
                  </p>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function RowButton({
  label,
  active = false,
  onClick,
  children
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: (() => void) | undefined;
  readonly children: React.ReactNode;
}) {
  if (onClick === undefined) return null;
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-[var(--radius-xs)] outline-none transition-colors",
        "hover:bg-background focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function RowItem({
  icon: Icon,
  label,
  onSelect,
  destructive = false
}: {
  readonly icon: typeof Pencil;
  readonly label: string;
  readonly onSelect: (() => void) | undefined;
  readonly destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      className={destructive ? "text-destructive focus:text-destructive" : undefined}
      disabled={onSelect === undefined}
      onSelect={onSelect}
    >
      <Icon aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
}

/**
 * A section heading with its actions: chevron to collapse, filter and add for Projects.
 *
 * `label` is rendered through shadcn's own `SidebarGroupLabel` so the collapse behaviour
 * (`group-data-[collapsible=icon]:opacity-0`) stays in one place.
 */
export function SidebarSectionHeader({
  label,
  collapsible = false,
  collapsed = false,
  onToggle,
  onFilter,
  onAdd,
  sortByProject = false,
  onSortChange
}: {
  readonly label: string;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean;
  readonly onToggle?: (() => void) | undefined;
  /** Renders the filter menu. `undefined` omits the control entirely. */
  readonly onFilter?: (() => void) | undefined;
  readonly onAdd?: (() => void) | undefined;
  /** Current sort mode, for the filter menu's check mark. */
  readonly sortByProject?: boolean;
  readonly onSortChange?: ((byProject: boolean) => void) | undefined;
}) {
  return (
    <SidebarGroupLabel asChild>
      <div className="group/section flex w-full items-center gap-1 pr-1">
        {collapsible ? (
          <button
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-[var(--radius-xs)] text-left outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={onToggle}
            type="button"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                collapsed && "-rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        )}

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
          {onFilter === undefined ? null : onSortChange === undefined ? (
            <SectionButton label={`Filter ${label.toLowerCase()}`} onClick={onFilter}>
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            </SectionButton>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Filter ${label.toLowerCase()}`}
                  className="flex size-5 items-center justify-center rounded-[var(--radius-xs)] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  type="button"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem disabled>
                  <SlidersHorizontal aria-hidden="true" />
                  Organize sidebar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowUpDown aria-hidden="true" />
                    Sort chats by
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {/*
                      A visible check rather than a toggle: the current mode must be
                      readable at a glance, and two radio items that both look unpressed
                      is the common failure of this menu.
                    */}
                    <DropdownMenuItem onSelect={() => onSortChange(false)}>
                      <List aria-hidden="true" />
                      In one list
                      {!sortByProject ? (
                        <Check aria-hidden="true" className="ml-auto" />
                      ) : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onSortChange(true)}>
                      <Folder aria-hidden="true" />
                      By project
                      {sortByProject ? (
                        <Check aria-hidden="true" className="ml-auto" />
                      ) : null}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onAdd === undefined ? null : (
            <SectionButton label={`New ${label.toLowerCase()}`} onClick={onAdd}>
              <Plus aria-hidden="true" className="size-3.5" />
            </SectionButton>
          )}
        </div>
      </div>
    </SidebarGroupLabel>
  );
}

function SectionButton({
  label,
  onClick,
  children
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-5 items-center justify-center rounded-[var(--radius-xs)] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
