import { Button } from "@edapex/ui/components/button";
import { BrandMark } from "@/components/brand/BrandMark";
import { Screen } from "@/components/shell/Screen";

/**
 * Two states, one screen.
 *
 * `waiting` is not a spinner over the whole screen on purpose: the person has left the app
 * for a browser, and a sheet that says what is happening is more useful than a blank page
 * they cannot act on. The typed failure is shown where the button is, not as a toast that
 * disappears before it is read.
 */
export function SignIn({
  error,
  onCancel,
  onStart,
  phase
}: {
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onStart: () => void;
  readonly phase: "idle" | "waiting";
}) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col px-6">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <BrandMark className="h-auto w-2/5 text-foreground" />
        <h1 className="text-title text-balance">
          {phase === "waiting" ? "Waiting for your browser" : "Sign in to Edapex"}
        </h1>
        <p className="text-body text-pretty text-muted-foreground">
          {phase === "waiting"
            ? "Finish signing in there and come back. This screen closes itself when the code arrives."
            : "Your school account is the only way in. Nothing is stored on this device except the session, in the system keychain."}
        </p>
        {error === null ? null : (
          <p className="text-body text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="screen-bottom flex flex-col gap-3 pb-8">
        <Button className="w-full" onClick={onStart}>
          {phase === "waiting" ? "Open the browser again" : "Continue with Google"}
        </Button>
        {phase === "waiting" ? (
          <Button className="w-full" onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        ) : null}
      </div>
      </div>
    </Screen>
  );
}
