  Full system diagram

  ╔══════════════════════════════════════════════════════════════════════════════╗
    ║                                 HOSTS                                        ║
    ╠══════════════════════════════════════════════════════════════════════════════╣
    ║                                                                              ║
    ║  WEB (PWA)                    DESKTOP (Tauri)          MOBILE (Tauri)        ║
    ║  ┌──────────────────┐         ┌──────────────────┐     ┌──────────────────┐  ║
    ║  │ Browser tab      │         │ Frameless window │     │ Fullscreen       │  ║
    ║  │ titlebar: none   │         │ titlebar: ours   │     │ edge-to-edge     │  ║
    ║  └────────┬─────────┘         └────────┬─────────┘     └────────┬─────────┘  ║
    ╚═══════════╪════════════════════════════╪════════════════════════╪════════════╝
                │                            │                        │
                ▼                            ▼                        ▼
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║                        WEBVIEW  (one React bundle)                           ║
    ║                                                                              ║
    ║  ┌────────────────────────────────────────────────────────────────────────┐  ║
    ║  │  PORTED OPENDUET INTERACTION LAYER  (spec 43)                          │  ║
    ║  │  transcript · composer · ActionBar · tool-activity pills · queue       │  ║
    ║  │  Streamdown ← message_delta        🆕 add now                          │  ║
    ║  └────────────────────────────────┬───────────────────────────────────────┘  ║
    ║                                   │ AgentEvent (JSON, one contract)          ║
    ║  ┌────────────────────────────────┴───────────────────────────────────────┐  ║
    ║  │  WORKSPACE SHELL  (persistent layout: session, runtime, chrome)        │  ║
    ║  │  Chat · Tasks · Make          Titlebar (desktop only) · Theme          │  ║
    ║  └────────────────────────────────┬───────────────────────────────────────┘  ║
    ║                                   │                                          ║
    ║  ┌────────────────────────────────┴───────────────────────────────────────┐  ║
    ║  │  genui RENDERER   OpenUI Lang → catalog check → React components       │  ║
    ║  │  ✗ unknown node = rejected        ✗ never eval() generated code        │  ║
    ║  └────────────────────────────────────────────────────────────────────────┘  ║
    ╚═══════════════════════════════════╪══════════════════════════════════════════╝
                                        │
            ┌───────────────────────────┴────────────────────────────┐
            │                                                        │
            ▼  WEB                                                   ▼  NATIVE
    ╔═══════════════════════════╗                   ╔═══════════════════════════════╗
    ║ crates/agent → WASM       ║                   ║  TAURI HOST (Rust)            ║
    ║                           ║                   ║                               ║
    ║ wasm-bindgen callback     ║                   ║  ┌─────────────────────────┐  ║
    ║   on_event(JSON)          ║                   ║  │ AgentHost               │  ║
    ║   on_tool → JS promise    ║                   ║  │  EventHub (ring + seq)  │  ║
    ║   on_approval → JS prom.  ║                   ║  │  └→ ChannelSink         │  ║
    ║                           ║                   ║  └───────────┬─────────────┘  ║
    ║ ⚠ no EventHub             ║                   ║              │                ║
    ║ ⚠ state dies with page    ║                   ║   tauri::ipc::Channel        ║
    ╚═══════════╪═══════════════╝                   ║   ⟨AgentEvent⟩  ──► WebView  ║
                │                                   ║                              ║
                │ fetch                             ║   invoke (request/response):  ║
                │                                   ║   agent_turn_start           ║
                │                                   ║   agent_approval_response    ║
                │                                   ║   agent_attach(since_seq)    ║
                │                                   ╚═══════════════╪══════════════╝
                │                                                   │
                ▼                                                   ▼
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║                         TRANSPORT  (host-injected)                           ║
    ║   web: fetch(credentials:include)      native: reqwest(+ keychain token)     ║
    ╚═══════════════════════════════════╪══════════════════════════════════════════╝
                                        │  POST /v1/chat/completions
                                        │  Accept: text/event-stream
                                        ▼
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║                    SSE  ──  OpenAI `data:` frames                            ║
    ║         parsed ONCE by crates/agent/src/sse.rs (shared framer)               ║
    ╚═══════════════════════════════════╪══════════════════════════════════════════╝
                                        ▼
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  services/model-router          (private Worker, only key holder)            ║
    ║   cf-aig-collect-log: false · BYOK alias · model allowlist · token cap       ║
    ╚═══════════════════════════════════╪══════════════════════════════════════════╝
                                        ▼
                              AI Gateway ──► provider (OpenRouter…)

    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  services/sms-api          school DB · sessions · tenant middleware          ║
    ║  services/cowork-api       AGENT_DB · sync · approvals · connectors          ║
    ║      ▲ gateway: policy → audit → act                                         ║
    ║      │                                                                       ║
    ║   ┌──┴──────────────────────────────────────────────────────────────────┐    ║
    ║   │ AG-UI BOUNDARY (optional, spec 17)                                  │    ║
    ║   │ external agent ──AG-UI──► agui.rs ──► AgentEvent ──► same UI        │    ║
    ║   │ requires admin approval · grants never derived from creator         │    ║
    ║   └─────────────────────────────────────────────────────────────────────┘    ║
    ╚══════════════════════════════════════════════════════════════════════════════╝

    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║  LOCAL STORE  (crates/store)   OPFS SQLite (web) · rusqlite (native)         ║
    ║  per-record XChaCha20 · outbox · journal · FTS (derived)                     ║
    ║  key = sibling OPFS file / OS keychain                                       ║
    ╚══════════════════════════════════════════════════════════════════════════════╝
    ── What this diagram does not show ───────────────────────────────────────────

    Two frontends            apps/web (browser + desktop window)
                             apps/desktop/mobile (Android, Vite + React)
                             sharing tokens / ui / host, never each other

    The package layer        @edapex/tokens   design values, CSS only
                             @edapex/ui       shadcn primitives
                             @edapex/host     transport · api · agent adapter
                             @edapex/chat     runtime state machine + Markdown

    The native run host      RunWorker (WorkManager) → RunService (foreground service,
                             type specialUse) → AgentHost, with `runs` / `run_events`
                             in crates/store as the journal a reboot resumes from

    Notifications            four channels: run · approval · done · routine

    Why the web branch says "state dies with page": a page reload loses the in-memory
    EventHub. The native branch survives it, and survives process death, which is why the
    durability work lives there and not in the browser.
