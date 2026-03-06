<template>
  <div class="create-page">
    <van-nav-bar title="路人羽球" />
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="form.title" label="标题" placeholder="活动名称" />
        <van-field v-model="form.date" is-link readonly label="日期" placeholder="选择日期" @click="showDate = true" />
        <van-field v-model="form.courtCount" type="digit" label="场地数量" placeholder="1" />
        <van-field name="mode" label="模式">
          <template #input>
            <van-radio-group v-model="form.mode" direction="horizontal">
              <van-radio name="fixed">固定场次</van-radio>
              <van-radio name="dynamic">动态轮转（推荐）</van-radio>
            </van-radio-group>
          </template>
        </van-field>
      </van-cell-group>

      <van-cell-group inset title="初始选手（可接龙粘贴）">
        <van-field v-model="pasteText" type="textarea" rows="4" placeholder="接龙粘贴：每行 姓名 男/女，如&#10;张三 男&#10;李四 女" />
        <van-button block plain type="primary" size="small" style="margin: 8px 16px;" @click="parsePaste">解析并填入下方</van-button>
      </van-cell-group>

      <van-cell-group inset>
        <div v-for="(p, i) in form.players" :key="i" class="player-row">
          <van-field v-model="p.name" placeholder="姓名" />
          <van-radio-group v-model="p.gender" direction="horizontal">
            <van-radio name="M">男</van-radio>
            <van-radio name="F">女</van-radio>
          </van-radio-group>
          <van-button size="small" type="danger" plain @click="form.players.splice(i, 1)">删</van-button>
        </div>
        <van-button block plain type="primary" size="small" style="margin: 8px 16px;" @click="form.players.push({ name: '', gender: 'M' })">+ 添加选手</van-button>
      </van-cell-group>

      <van-cell-group inset title="让分规则（可选）">
        <van-field v-model="handicapPoints" type="digit" label="男双让混双" placeholder="让分分数，不填则不让" />
      </van-cell-group>

      <div style="padding: 24px 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">开始活动</van-button>
      </div>
    </van-form>

    <van-popup v-model:show="showDate" position="bottom">
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
import { ref, onMounted } from "vue";
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
.create-page { padding-bottom: 40px; }
.player-row { display: flex; align-items: center; flex-wrap: wrap; padding: 8px 16px; gap: 8px; border-bottom: 1px solid #eee; }
.player-row .van-field { flex: 1; min-width: 80px; }
</style>
