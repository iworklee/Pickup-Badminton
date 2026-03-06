<template>
  <div class="leaderboard-page">
    <van-nav-bar title="排行榜" left-arrow @click-left="$router.back()" />
    <template v-if="data">
      <van-cell-group inset title="个人战绩（按胜率、场均净胜分）">
        <div v-for="(p, i) in data.leaderboard" :key="p.id" class="row">
          <span class="rank">{{ i + 1 }}</span>
          <span class="name">{{ p.name }}</span>
          <span class="stat">出场 {{ p.playCount }} 场</span>
          <span class="stat">胜率 {{ (p.winRate * 100).toFixed(0) }}%</span>
          <span class="stat">净胜 {{ p.pointDiff >= 0 ? '+' : '' }}{{ p.pointDiff }}</span>
        </div>
        <van-empty v-if="!data.leaderboard?.length" description="暂无数据" />
      </van-cell-group>
      <van-cell-group inset title="搭档胜率">
        <div v-for="(pw, i) in data.partnerWins" :key="i" class="row">
          <span class="name">{{ pw.name1 }} / {{ pw.name2 }}</span>
          <span class="stat">{{ pw.wins }}/{{ pw.total }} 胜率 {{ (pw.winRate * 100).toFixed(0) }}%</span>
        </div>
        <van-empty v-if="!data.partnerWins?.length" description="暂无搭档数据" />
      </van-cell-group>
    </template>
    <van-loading v-else class="loading" type="spinner" />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { showToast } from "vant";
import { getLeaderboard } from "../api";

const route = useRoute();
const data = ref(null);

onMounted(async () => {
  try {
    data.value = await getLeaderboard(route.params.id);
  } catch (e) {
    showToast(e.message || "加载失败");
  }
});
</script>

<style scoped>
.leaderboard-page { padding-bottom: 40px; }
.row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; gap: 12px; flex-wrap: wrap; }
.rank { width: 24px; font-weight: 600; color: #969799; }
.name { flex: 1; min-width: 60px; }
.stat { font-size: 13px; color: #646566; }
.loading { margin: 40px auto; display: block; }
</style>
