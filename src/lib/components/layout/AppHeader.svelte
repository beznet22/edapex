<script lang="ts">
  let title = $state('Friday, April 10, 2026');
  let subText = $state('3 messages');
</script>

<header class="app-header">
  <div class="header-main">
    <h1 class="header-title">{title}</h1>
    <span class="header-sub">{subText}</span>
  </div>
  
  <div class="header-actions">
    <!-- Action buttons (e.g. search, settings, etc.) -->
  </div>
</header>

<style>
  .header-main {
    display: flex;
    flex-direction: column;
  }
  
  .header-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }
  
  .header-sub {
    font-size: 11px;
    color: var(--text-mute);
  }
  
  .header-actions {
    margin-left: auto;
  }
</style>
