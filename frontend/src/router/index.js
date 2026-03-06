import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/create" },
  { path: "/create", name: "Create", component: () => import("../views/Create.vue"), meta: { title: "创建比赛" } },
  { path: "/live/:id", name: "Live", component: () => import("../views/Live.vue"), meta: { title: "实时看板" } },
  { path: "/leaderboard/:id", name: "Leaderboard", component: () => import("../views/Leaderboard.vue"), meta: { title: "排行榜" } },
];

const router = createRouter({ history: createWebHashHistory(), routes });
router.afterEach((to) => { document.title = to.meta.title || "路人羽球"; });
export default router;
