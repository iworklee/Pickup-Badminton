<template>
  <div class="live-page">
    <van-nav-bar
      :title="state?.activity?.title || '实时看板'"
      left-arrow
      fixed
      placeholder
      @click-left="goBack"
    >
      <template #right>
        <van-button size="small" type="primary" plain round @click="goLeaderboard">排行榜</van-button>
      </template>
    </van-nav-bar>

    <template v-if="state">
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <section class="section">
          <div class="section-head">
            <van-tag type="primary" size="medium">进行中</van-tag>
            <h3>当前比赛</h3>
          </div>
          <div v-for="m in state.courtMatches" :key="`court-${m.courtIndex}-${m.id}`" class="court-card">
            <div class="court-header">
              <van-tag plain type="primary">场地 {{ m.courtIndex + 1 }}</van-tag>
              <van-button size="mini" type="primary" @click="openScore(m)">录入比分</van-button>
            </div>
            <div class="vs">
              <span class="team">{{ teamNames(m.teamAPlayerIds) }}</span>
              <span class="vs-text">VS</span>
              <span class="team">{{ teamNames(m.teamBPlayerIds) }}</span>
            </div>
            <div v-if="m.handicapTip" class="handicap">
              <van-tag type="danger" plain size="small">{{ m.handicapTip }}</van-tag>
            </div>
            <div class="actions">
              <van-button size="small" plain block @click="onEndCourt(m)">结束本局</van-button>
            </div>
          </div>
          <van-empty v-if="!state.courtMatches?.length" description="暂无进行中比赛" />
        </section>

        <section v-if="state.recentResults?.length" class="section">
          <div class="section-head">
            <van-tag type="success" size="medium">最近录入</van-tag>
            <h3>比分</h3>
          </div>
          <div v-for="(r, idx) in state.recentResults" :key="idx" class="result-row">
            <span class="result-court">场地 {{ r.courtIndex + 1 }}</span>
            <span class="result-teams">{{ teamNames(r.teamAPlayerIds) }} VS {{ teamNames(r.teamBPlayerIds) }}</span>
            <span class="result-score">
              <span :class="r.scoreA > r.scoreB ? 'score-win' : 'score-lose'">{{ r.scoreA }}</span>
              <span class="score-sep">/</span>
              <span :class="r.scoreB > r.scoreA ? 'score-win' : 'score-lose'">{{ r.scoreB }}</span>
            </span>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <van-tag color="#ff976a" size="medium">候场</van-tag>
            <h3>下一场</h3>
          </div>
          <div v-if="state.nextUp" class="next-up" :key="nextUpKey">
            <div class="vs">
              <span class="team">{{ teamNames(state.nextUp.teamAPlayerIds) }}</span>
              <span class="vs-text">VS</span>
              <span class="team">{{ teamNames(state.nextUp.teamBPlayerIds) }}</span>
            </div>
            <div v-if="state.nextUp.handicapTip" class="handicap">
              <van-tag type="danger" plain size="small">{{ state.nextUp.handicapTip }}</van-tag>
            </div>
          </div>
          <van-empty v-else description="人数不足或暂无下一场" />
        </section>
      </van-pull-refresh>

      <van-action-sheet v-model:show="showAddPlayer" title="添加选手（中途加入）" round>
        <van-form @submit="onAddPlayer">
          <van-cell-group inset>
            <van-field v-model="newPlayer.name" label="姓名" placeholder="请输入姓名" clearable :rules="[{ required: true, message: '请输入姓名' }]" />
            <van-field name="gender" label="性别">
              <template #input>
                <van-radio-group v-model="newPlayer.gender" direction="horizontal">
                  <van-radio name="M">男</van-radio>
                  <van-radio name="F">女</van-radio>
                </van-radio-group>
              </template>
            </van-field>
          </van-cell-group>
          <div class="sheet-btn-wrap">
            <van-button round block type="primary" native-type="submit">确认加入</van-button>
          </div>
        </van-form>
      </van-action-sheet>

      <van-dialog
        v-model:show="showScoreDialog"
        :title="scoreDialogTitle"
        show-cancel-button
        confirm-button-text="提交"
        @confirm="onSubmitScore"
      >
        <div class="score-dialog-body">
          <van-cell-group inset>
            <van-field name="scoreA" label="A 队得分">
              <template #input>
                <van-stepper v-model="scoreForm.scoreA" :min="0" :max="99" integer />
              </template>
            </van-field>
            <van-field name="scoreB" label="B 队得分">
              <template #input>
                <van-stepper v-model="scoreForm.scoreB" :min="0" :max="99" integer />
              </template>
            </van-field>
          </van-cell-group>
        </div>
      </van-dialog>

      <van-action-sheet v-model:show="showLeaveList" title="选手早退" round description="点击选手设为离场，不再安排上场">
        <div class="leave-list">
          <van-cell
            v-for="p in activePlayers"
            :key="p.id"
            :title="p.name"
            :label="p.gender === 'M' ? '男' : '女'"
            clickable
            @click="doSetLeave(p)"
          >
            <template #right-icon>
              <van-icon name="arrow" />
            </template>
          </van-cell>
          <van-empty v-if="!activePlayers.length" description="暂无在场选手" />
        </div>
      </van-action-sheet>
    </template>

    <template v-else>
      <div class="skeleton-wrap">
        <van-skeleton title :row="4" class="skeleton-block" />
        <van-skeleton title :row="3" class="skeleton-block" />
      </div>
    </template>

    <div class="fab-wrap">
      <van-button round type="primary" class="fab-main" @click="showAddPlayer = true">
        <van-icon name="plus" /> 添加选手
      </van-button>
      <van-button round plain class="fab-sub" @click="showLeaveList = true">
        选手早退
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast } from "vant";
import { getLive, addPlayer, setPlayerLeft, submitScore, endCourt, wsLive } from "../api";

