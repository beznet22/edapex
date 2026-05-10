<script lang="ts">
  // Mock file tree data from screenshot
  let entries = [
    { name: '.git', type: 'dir', expanded: false },
    { name: 'agent-messages', type: 'dir', expanded: true, children: [
      { name: 'archive', type: 'dir' },
      { name: 'README.md', type: 'file', size: '0.9k' }
    ]},
    { name: 'archive', type: 'dir' },
    { name: 'conversation-exports', type: 'dir', expanded: true, children: [
        { name: 'hermes_conversation_20260...', type: 'file', size: '186.8k' },
        { name: 'hermes_conversation_20260...', type: 'file', size: '203.3k' }
    ]},
    { name: 'screenshots', type: 'dir', expanded: true, children: [
        { name: 'full UI 3.png', type: 'file', size: '539.4k' },
        { name: 'glitch A.png', type: 'file', size: '123.2k' }
    ]}
  ];
</script>

<aside class="workspace-pane">
  <div class="workspace-header">
    <div class="flex items-center gap-2">
      <span>WORKSPACE</span>
      <span class="badge">MAIN</span>
    </div>
    
    <div class="flex items-center gap-1">
      <button class="icon-btn">‹</button>
      <button class="icon-btn">+</button>
      <button class="icon-btn">📁</button>
      <button class="icon-btn">↻</button>
      <button class="icon-btn">×</button>
    </div>
  </div>
  
  <div class="file-tree">
    {#each entries as entry}
      <div class="tree-item" class:expanded={entry.expanded}>
        <div class="item-label">
          <span class="arrow">{entry.type === 'dir' ? (entry.expanded ? '▾' : '▸') : ''}</span>
          <span class="icon">{entry.type === 'dir' ? '📁' : '📄'}</span>
          <span class="name">{entry.name}</span>
          {#if entry.size}<span class="size">{entry.size}</span>{/if}
        </div>
        
        {#if entry.expanded && entry.children}
          <div class="sub-tree">
            {#each entry.children as child}
              <div class="tree-item">
                <div class="item-label">
                  <span class="arrow"></span>
                  <span class="icon">{child.type === 'dir' ? '📁' : '📄'}</span>
                  <span class="name">{child.name}</span>
                  {#if child.size}<span class="size">{child.size}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</aside>

<style>
  .badge {
    background: #e2e8f0;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
  }
  
  .icon-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    color: var(--text-mute);
  }
  
  .icon-btn:hover {
    background: #e2e8f0;
  }
  
  .file-tree {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
  }
  
  .item-label {
    display: flex;
    align-items: center;
    padding: 4px 16px;
    gap: 8px;
    cursor: pointer;
  }
  
  .item-label:hover {
    background: #e2e8f0;
  }
  
  .arrow { width: 12px; font-size: 10px; }
  .icon { opacity: 0.7; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .size { font-size: 11px; opacity: 0.5; }
  
  .sub-tree {
    padding-left: 20px;
  }
</style>
