"use client";

import { ChevronsUpDown, LogOut, Settings, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@edapex/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@edapex/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";

/**
 * The sidebar footer account block.
 *
 * Follows shadcn's `NavUser`: avatar, two lines, chevron, opening upward. The trigger is
 * `SidebarMenuButton size="lg"` so the collapsed rail keeps just the avatar tile, which is
 * the one thing in this block that has to survive at 50px.
 *
 * No image is loaded. A teacher's avatar would be a network request per page load for a
 * 32px circle, and an initials tile is legible, instant, and cannot fail — a broken image
 * icon next to your own name is a particularly bad first impression.
 */
export interface SidebarUserProps {
  readonly name: string;
  readonly email: string | null;
  readonly role: string;
  readonly onSignOut: (() => void) | undefined;
  readonly onAdmin: (() => void) | undefined;
  readonly onSettings: (() => void) | undefined;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export function SidebarUser({
  name,
  email,
  role,
  onSignOut,
  onAdmin,
  onSettings
}: SidebarUserProps) {
  const { isMobile, open } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
              // A tooltip is only useful when the label is hidden, and shadcn's tooltip
              // would fight the dropdown on the same element.
              tooltip={open ? undefined : name}
            >
              <Avatar className="size-8 rounded-[var(--radius-sm)]">
                <AvatarFallback className="rounded-[var(--radius-sm)] bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {email ?? role}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-[var(--radius-md)]"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Avatar className="size-8 rounded-[var(--radius-sm)]">
                  <AvatarFallback className="rounded-[var(--radius-sm)] bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {email ?? role}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Only rendered when the destination exists: a menu item that does nothing
                is worse than an absent one, because it reads as a broken feature. */}
            {onAdmin === undefined ? null : (
              <DropdownMenuItem onSelect={onAdmin}>
                <ShieldCheck aria-hidden="true" />
                Admin
              </DropdownMenuItem>
            )}
            {onSettings === undefined ? null : (
              <DropdownMenuItem onSelect={onSettings}>
                <Settings aria-hidden="true" />
                Settings
              </DropdownMenuItem>
            )}

            {onAdmin === undefined && onSettings === undefined ? null : (
              <DropdownMenuSeparator />
            )}

            {onSignOut === undefined ? null : (
              <DropdownMenuItem onSelect={onSignOut}>
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
