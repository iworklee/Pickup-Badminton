<template>
  <div class="create-page">
    <van-nav-bar title="路人羽球" fixed placeholder />
    <van-form @submit="onSubmit">
      <van-cell-group inset class="card-group">
        <van-field v-model="form.title" label="标题" placeholder="输入活动名称" clearable />
        <van-field v-model="form.date" is-link readonly label="日期" placeholder="选择日期" @click="showDate = true" />
        <van-field name="courtCount" label="场地数量">
          <template #input>
            <van-stepper v-model="form.courtCount" :min="1" :max="10" integer />
          </template>
        </van-field>
        <van-field name="mode" label="模式">
          <template #input>
            <van-radio-group v-model="form.mode" direction="horizontal" class="mode-radio">
              <van-radio name="fixed">固定场次</van-radio>
              <van-radio name="dynamic">
                动态轮转
                <van-tag type="primary" plain size="small" class="mode-tag">推荐</van-tag>
              </van-radio>
            </van-radio-group>
          </template>
        </van-field>
      </van-cell-group>

      <van-divider>初始选手</van-divider>
      <van-cell-group inset class="card-group">
        <van-field
          v-model="pasteText"
          type="textarea"
          rows="4"
          placeholder="支持微信群接龙粘贴&#10;每行格式：姓名 男/女&#10;例：张三 男&#10;李四 女"
          class="paste-field"
        />
        <van-button block plain type="primary" size="small" class="parse-btn" @click="parsePaste">
          解析并填入下方名单
        </van-button>
      </van-cell-group>

      <van-cell-group inset class="card-group">
        <template #title>
          <span>选手名单</span>
          <van-tag v-if="validPlayerCount > 0" type="success" size="medium" class="count-tag">{{ validPlayerCount }} 人</van-tag>
        </template>
        <van-swipe-cell v-for="(p, i) in form.players" :key="i">
          <div class="player-row">
            <van-field v-model="p.name" placeholder="姓名" class="player-name" />
            <van-radio-group v-model="p.gender" direction="horizontal" class="gender-radio">
              <van-radio name="M">男</van-radio>
              <van-radio name="F">女</van-radio>
            </van-radio-group>
          </div>
          <template #right>
            <van-button square type="danger" text="删除" class="swipe-btn" @click="form.players.splice(i, 1)" />
          </template>
        </van-swipe-cell>
        <van-cell center clickable @click="form.players.push({ name: '', gender: 'M' })">
          <template #title>
            <span class="add-player-text"><van-icon name="plus" /> 添加选手</span>
          </template>
        </van-cell>
        <van-empty v-if="!form.players.length" description="请添加选手或从上方接龙解析" />
      </van-cell-group>

      <van-divider>让分规则（可选）</van-divider>
      <van-cell-group inset class="card-group">
        <van-field
          v-model="handicapPoints"
          type="digit"
          label="男双让混双"
          placeholder="不填则不让分"
          clearable
        />
      </van-cell-group>

      <div class="submit-wrap">
        <van-button round block type="primary" native-type="submit" :loading="loading" size="large">
          开始活动
        </van-button>
      </div>
    </van-form>

    <van-popup v-model:show="showDate" position="bottom" round>
      <van-date-picker
        v-model="datePicker"
        title="选择日期"
        :min-date="new Date(2020,0,1)"
        :max-date="new Date(2030,11,31)"
        @confirm="onDateConfirm"
        @cancel="showDate = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import dayjs from "dayjs";
import { createActivity, startActivity } from "../api";

const router = useRouter();
const loading = ref(false);
const showDate = ref(false);
const pasteText = ref("");
const handicapPoints = ref("");

const form = ref({
  title: "羽毛球活动",
  date: dayjs().format("YYYY-MM-DD"),
  courtCount: 1,
  mode: "dynamic",
  players: [{ name: "", gender: "M" }],
});

const datePicker = ref([]);

const validPlayerCount = computed(() =>
  (form.value.players || []).filter((p) => p.name && (p.gender === "M" || p.gender === "F")).length
);

function onDateConfirm({ selectedValues }) {
  if (selectedValues && selectedValues.length >= 3) form.value.date = selectedValues.join("-");
  showDate.value = false;
}

function parsePaste() {
  const text = pasteText.value || "";
  const lines = text.split(/\n/).map((s) => s.replace(/^\d+[\.\s]+/, "").trim()).filter(Boolean);
  const players = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const name = parts[0] || "";
    const g = (parts[1] || "").replace(/[男女]/g, (c) => (c === "男" ? "M" : "F"));
    if (name && (g === "M" || g === "F")) players.push({ name, gender: g });
  }
  if (players.length) {
    form.value.players = players;
    showToast(`已解析 ${players.length} 人`);
  } else {
    showToast("未能解析到有效选手");
  }
}

async function onSubmit() {
  const players = (form.value.players || []).filter((p) => p.name && (p.gender === "M" || p.gender === "F"));
  if (players.length < 4) {
    showToast("至少需要 4 名选手");
    return;
  }
  loading.value = true;
  try {
    const handicapRules = [];
    const pts = parseInt(handicapPoints.value, 10);
    if (!isNaN(pts) && pts > 0) handicapRules.push({ name: "男双让混双", points: pts });
    const data = await createActivity({
      title: form.value.title || "未命名活动",
      date: form.value.date,
      courtCount: Math.max(1, parseInt(form.value.courtCount, 10) || 1),
      mode: form.value.mode,
      handicapRules,
      players,
    });
    await startActivity(data.activity.id);
    showToast("活动已开始");
    router.push({ name: "Live", params: { id: data.activity.id } });
  } catch (e) {
    showToast(e.message || "创建失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const d = form.value.date ? dayjs(form.value.date) : dayjs();
  datePicker.value = [d.format("YYYY"), d.format("MM"), d.format("DD")];
});
</script>

<style scoped>
.create-page { padding-bottom: 80px; min-height: 100vh; background: var(--van-gray-1); }
.card-group { margin: 0 12px 12px; border-radius: 8px; overflow: hidden; }
.parse-btn { margin: 8px 16px; }
.paste-field :deep(.van-field__control) { font-size: 14px; }
.mode-radio { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mode-tag { margin-left: 4px; vertical-align: middle; }
.count-tag { margin-left: 8px; vertical-align: middle; }
.player-row { display: flex; align-items: center; flex-wrap: wrap; padding: 10px 16px; gap: 12px; background: #fff; border-bottom: 1px solid var(--van-cell-border-color); }
.player-row .player-name { flex: 1; min-width: 80px; padding: 0; }
.player-row .player-name :deep(.van-field__body) { padding: 0; }
.gender-radio { flex-shrink: 0; }
.swipe-btn { height: 100%; min-width: 65px; }
.add-player-text { color: var(--van-primary-color); font-size: 14px; }
.submit-wrap { padding: 24px 16px; padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
</style>
