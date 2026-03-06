<template>
  <div class="leaderboard-page">
    <van-nav-bar title="排行榜" left-arrow fixed placeholder @click-left="$router.back()" />

    <template v-if="data">
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <div class="section">
          <div class="section-head">
            <van-tag type="primary" size="medium">个人战绩</van-tag>
            <span class="section-desc">按胜率、净胜分排序</span>
          </div>
          <van-cell-group inset class="card-group">
            <van-cell
              v-for="(p, i) in data.leaderboard"
              :key="p.id"
              :title="p.name"
              :label="`出场 ${p.playCount} 场 · 胜率 ${(p.winRate * 100).toFixed(0)}% · 净胜 ${p.pointDiff >= 0 ? '+' : ''}${p.pointDiff}`"
              class="leader-row"
            >
              <template #icon>
                <div class="rank-badge" :class="rankClass(i)">{{ i + 1 }}</div>
              </template>
            </van-cell>
            <van-empty v-if="!data.leaderboard?.length" description="暂无数据" />
          </van-cell-group>
        </div>

        <div class="section">
          <div class="section-head">
            <van-tag color="#07c160" size="medium">搭档胜率</van-tag>
          </div>
          <van-cell-group inset class="card-group">
            <van-cell
              v-for="(pw, i) in data.partnerWins"
              :key="i"
              :title="`${pw.name1} / ${pw.name2}`"
              :label="`${pw.wins}/${pw.total} 场 · 胜率 ${(pw.winRate * 100).toFixed(0)}%`"
              class="partner-row"
            />
            <van-empty v-if="!data.partnerWins?.length" description="暂无搭档数据" />
          </van-cell-group>
        </div>
      </van-pull-refresh>
    </template>

    <template v-else>
      <div class="skeleton-wrap">
        <van-skeleton title :row="6" class="skeleton-block" />
        <van-skeleton title :row="4" class="skeleton-block" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { showToast } from "vant";
import { getLeaderboard } from "../api";

const route = useRoute();
const data = ref(null);
const refreshing = ref(false);

function rankClass(i) {
  if (i === 0) return "rank-1";
  if (i === 1) return "rank-2";
  if (i === 2) return "rank-3";
  return "";
}

async function load() {
  try {
    data.value = await getLeaderboard(route.params.id);
  } catch (e) {
    showToast(e.message || "加载失败");
  }
}

async function onRefresh() {
  refreshing.value = true;
  await load();
  refreshing.value = false;
}

onMounted(load);
</script>

<style scoped>
.leaderboard-page { min-height: 100vh; background: var(--van-gray-1); padding-bottom: 40px; }
.section { padding: 12px 16px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.section-desc { font-size: 12px; color: var(--van-gray-6); }
.card-group { border-radius: 12px; overflow: hidden; }
.leader-row :deep(.van-cell__left-icon) { margin-right: 12px; }
.rank-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
.rank-1 { background: linear-gradient(135deg, #fff5f5, #ffe8e8); color: #ee0a24; }
.rank-2 { background: linear-gradient(135deg, #fff9e6, #fff0c2); color: #ff976a; }
.rank-3 { background: linear-gradient(135deg, #fffbe6, #fff3c4); color: #c8a600; }
.rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) { background: var(--van-gray-2); color: var(--van-gray-6); }
.partner-row :deep(.van-cell__title) { font-size: 14px; }
.skeleton-wrap { padding: 16px; }
.skeleton-block { margin-bottom: 16px; padding: 16px; background: #fff; border-radius: 12px; }
</style>
