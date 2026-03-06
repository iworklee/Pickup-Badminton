<template>
  <div class="app-root">
    <router-view />
  </div>
</template>

<script setup>
</script>

<style>
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; padding: 0; min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; background: var(--van-gray-1, #f7f8fa); -webkit-font-smoothing: antialiased; }
#app, .app-root { min-height: 100%; }
/* 安全区：底部固定操作栏留白 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .app-root { padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
}
</style>