const route = useRoute();
const router = useRouter();
const activityId = route.params.id;
const state = ref(null);
const refreshing = ref(false);
const showAddPlayer = ref(false);
const showScoreDialog = ref(false);
const showLeaveList = ref(false);
const newPlayer = ref({ name: "", gender: "M" });
const scoreForm = ref({ scoreA: 0, scoreB: 0 });
const currentCourt = ref(null);
let ws = null;

const scoreDialogTitle = computed(() => {
  if (!currentCourt.value) return "录入比分";
  return `场地 ${(currentCourt.value.courtIndex || 0) + 1} - 录入比分`;
});

const activePlayers = computed(() => (state.value?.players || []).filter((p) => p.status === "active"));
const playersById = computed(() => {
  const map = {};
  (state.value?.players || []).forEach((p) => (map[p.id] = p));
  return map;
});
const nextUpKey = computed(() => {
  const n = state.value?.nextUp;
  if (!n) return "none";
  return [n.teamAPlayerIds, n.teamBPlayerIds].flat().join("-");
});

function teamNames(ids) {
  if (!ids?.length || !playersById.value) return "-";
  return ids.map((id) => playersById.value[id]?.name || "?").join(" / ");
}

function goBack() {
  router.replace("/create");
}

function goLeaderboard() {
  router.push({ name: "Leaderboard", params: { id: activityId } });
}

function openScore(m) {
  currentCourt.value = m;
  scoreForm.value = { scoreA: 0, scoreB: 0 };
  showScoreDialog.value = true;
}

async function onSubmitScore() {
  if (!currentCourt.value) return;
  const sA = Number(scoreForm.value.scoreA) || 0;
  const sB = Number(scoreForm.value.scoreB) || 0;
  try {
    state.value = await submitScore(activityId, currentCourt.value.courtIndex, sA, sB);
    showScoreDialog.value = false;
    showToast("已录入");
  } catch (e) {
    showToast(e.message || "提交失败");
  }
}

async function onEndCourt(m) {
  try {
    state.value = await endCourt(activityId, m.courtIndex);
    showToast("已结束本局");
  } catch (e) {
    showToast(e.message || "操作失败");
  }
}

async function onAddPlayer() {
  if (!newPlayer.value.name?.trim()) return;
  try {
    await addPlayer(activityId, newPlayer.value.name.trim(), newPlayer.value.gender);
    state.value = await getLive(activityId);
    showAddPlayer.value = false;
    newPlayer.value = { name: "", gender: "M" };
    showToast("已加入候补，下一场优先安排");
  } catch (e) {
    showToast(e.message || "添加失败");
  }
}

async function doSetLeave(p) {
  try {
    await setPlayerLeft(activityId, p.id);
    state.value = await getLive(activityId);
    showLeaveList.value = false;
    showToast(`${p.name} 已设为离场`);
  } catch (e) {
    showToast(e.message || "操作失败");
  }
}

async function fetchLive() {
  try {
    state.value = await getLive(activityId);
  } catch (e) {
    showToast(e.message || "加载失败");
  }
}

async function onRefresh() {
  refreshing.value = true;
  await fetchLive();
  refreshing.value = false;
}

onMounted(() => {
  fetchLive();
  ws = wsLive(activityId, (data) => { state.value = data; });
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<style scoped>
.live-page { min-height: 100vh; background: var(--van-gray-1); padding-bottom: 120px; }
.section { padding: 12px 16px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.section-head h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--van-text-color); }
.court-card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.court-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.vs { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.team { flex: 1; min-width: 80px; }
.vs-text { color: var(--van-gray-6); font-size: 12px; font-weight: 500; }
.handicap { margin-top: 8px; }
.actions { margin-top: 12px; }
.next-up { background: linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%); border-radius: 12px; padding: 16px; border: 1px solid #ffd591; }
.skeleton-wrap { padding: 16px; }
.skeleton-block { margin-bottom: 16px; padding: 16px; background: #fff; border-radius: 12px; }
.fab-wrap { position: fixed; right: 16px; bottom: calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; align-items: flex-end; z-index: 100; }
.fab-main { box-shadow: 0 4px 12px rgba(25, 137, 250, 0.4); padding: 0 20px; }
.fab-sub { margin-right: 0; }
.sheet-btn-wrap { padding: 16px; }
.score-dialog-body { padding: 8px 0; }
.leave-list { max-height: 60vh; overflow: auto; }
.result-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fff; border-radius: 8px; margin-bottom: 8px; font-size: 13px; flex-wrap: wrap; }
.result-court { color: var(--van-gray-6); min-width: 52px; }
.result-teams { flex: 1; min-width: 0; color: var(--van-text-color); }
.result-score { font-weight: 600; white-space: nowrap; }
.score-win { color: #ee0a24; }
.score-lose { color: #07c160; }
.score-sep { color: var(--van-gray-5); margin: 0 2px; }
</style>
