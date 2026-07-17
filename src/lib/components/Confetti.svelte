<script lang="ts">
  /**
   * Confetti — pure-canvas particle burst for batch-success celebration.
   * No external dependency. Mounts a single fixed-position canvas; the
   * `trigger` prop is a counter — increment to fire. Particles use the
   * app's OKLCH tokens so the burst matches the design system in both
   * light and dark modes.
   */
  import { onMount } from "svelte";

  let { trigger = 0 }: { trigger: number } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  let raf = 0;

  type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    rotV: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
  };

  let particles: Particle[] = [];

  function cssVar(name: string): string {
    if (typeof document === "undefined") return "#000";
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || "#000";
  }

  function readColors(): string[] {
    return [
      cssVar("--primary"),
      cssVar("--chart-1"),
      cssVar("--chart-2"),
      cssVar("--chart-3"),
      cssVar("--chart-4"),
      cssVar("--chart-5"),
    ];
  }

  function fire(c: HTMLCanvasElement) {
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width = window.innerWidth;
    const H = c.height = window.innerHeight;
    const colors = readColors();
    const count = 36;
    const originX = W / 2;
    const originY = H * 0.32;
    for (let i = 0; i < count; i++) {
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 380 + Math.random() * 460;
      particles.push({
        x: originX + (Math.random() - 0.5) * 80,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 12,
        size: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)] || "#000",
        life: 0,
        maxLife: 1500 + Math.random() * 1000,
      });
    }
    if (!raf) loop(ctx, c);
  }

  function loop(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      ctx.clearRect(0, 0, c.width, c.height);
      const gravity = 700;
      const drag = 0.0008;
      particles = particles.filter((p) => {
        p.life += dt;
        if (p.life >= p.maxLife) return false;
        p.vy += gravity * (dt / 1000);
        p.vx -= p.vx * drag * dt;
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
        p.rot += p.rotV * (dt / 1000);
        const t = p.life / p.maxLife;
        const alpha = 1 - t * t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
        return true;
      });
      if (particles.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, c.width, c.height);
      }
    };
    raf = requestAnimationFrame(tick);
  }

  $effect(() => {
    if (trigger > 0 && canvas) fire(canvas);
  });

  onMount(() => () => {
    if (raf) cancelAnimationFrame(raf);
  });
</script>

<canvas
  bind:this={canvas}
  class="fixed inset-0 z-40 pointer-events-none"
  aria-hidden="true"
></canvas>
