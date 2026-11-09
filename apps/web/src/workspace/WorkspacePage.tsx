import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type {
  CapabilityManifest,
  ChatMessage,
  ChatMessagePart,
  WorkspaceRuntimeView
} from "@edapex/contracts";

import { LoginPanel } from "../LoginPanel";
import {
  apiBase,
  getSession,
  loadCapabilities,
  requestMagicLink
} from "../api";
import type { SessionView } from "../api";
import { WorkspaceError, WorkspaceSkeleton, WorkspaceStatus } from "./WorkspaceChrome";
import { WorkspaceView } from "./WorkspaceView";

type SessionState = "loading" | "anonymous" | "authenticated";
type AuthMode = "google" | "email";

const initialMessages = (role: CapabilityManifest["role"]): readonly ChatMessage[] => {
  const now = Date.now();
  return [
    {
      id: "runtime-notice",
      role: "system",
      createdAt: now,
      parts: [
        {
          kind: "text",
          text: "Local preview. The xcodex runtime is not connected, so no message is sent."
        }
      ]
    },
    {
      id: "welcome",
      role: "assistant",
      createdAt: now + 1,
      parts: [
        {
          kind: "text",
          text: `Welcome to EdApex Work. Your ${role} capability manifest is loaded. I can help with school records, reports and planning; changes that affect school data stop for your approval.`
        }
      ]
    }
  ];
};

const previewRuntime: WorkspaceRuntimeView = {
  connected: false,
  state: "idle",
  turn: {
    state: "idle",
    stoppable: false,
    queueCount: 0,
    serverQueueCount: 0,
    lastSeenAt: null
  }
};

const nextMessage = (
  role: ChatMessage["role"],
  parts: readonly ChatMessagePart[]
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  createdAt: Date.now(),
  parts
});

export function WorkspacePage() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [manifest, setManifest] = useState<CapabilityManifest | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("google");
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const academicId = Number(window.localStorage.getItem("edapex.academicId") ?? "5");

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((current) => {
        if (cancelled) return;
        setSession(current);
        setSessionState(current === null ? "anonymous" : "authenticated");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSessionState("anonymous");
        setError(cause instanceof Error ? cause.message : "Session check failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authenticated") return;
    let cancelled = false;
    setLoadingManifest(true);
    setError("");
    loadCapabilities(academicId)
      .then((loaded) => {
        if (cancelled) return;
        setManifest(loaded);
        setMessages(initialMessages(loaded.role));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load capabilities");
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicId, sessionState, reloadToken]);

  useEffect(() => {
    if (!loadingManifest || manifest !== null) {
      setShowSkeleton(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSkeleton(true), 150);
    return () => window.clearTimeout(timer);
  }, [loadingManifest, manifest]);

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (email.trim().length === 0) return;
    setAuthSending(true);
    setError("");
    try {
      await requestMagicLink(email.trim());
      setAuthMessage("Check your inbox. The link is valid for 15 minutes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the magic link");
    } finally {
      setAuthSending(false);
    }
  };

  const onSend = (text: string, attachmentNames: readonly string[]): void => {
    if (!previewRuntime.connected) return;
    const attachmentText =
      attachmentNames.length > 0 ? `\n\nAttached: ${attachmentNames.join(", ")}` : "";
    setMessages((current) => [
      ...current,
      nextMessage("user", [{ kind: "text", text: `${text}${attachmentText}` }])
    ]);
  };

  const onApproval = (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ): void => {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          parts: message.parts.map((part) =>
            part.kind === "approval" && part.approvalRequestId === approvalRequestId
              ? { ...part, status: decision }
              : part
          )
        };
      })
    );
  };

  if (sessionState === "loading") {
    return (
      <div className="flex h-dvh w-full justify-center bg-background">
        <div className="flex h-full w-full max-w-[430px] flex-col border-x border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <div className="text-sm font-semibold">EdApex Work</div>
            <WorkspaceStatus connected={false} label="Restoring" />
          </div>
          <WorkspaceSkeleton />
        </div>
      </div>
    );
  }

  if (sessionState === "anonymous") {
    return (
      <LoginPanel
        authMessage={authMessage}
        authMode={authMode}
        description="Sign in with the Google account linked to your school account, or request a magic link. The workspace keeps EdApex data on Cloudflare."
        email={email}
        error={error}
        eyebrow="EdApex workspace"
        onEmailChange={setEmail}
        onGoogle={() => window.location.assign(`${apiBase()}/api/v1/auth/google/start`)}
        onMagicLink={(event) => void sendMagicLink(event)}
        onModeChange={setAuthMode}
        sending={authSending}
        title="Sign in to your workspace"
      />
    );
  }

  if (manifest === null) {
    return (
      <div className="flex h-dvh w-full justify-center bg-background">
        <div className="flex h-full w-full max-w-[430px] flex-col border-x border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <div className="text-sm font-semibold">EdApex Work</div>
            <WorkspaceStatus connected={false} label="Loading" />
          </div>
          {showSkeleton ? (
            <WorkspaceSkeleton />
          ) : error.length > 0 ? (
            <WorkspaceError
              message={error}
              onRetry={() => setReloadToken((value) => value + 1)}
            />
          ) : (
            <WorkspaceSkeleton compact />
          )}
        </div>
      </div>
    );
  }

  return (
    <WorkspaceView
      manifest={manifest}
      messages={messages}
      onApproval={onApproval}
      onOpenAdmin={() => window.location.assign("/admin/claim-links")}
      onSend={onSend}
      runtime={previewRuntime}
      userName={session?.user.fullName ?? session?.user.email ?? "Signed in"}
    />
  );
}
