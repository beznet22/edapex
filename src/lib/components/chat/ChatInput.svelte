<script lang="ts">
  let message = $state('');
  let profile = $state('default');
  let selectedModel = $state('Claude Sonnet 4.6');
</script>

<div class="chat-composer-wrap">
  <div class="composer-pill">
    <textarea 
      class="composer-input" 
      placeholder="Message Hermes Agent..."
      bind:value={message}
    ></textarea>
    
    <div class="composer-toolbar">
      <button class="tool-icon" title="Upload">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </button>
      
      <button class="tool-icon" title="Voice">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </button>
      
      <div class="divider"></div>
      
      <button class="composer-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
        {profile}
        <span class="chevron">▾</span>
      </button>
      
      <button class="composer-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/></svg>
        Home
        <span class="chevron">▾</span>
      </button>
      
      <button class="composer-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        {selectedModel}
        <span class="chevron">▾</span>
      </button>
      
      <div style="flex: 1"></div>
      
      <button class="send-btn" disabled={!message}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
      </button>
    </div>
  </div>
</div>

<style>
  .divider {
    width: 1px;
    height: 20px;
    background: var(--border-color);
  }
  
  .tool-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-mute);
    cursor: pointer;
  }
  
  .chevron {
    font-size: 10px;
    opacity: 0.5;
  }
  
  .send-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--accent-blue);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  
  .send-btn:disabled {
    background-color: #e2e8f0;
    color: #94a3b8;
    cursor: default;
  }
</style>
