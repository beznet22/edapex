<script lang="ts">
  import { getTheme } from "@sejohnson/svelte-themes";

  const theme = getTheme();
  // Premium HEX values: Dark: #0f141f, Light: #fcfcf9
  const themeColor = $derived(theme.resolvedTheme === "dark" ? "#0f141f" : "#fcfcf9");
</script>

<svelte:head>
  <meta name="theme-color" content={themeColor} />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>
