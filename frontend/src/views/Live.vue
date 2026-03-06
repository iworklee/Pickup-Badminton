<template>
  <div class="live-page">
    <van-nav-bar :title="state?.activity?.title || '实时看板'" left-arrow @click-left="goBack">
      <template #right>
        <van-button size="small" type="primary" plain @click="goLeaderboard">排行榜</van-button>
      </template>
    </van-nav-bar>

    <template v-if="state">
      <section class="section">
        <h3>进行中的比赛</h3>
        <div v-for="m in state.courtMatches" :key="m.id" class="court-card">
          <div class="court-title">场地 {{ m.courtIndex + 1 }}</div>
          <div class="vs">
            <span class="team">{{ teamNames(m.teamAPlayerIds) }}</span>
            <span class="vs-text">VS</span>
            <span class="team">{{ teamNames(m.teamBPlayerIds) }}</span>
          </div>
          <div v-if="m.handicapTip" class="handicap">{{ m.handicapTip }}</div>
          <div class="actions">
            <van-button size="small" type="primary" @click="openScore(m)">录入比分</van-button>
            <van-button size="small" plain @click="onEndCourt(m)">结束本局</van-button>
          </div>
        </div>
        <van-empty v-if="!state.courtMatches?.length" description="暂无进行中比赛" />
      </section>

      <section class="section">
        <h3>候场队列（下一场）</h3>
        <div v-if="state.nextUp" class="next-up">
          <div class="vs">
            <span class="team">{{ teamNames(state.nextUp.teamAPlayerIds) }}</span>
            <span class="vs-text">VS</span>
            <span class="team">{{ teamNames(state.nextUp.teamBPlayerIds) }}</span>
          </div>
          <div v-if="state.nextUp.handicapTip" class="handicap">{{ state.nextUp.handicapTip }}</div>
        </div>
        <van-empty v-else description="人数不足或暂无下一场" />
      </section>

      <van-action-sheet v-model:show="showAddPlayer" title="添加选手（中途加入）">
        <van-form @submit="onAddPlayer">
          <van-cell-group inset>
            <van-field v-model="newPlayer.name" label="姓名" placeholder="姓名" :rules="[{ required: true }]" />
            <van-field name="gender" label="性别">
              <template #input>
                <van-radio-group v-model="newPlayer.gender" direction="horizontal">
                  <van-radio name="M">男</van-radio>
                  <van-radio name="F">女</van-radio>
                </van-radio-group>
              </template>
            </van-field>
          </van-cell-group>
          <div style="padding: 16px;"><van-button round block type="primary" native-type="submit">确认加入</van-button></div>
        </van-form>
      </van-action-sheet>

      <van-dialog v-model:show="showScoreDialog" title="录入比分" show-cancel-button @confirm="onSubmitScore">
        <van-cell-group inset>
          <van-field v-model="scoreForm.scoreA" type="digit" label="A 队得分" placeholder="0" />
          <van-field v-model="scoreForm.scoreB" type="digit" label="B 队得分" placeholder="0" />
        </van-cell-group>
      </van-dialog>

      <van-action-sheet v-model:show="showLeaveList" title="选手早退（点击设为离场）">
        <div class="leave-list">
          <van-cell v-for="p in activePlayers" :key="p.id" :title="`${p.name}（${p.gender === 'M' ? '男' : '女'}）`" clickable @click="doSetLeave(p)" />
          <van-empty v-if="!activePlayers.length" description="暂无在场选手" />
        </div>
      </van-action-sheet>
    </template>

    <van-loading v-else class="loading" type="spinner" />

    <div class="fab-wrap">
      <van-button round type="primary" class="fab" @click="showAddPlayer = true">+ 添加选手</van-button>
      <van-button round plain class="fab fab2" @click="showLeaveList = true">选手早退</van-button>
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
const showAddPlayer = ref(false);
const showScoreDialog = ref(false);
const showLeaveList = ref(false);
const newPlayer = ref({ name: "", gender: "M" });
const scoreForm = ref({ scoreA: "", scoreB: "" });
const currentCourt = ref(null);
let ws = null;

const activePlayers = computed(() => (state.value?.players || []).filter((p) => p.status === "active"));
const playersById = computed(() => {
  const map = {};
  (state.value?.players || []).forEach((p) => (map[p.id] = p));
  return map;
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
  scoreForm.value = { scoreA: "", scoreB: "" };
  showScoreDialog.value = true;
}

async function onSubmitScore() {
  if (!currentCourt.value) return;
  const sA = parseInt(scoreForm.value.scoreA, 10);
  const sB = parseInt(scoreForm.value.scoreB, 10);
  if (isNaN(sA) || isNaN(sB)) {
    showToast("请输入有效比分");
    return;
  }
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

onMounted(() => {
  fetchLive();
  ws = wsLive(activityId, (data) => { state.value = data; });
});

onUnmounted(() => {
  if (ws) ws.close();
});
</script>

<style scoped>
.live-page { padding-bottom: 100px; }
.section { padding: 12px 16px; }
.section h3 { margin: 0 0 12px; font-size: 15px; color: #333; }
.court-card { background: #f7f8fa; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.court-title { font-weight: 600; margin-bottom: 8px; }
.vs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.team { flex: 1; min-width: 80px; font-size: 14px; }
.vs-text { color: #969799; font-size: 12px; }
.handicap { margin-top: 6px; font-size: 12px; color: #ee0a24; }
.actions { margin-top: 10px; display: flex; gap: 8px; }
.next-up { background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px; padding: 12px; }
.loading { margin: 40px auto; display: block; }
.fab-wrap { position: fixed; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.fab { box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
.fab2 { margin-right: 0; }
.leave-list { max-height: 60vh; overflow: auto; }
.leave-item { padding: 14px 16px; border-bottom: 1px solid #eee; }
</style>
