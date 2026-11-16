/**
 * `cn` lives in `@edapex/ui` so the web app and the Android app merge classes with the same
 * `tailwind-merge` instance. Re-exported here so the forty existing `@/lib/utils` imports
 * keep working without a codemod that would only move the string around.
 */
export { cn } from "@edapex/ui/lib/utils";
