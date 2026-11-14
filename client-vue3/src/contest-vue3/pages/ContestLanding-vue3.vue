<script setup lang="ts">
import type { ContestServicesVue3 } from "../contracts-vue3";
import ContestNewsVue3 from "../components/ContestNews-vue3.vue";
import ContestProgressVue3 from "../components/ContestProgress-vue3.vue";
import { useContestAnchorVue3 } from '../../composables/use-contest-anchor-vue3';
const props = defineProps<{ services: ContestServicesVue3; alternate: boolean }>();
const t = props.services.t;
const alignHash = useContestAnchorVue3(() => props.services.scrollHash());
</script>
<template>
<template v-if="!alternate"><div class="f-contest container f-contest--alternate">
<div class="f-contest-alt-intro">
<header class="f-contest-alt-copy">
<p class="f-contest-alt-eyebrow">
<b>2026.11</b> · FIRST EDITION · QSL CARD DESIGN CONTEST</p>
<h1>
<span>{{ t("第一届") }} <span class="f-contest-brand">QSLink</span> {{ t("杯") }}</span>
<span>{{ t("QSL 卡片设计大赛") }}</span>
</h1>
<p class="f-contest-alt-subtitle">{{ t("上传你的 QSL 卡片，参与评选，赢取十强好礼。") }}</p>
<div class="f-contest-alt-actions">
<a class="btn btn-primary" href="/events/qsl-design-2026-11/registration" data-link="">{{ t("比赛报名") }}<svg class="icon " width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M5 12h14">
</path>
<path d="M13 6l6 6-6 6">
</path>
</svg>
</a>
<a class="btn btn-soft" href="/events/qsl-design-2026-11#rules" data-link="">
<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
<path d="M12 5v15M12 5C9 3 5 3 3 4v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 1Z">
</path>
</svg>{{ t("参赛须知") }}</a>
</div>
<p class="f-contest-alt-status">{{ t("报名通道开放中 · 2026.12.20 截止") }}</p>
<dl class="f-contest-alt-stats">
<div>
<dt>10<small>{{ t("名") }}</small>
</dt>
<dd>{{ t("实物奖品") }}</dd>
</div>
<div>
<dt>30<small> + </small>50<small> + </small>20</dt>
<dd>{{ t("机器 + 人工 + 投票") }}</dd>
</div>
<div>
<dt>
<time datetime="2026-12-20">12.20</time>
</dt>
<dd>{{ t("2026 报名截止日期") }}</dd>
</div>
<div>
<dt>
<time datetime="2026-12-25">12.25</time>
</dt>
<dd>{{ t("2026 颁奖日期") }}</dd>
</div>
</dl>
</header>
<figure class="f-contest-alt-figure">
<div class="f-contest-alt-figure-head">
<span class="f-contest-trophy-label">
<svg class="icon " width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M8 3h8v5a4 4 0 0 1-8 0z">
</path>
<path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4">
</path>
</svg>{{ t("冠军奖杯") }}</span>
<time datetime="2026-12-25">2026.12.25</time>
</div>
<div class="f-contest-alt-stage">
<img width="1121" height="1403" decoding="async" :src='"/assets/contest-trophy.webp"' :alt='t("冠军奖杯")'>
</div>
<figcaption>{{ t("奖杯示意图，真实奖杯的图片背景将由参赛卡片制成。") }}</figcaption>
</figure>
</div>
<section class="f-contest-section" aria-labelledby="contest-news-title">
<div class="f-contest-section-head">
<span class="eyebrow">01</span>
<h2 id="contest-news-title">{{ t("赛事动态") }}</h2>
</div>
<div data-news="" aria-live="polite">
<ContestNewsVue3 :services="services" @ready="alignHash" />
</div>
</section>
<section class="f-contest-prize f-contest-prizes" aria-labelledby="contest-prizes-title"> <div class="f-contest-prize-head"> <div class="f-contest-prize-head-main"> <p class="f-contest-prize-kicker">{{ t("PRIZES · 奖品设置") }}</p> <h3 id="contest-prizes-title">{{ t("十强好礼，等你来赢") }}</h3> </div> <p class="f-contest-prize-lead">{{ t("十件实物奖品，按最终名次依次发放；冠军大奖将随审核通过的报名人数解锁升级。") }}</p> </div> <article class="f-contest-prize-champion" aria-labelledby="f-contest-prize-champion-title"> <div class="f-contest-prize-champion-top"> <div class="f-contest-prize-champion-copy"> <p class="f-contest-prize-rank">
<span class="f-contest-prize-rank-no">01</span>{{ t("第一名 · 冠军大奖") }}</p> <h4 class="f-contest-prize-champion-title" id="f-contest-prize-champion-title">{{ t("森海克斯 8650") }}</h4> <p class="f-contest-prize-champion-sub">{{ t("双段手持对讲机，冠军奖品起步即解锁。") }}</p> <ul class="f-contest-prize-champion-tags"> <li>{{ t("双段手持对讲机") }}</li> <li>{{ t("起步即解锁") }}</li> <li>{{ t("100 人升级二选一") }}</li> <li>{{ t("实体奖杯 + 奖状") }}</li> </ul> </div> <figure class="f-contest-prize-champion-media"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/senhai-8650.webp"' :alt='t("森海克斯 8650 双段手持对讲机")'> <figcaption>{{ t("冠军奖品 · 森海克斯 8650") }}</figcaption> </figure> </div> <div class="f-contest-prize-progress">
<div class="f-contest-prizes-stat" data-prize-progress="" aria-live="polite">
<ContestProgressVue3 :services="services" @ready="alignHash" />
</div>
<p class="f-contest-prize-progress-note">{{ t("每个审核通过的报名账号 +1 进度；达到 100 人后升级为二选一，不叠加领取森海克斯 8650。进度随当前审核通过人数实时变化。") }}</p>
</div> <div class="f-contest-prize-upgrade"> <div class="f-contest-prize-upgrade-copy"> <span class="f-contest-prize-flag">{{ t("100 进度 · 大奖升级") }}</span> <h5 class="f-contest-prize-upgrade-title">{{ t("拓竹 A1 mini") }}<em>{{ t("或") }}</em>{{ t("威诺 VR-N76") }}</h5> <p class="f-contest-prize-upgrade-desc">{{ t("达到 100 名审核通过的报名者后，冠军奖品在以下两件中二选一领取，不与森海克斯 8650 叠加。") }}</p> </div> <div class="f-contest-prize-upgrade-items"> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/a1-mini.webp"' :alt='t("拓竹 A1 mini 桌面 3D 打印机")'> <figcaption>
<strong>{{ t("拓竹 A1 mini") }}</strong>
<span>{{ t("桌面 3D 打印机") }}</span>
</figcaption> </figure> <span class="f-contest-prize-or" aria-hidden="true">{{ t("或") }}</span> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/vr-n76.webp"' :alt='t("威诺 VR-N76 手持对讲机")'> <figcaption>
<strong>{{ t("威诺 VR-N76") }}</strong>
<span>{{ t("手持对讲机") }}</span>
</figcaption> </figure> </div> </div> </article> <div class="f-contest-prize-runners-head"> <div class="f-contest-prize-runners-heading"> <h4>{{ t("第二至第五名") }}<span class="f-contest-prize-runners-chip">{{ t("四件奖品 · 每人选一件") }}</span>
</h4> <p class="f-contest-prize-runners-note">{{ t("四项奖品按获奖名次依次挑选，名次靠前者优先挑选。") }}</p> </div> </div> <div class="f-contest-prize-order" role="list" :aria-label='t("奖品挑选顺序：按获奖名次依次挑选，名次靠前者优先")'> <span class="f-contest-prize-order-label">{{ t("挑选顺序") }}</span> <span class="f-contest-prize-order-step is-first" role="listitem">
<b>02</b>
<span>{{ t("第 1 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>03</b>
<span>{{ t("第 2 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>04</b>
<span>{{ t("第 3 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>05</b>
<span>{{ t("第 4 顺位") }}</span>
</span> <span class="f-contest-prize-order-hint">{{ t("名次靠前者先选") }}</span> </div> <div class="f-contest-prize-runners"> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">01</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<img width="646" height="342" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/rsp1.webp"' :alt='t("晨科创 RSP1 SDR 软件无线电接收机")'>
</figure> <h4>{{ t("晨科创 RSP1（自用款）") }}</h4> <p class="f-contest-prize-card-desc">{{ t("SDR 软件无线电接收机 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">02</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="268" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/keyboard.webp"' :alt='t("微星 FORGE GK300 W 红轴机械键盘")'>
</figure> <h4>{{ t("微星 FORGE GK300 W") }}</h4> <p class="f-contest-prize-card-desc">{{ t("红轴机械键盘 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">03</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/earphones.webp"' :alt='t("水月雨 GM01 PRO 游戏耳机")'>
</figure> <h4>{{ t("水月雨 GM01 PRO") }}</h4> <p class="f-contest-prize-card-desc">{{ t("游戏耳机 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">04</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/kita-plush.webp"' :alt='t("《孤独摇滚！》喜多郁代毛绒玩偶")'>
</figure> <h4>{{ t("《孤独摇滚！》喜多郁代") }}</h4> <p class="f-contest-prize-card-desc">{{ t("毛绒玩偶 · 含实体奖状") }}</p> </article> </div> <article class="f-contest-prize-consolation"> <div class="f-contest-prize-consolation-copy"> <p class="f-contest-prize-rank">
<span class="f-contest-prize-rank-no">06–10</span>{{ t("第六至第十名") }}</p> <h4>{{ t("771 天线") }}</h4> <p class="f-contest-prize-consolation-desc">{{ t("五席好礼，为你的下一次通联加油；同时颁发电子奖状。") }}</p> </div> <figure class="f-contest-prize-consolation-media"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="320" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/antenna-771.webp"' :alt='t("771 双段天线")'> </figure> </article> <div class="f-contest-prize-badge" role="note" :aria-label='t("赛事前三名永久铭牌标识说明")'> <span class="f-contest-prize-badge-icon" aria-hidden="true"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"> <circle cx="12" cy="9" r="5.2">
</circle> <path d="M8.6 13.3 7 21l5-2.4L17 21l-1.6-7.7">
</path> <path d="m10.2 9 1.3 1.3 2.3-2.6">
</path> </svg> </span> <div class="f-contest-prize-badge-main"> <p class="f-contest-prize-kicker">{{ t("RANK BADGE · 铭牌标识") }}</p> <h4>{{ t("赛事前三名 · 换卡界面永久铭牌") }}</h4> <p class="f-contest-prize-badge-desc">{{ t("赛事前三名（冠军、亚军、季军）的作品将在「换卡界面」获得永久网站铭牌标识：展示赛事名称、届次与最终名次，长期保留，作为官方荣誉认证。") }}</p> </div> <ul class="f-contest-prize-badge-tags"> <li>{{ t("永久展示") }}</li> <li>{{ t("换卡界面可见") }}</li> <li>{{ t("标注赛事与名次") }}</li> </ul> </div>
</section>
<section class="f-contest-section" id="rules" aria-labelledby="contest-rules-title">
<div class="f-contest-section-head">
<span class="eyebrow">02</span>
<h2 id="contest-rules-title">{{ t("参赛须知") }}</h2>
</div>
<div class="f-contest-rules">
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<rect x="3" y="6" width="14" height="10" rx="2.5">
</rect>
<path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5H18">
</path>
</svg>
</span>
<span class="eyebrow">01</span>
</div>
<h3>{{ t("参赛规则") }}</h3>
<ul>
<li>{{ t("参赛卡片须先上传至卡片广场供大家换卡。上传时可勾选「审核通过后自动参赛」并填写参赛说明，卡片通过广场审核时将连同说明一起审核并自动参赛；也可以先上传，通过广场审核后到比赛报名页选择本人卡片。每个账号保留一份报名，最多 2 件作品，可修改后重新提交。") }}</li>
<li>{{ t("比赛采用一轮投票制：每个账号全赛期累计最多投 5 票，可投给五个不同作品，无每日限制；对每件作品最多投 1 票，投出后不可撤回，允许投给自己的作品。每个呼号仅可获得其最高名次的一项奖。") }}</li>
<li>{{ t("禁止多账号刷票、脚本投票及付费买票。同一浏览器跨账号合计最多 5 票，系统限制高频请求；共用浏览器请注意共享额度，遇到误拦请联系管理员。") }}</li>
<li>{{ t("账号正常可用即可投票，无需拥有广场卡片，也无需报名参赛。投票起止时间以赛事公布的安排为准，请从参赛作品列表进入作品详情投票，列表不提供快捷投票。") }}</li>
<li>{{ t("报名截止日期为 2026 年 12 月 20 日，颁奖日期为 2026 年 12 月 25 日。其他赛程安排请关注赛事动态。") }}</li>
</ul>
</article>
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.8z">
</path>
</svg>
</span>
<span class="eyebrow">02</span>
</div>
<h3>{{ t("评分规则") }}</h3>
<ul>
<li>{{ t("总分 100 分：机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分。") }}</li>
<li>{{ t("机器评分由 3 个 AI 智能体分别打分（每个 0–10 分）后合计。") }}</li>
<li>{{ t("人工评分由 5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人平均分 × 5。") }}</li>
<li>{{ t("投票评分：作品前 5 票每票 2 分；再按有效得票数排名分为 10 段，分段赋 1–10 分。") }}</li>
<li>{{ t("完整细则与算例见下方「评分细则」。作品票数不等于最终得分，页面不提供自动评分或获奖计算。") }}</li>
</ul>
</article>
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M8 3h8v5a4 4 0 0 1-8 0z">
</path>
<path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4">
</path>
</svg>
</span>
<span class="eyebrow">03</span>
</div>
<h3>{{ t("奖品发放规则") }}</h3>
<ul>
<li>{{ t("实物奖品共十名，前五名领奖时须核验操作证号、执照号与呼号一致，并提供相关证明材料供人工审核；报名阶段不收集这些证照资料。领奖时间、寄送方式及其他发放安排待公布。") }}</li>
</ul>
</article>
</div>
<div class="f-contest-scoring"> <div class="f-contest-score-head"> <div class="f-contest-score-head-main"> <p class="f-contest-prize-kicker">{{ t("SCORING · 评分细则") }}</p> <h3 id="contest-scoring-title">{{ t("总分 100 分怎么算") }}</h3> </div> <p class="f-contest-score-lead">{{ t("机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分，三项相加即作品最终得分（满分 100 分）。") }}</p> </div> <div class="f-contest-score-weights" role="img" :aria-label='t("评分构成：机器评分 30 分、人工评分 50 分、投票评分 20 分")'> <div class="f-contest-score-weight-bar"> <span class="is-machine" style="flex:30">
</span> <span class="is-human" style="flex:50">
</span> <span class="is-vote" style="flex:20">
</span> </div> <ul class="f-contest-score-weight-legend"> <li class="is-machine">
<b>30</b>
<span>{{ t("机器评分") }}</span>
</li> <li class="is-human">
<b>50</b>
<span>{{ t("人工评分") }}</span>
</li> <li class="is-vote">
<b>20</b>
<span>{{ t("投票评分") }}</span>
</li> </ul> </div> <div class="f-contest-score-grid"> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">01</span> <h4>{{ t("机器评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("30 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("由 3 个 AI 智能体分别独立打分，每个智能体满分 10 分，三者合计为机器得分。") }}</p> <p class="f-contest-score-formula">{{ t("AI ① + AI ② + AI ③（各 0–10 分）") }}</p> <ul class="f-contest-score-list"> <li>{{ t("3 个智能体独立评分、互不影响；") }}</li> <li>{{ t("单个智能体按 0–10 分打分，可保留 0.5 分；") }}</li> <li>{{ t("三项相加即机器得分，满分 30 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("三个智能体分别打 8.5 / 9 / 8 分 → 机器得分 25.5 分。") }}</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">02</span> <h4>{{ t("人工评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("50 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人的平均分，再乘以 5 折算为 50 分制。") }}</p> <p class="f-contest-score-formula">{{ t("剩余 3 人平均分 × 5（满分 50 分）") }}</p> <ul class="f-contest-score-list"> <li>{{ t("5 位评委独立打分，每人满分 10 分；") }}</li> <li>{{ t("去掉一个最高分、一个最低分；") }}</li> <li>{{ t("剩余 3 人取平均后乘 5，满分 50 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("评委打分 8 / 7.5 / 7 / 6.5 / 6 分 → 去掉 8、6 → (7.5+7+6.5)÷3 = 7 → 7 × 5 = 35 分。") }}</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">03</span> <h4>{{ t("投票评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("20 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("由「票数分 10 分」和「排名分 10 分」两部分组成。") }}</p> <p class="f-contest-score-formula">{{ t("前 5 票 × 2 分 + 得票排名分段分") }}</p> <ul class="f-contest-score-list"> <li>
<b>{{ t("票数分") }}</b>{{ t("：作品前 5 票每票 2 分，满 5 票得 10 分；第 6 票起不再累加。") }}</li> <li>
<b>{{ t("排名分") }}</b>{{ t("：全部作品按有效得票数从高到低排名，平均分为 10 段（第 1 段票数最高），分段赋 10 至 1 分；同票同段同分。") }}</li> <li>{{ t("投票分 = 票数分 + 排名分，满分 20 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("7 票、票数排名第 1 段 → 5×2+10 = 20 分；2 票、排名第 3 段 → 2×2+8 = 12 分。") }}</p> </article> </div> <div class="f-contest-score-total"> <p class="f-contest-score-total-title">{{ t("算一笔总分：25.5 + 35 + 14 = 74.5") }}</p> <div class="f-contest-score-total-calc"> <span class="f-contest-score-total-item is-machine">
<b>25.5</b>
<span>{{ t("机器") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-human">
<b>35</b>
<span>{{ t("人工") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-vote">
<b>14</b>
<span>{{ t("投票") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">=</span> <span class="f-contest-score-total-item is-total">
<b>74.5</b>
<span>{{ t("总分") }}</span>
</span> </div> <p class="f-contest-score-total-note">{{ t("示例作品：机器 25.5 分（8.5+9+8）；人工 35 分（去掉最高最低后剩余 3 人均分 7，×5）；投票 14 分（7 票 → 10 分；得票排名第 7 段 → 4 分），总分 74.5 分。") }}</p> </div> <p class="f-contest-score-tiebreak">
<b>{{ t("同分排名") }}</b>{{ t("作品总分相同时，按人工评分得分高低进行排名；如人工评分也一致，交由赛事举办方做最终排名。") }}</p> <p class="f-contest-score-footnote">{{ t("作品票数不等于最终得分；完整评分维度与争议处理以赛事方公布为准，页面不提供自动评分或获奖计算。") }}</p> </div>
</section>
</div></template>
<template v-else><div class="f-contest container">
<div class="f-contest-intro">
<header class="f-contest-hero">
<div class="f-contest-hero-copy">
<h1>{{ t("第一届QSLink杯QSL卡片设计大赛") }}</h1>
<div class="f-contest-actions">
<a class="btn btn-soft btn-lg" href="/events/qsl-design-2026-11/alternate#rules" data-link="">{{ t("参赛须知") }}</a>
<a class="btn btn-primary btn-lg" href="/events/qsl-design-2026-11/registration" data-link="">{{ t("比赛报名") }}<svg class="icon " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M5 12h14">
</path>
<path d="M13 6l6 6-6 6">
</path>
</svg>
</a>
</div>
</div>
</header>
<figure class="f-contest-hero-figure">
<span class="f-contest-trophy-label">
<svg class="icon " width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M8 3h8v5a4 4 0 0 1-8 0z">
</path>
<path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4">
</path>
</svg>{{ t("冠军奖杯") }}</span>
<div class="f-contest-trophy-stage">
<img class="f-contest-hero-image" width="1121" height="1403" decoding="async" :src='"/assets/contest-trophy.webp"' :alt='t("第一届QSLink杯QSL卡片设计大赛")'>
</div>
<figcaption>{{ t("此为奖杯样式图，真实的奖杯中的图片背景会用参赛的卡片制成哦") }}</figcaption>
</figure>
</div>
<section class="f-contest-section" aria-labelledby="contest-news-title">
<div class="f-contest-section-head">
<span class="eyebrow">01</span>
<h2 id="contest-news-title">{{ t("赛事动态") }}</h2>
</div>
<div data-news="" aria-live="polite">
<ContestNewsVue3 :services="services" @ready="alignHash" />
</div>
</section>
<section class="f-contest-prize f-contest-prizes" aria-labelledby="contest-prizes-title"> <div class="f-contest-prize-head"> <div class="f-contest-prize-head-main"> <p class="f-contest-prize-kicker">{{ t("PRIZES · 奖品设置") }}</p> <h3 id="contest-prizes-title">{{ t("十强好礼，等你来赢") }}</h3> </div> <p class="f-contest-prize-lead">{{ t("十件实物奖品，按最终名次依次发放；冠军大奖将随审核通过的报名人数解锁升级。") }}</p> </div> <article class="f-contest-prize-champion" aria-labelledby="f-contest-prize-champion-title"> <div class="f-contest-prize-champion-top"> <div class="f-contest-prize-champion-copy"> <p class="f-contest-prize-rank">
<span class="f-contest-prize-rank-no">01</span>{{ t("第一名 · 冠军大奖") }}</p> <h4 class="f-contest-prize-champion-title" id="f-contest-prize-champion-title">{{ t("森海克斯 8650") }}</h4> <p class="f-contest-prize-champion-sub">{{ t("双段手持对讲机，冠军奖品起步即解锁。") }}</p> <ul class="f-contest-prize-champion-tags"> <li>{{ t("双段手持对讲机") }}</li> <li>{{ t("起步即解锁") }}</li> <li>{{ t("100 人升级二选一") }}</li> <li>{{ t("实体奖杯 + 奖状") }}</li> </ul> </div> <figure class="f-contest-prize-champion-media"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/senhai-8650.webp"' :alt='t("森海克斯 8650 双段手持对讲机")'> <figcaption>{{ t("冠军奖品 · 森海克斯 8650") }}</figcaption> </figure> </div> <div class="f-contest-prize-progress">
<div class="f-contest-prizes-stat" data-prize-progress="" aria-live="polite">
<ContestProgressVue3 :services="services" @ready="alignHash" />
</div>
<p class="f-contest-prize-progress-note">{{ t("每个审核通过的报名账号 +1 进度；达到 100 人后升级为二选一，不叠加领取森海克斯 8650。进度随当前审核通过人数实时变化。") }}</p>
</div> <div class="f-contest-prize-upgrade"> <div class="f-contest-prize-upgrade-copy"> <span class="f-contest-prize-flag">{{ t("100 进度 · 大奖升级") }}</span> <h5 class="f-contest-prize-upgrade-title">{{ t("拓竹 A1 mini") }}<em>{{ t("或") }}</em>{{ t("威诺 VR-N76") }}</h5> <p class="f-contest-prize-upgrade-desc">{{ t("达到 100 名审核通过的报名者后，冠军奖品在以下两件中二选一领取，不与森海克斯 8650 叠加。") }}</p> </div> <div class="f-contest-prize-upgrade-items"> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/a1-mini.webp"' :alt='t("拓竹 A1 mini 桌面 3D 打印机")'> <figcaption>
<strong>{{ t("拓竹 A1 mini") }}</strong>
<span>{{ t("桌面 3D 打印机") }}</span>
</figcaption> </figure> <span class="f-contest-prize-or" aria-hidden="true">{{ t("或") }}</span> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/vr-n76.webp"' :alt='t("威诺 VR-N76 手持对讲机")'> <figcaption>
<strong>{{ t("威诺 VR-N76") }}</strong>
<span>{{ t("手持对讲机") }}</span>
</figcaption> </figure> </div> </div> </article> <div class="f-contest-prize-runners-head"> <div class="f-contest-prize-runners-heading"> <h4>{{ t("第二至第五名") }}<span class="f-contest-prize-runners-chip">{{ t("四件奖品 · 每人选一件") }}</span>
</h4> <p class="f-contest-prize-runners-note">{{ t("四项奖品按获奖名次依次挑选，名次靠前者优先挑选。") }}</p> </div> </div> <div class="f-contest-prize-order" role="list" :aria-label='t("奖品挑选顺序：按获奖名次依次挑选，名次靠前者优先")'> <span class="f-contest-prize-order-label">{{ t("挑选顺序") }}</span> <span class="f-contest-prize-order-step is-first" role="listitem">
<b>02</b>
<span>{{ t("第 1 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>03</b>
<span>{{ t("第 2 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>04</b>
<span>{{ t("第 3 顺位") }}</span>
</span> <span class="f-contest-prize-order-arrow" aria-hidden="true">
</span> <span class="f-contest-prize-order-step" role="listitem">
<b>05</b>
<span>{{ t("第 4 顺位") }}</span>
</span> <span class="f-contest-prize-order-hint">{{ t("名次靠前者先选") }}</span> </div> <div class="f-contest-prize-runners"> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">01</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<img width="646" height="342" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/rsp1.webp"' :alt='t("晨科创 RSP1 SDR 软件无线电接收机")'>
</figure> <h4>{{ t("晨科创 RSP1（自用款）") }}</h4> <p class="f-contest-prize-card-desc">{{ t("SDR 软件无线电接收机 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">02</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="268" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/keyboard.webp"' :alt='t("微星 FORGE GK300 W 红轴机械键盘")'>
</figure> <h4>{{ t("微星 FORGE GK300 W") }}</h4> <p class="f-contest-prize-card-desc">{{ t("红轴机械键盘 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">03</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/earphones.webp"' :alt='t("水月雨 GM01 PRO 游戏耳机")'>
</figure> <h4>{{ t("水月雨 GM01 PRO") }}</h4> <p class="f-contest-prize-card-desc">{{ t("游戏耳机 · 含实体奖状") }}</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head">
<span class="f-contest-prize-card-rank">04</span>
<span class="f-contest-prize-card-rank-label">{{ t("奖品备选") }}</span>
<span class="f-contest-prize-card-pick">{{ t("含实体奖状") }}</span>
</div> <figure class="f-contest-prize-card-media">
<span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span>
<img width="800" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/kita-plush.webp"' :alt='t("《孤独摇滚！》喜多郁代毛绒玩偶")'>
</figure> <h4>{{ t("《孤独摇滚！》喜多郁代") }}</h4> <p class="f-contest-prize-card-desc">{{ t("毛绒玩偶 · 含实体奖状") }}</p> </article> </div> <article class="f-contest-prize-consolation"> <div class="f-contest-prize-consolation-copy"> <p class="f-contest-prize-rank">
<span class="f-contest-prize-rank-no">06–10</span>{{ t("第六至第十名") }}</p> <h4>{{ t("771 天线") }}</h4> <p class="f-contest-prize-consolation-desc">{{ t("五席好礼，为你的下一次通联加油；同时颁发电子奖状。") }}</p> </div> <figure class="f-contest-prize-consolation-media"> <span class="f-contest-prize-note">{{ t("颜色/样式随机") }}</span> <img width="320" height="800" loading="lazy" decoding="async" :src='"/assets/contest-2026-11/antenna-771.webp"' :alt='t("771 双段天线")'> </figure> </article> <div class="f-contest-prize-badge" role="note" :aria-label='t("赛事前三名永久铭牌标识说明")'> <span class="f-contest-prize-badge-icon" aria-hidden="true"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"> <circle cx="12" cy="9" r="5.2">
</circle> <path d="M8.6 13.3 7 21l5-2.4L17 21l-1.6-7.7">
</path> <path d="m10.2 9 1.3 1.3 2.3-2.6">
</path> </svg> </span> <div class="f-contest-prize-badge-main"> <p class="f-contest-prize-kicker">{{ t("RANK BADGE · 铭牌标识") }}</p> <h4>{{ t("赛事前三名 · 换卡界面永久铭牌") }}</h4> <p class="f-contest-prize-badge-desc">{{ t("赛事前三名（冠军、亚军、季军）的作品将在「换卡界面」获得永久网站铭牌标识：展示赛事名称、届次与最终名次，长期保留，作为官方荣誉认证。") }}</p> </div> <ul class="f-contest-prize-badge-tags"> <li>{{ t("永久展示") }}</li> <li>{{ t("换卡界面可见") }}</li> <li>{{ t("标注赛事与名次") }}</li> </ul> </div>
</section>
<section class="f-contest-section" id="rules" aria-labelledby="contest-rules-title">
<div class="f-contest-section-head">
<span class="eyebrow">02</span>
<h2 id="contest-rules-title">{{ t("参赛须知") }}</h2>
</div>
<div class="f-contest-rules">
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<rect x="3" y="6" width="14" height="10" rx="2.5">
</rect>
<path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 1-1.5 1.5H18">
</path>
</svg>
</span>
<span class="eyebrow">01</span>
</div>
<h3>{{ t("参赛规则") }}</h3>
<ul>
<li>{{ t("参赛卡片须先上传至卡片广场供大家换卡。上传时可勾选「审核通过后自动参赛」并填写参赛说明，卡片通过广场审核时将连同说明一起审核并自动参赛；也可以先上传，通过广场审核后到比赛报名页选择本人卡片。每个账号保留一份报名，最多 2 件作品，可修改后重新提交。") }}</li>
<li>{{ t("比赛采用一轮投票制：每个账号全赛期累计最多投 5 票，可投给五个不同作品，无每日限制；对每件作品最多投 1 票，投出后不可撤回，允许投给自己的作品。每个呼号仅可获得其最高名次的一项奖。") }}</li>
<li>{{ t("禁止多账号刷票、脚本投票及付费买票。同一浏览器跨账号合计最多 5 票，系统限制高频请求；共用浏览器请注意共享额度，遇到误拦请联系管理员。") }}</li>
<li>{{ t("账号正常可用即可投票，无需拥有广场卡片，也无需报名参赛。投票起止时间以赛事公布的安排为准，请从参赛作品列表进入作品详情投票，列表不提供快捷投票。") }}</li>
<li>{{ t("报名截止日期为 2026 年 12 月 20 日，颁奖日期为 2026 年 12 月 25 日。其他赛程安排请关注赛事动态。") }}</li>
</ul>
</article>
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.8z">
</path>
</svg>
</span>
<span class="eyebrow">02</span>
</div>
<h3>{{ t("评分规则") }}</h3>
<ul>
<li>{{ t("总分 100 分：机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分。") }}</li>
<li>{{ t("机器评分由 3 个 AI 智能体分别打分（每个 0–10 分）后合计。") }}</li>
<li>{{ t("人工评分由 5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人平均分 × 5。") }}</li>
<li>{{ t("投票评分：作品前 5 票每票 2 分；再按有效得票数排名分为 10 段，分段赋 1–10 分。") }}</li>
<li>{{ t("完整细则与算例见下方「评分细则」。作品票数不等于最终得分，页面不提供自动评分或获奖计算。") }}</li>
</ul>
</article>
<article class="f-contest-rule">
<div class="f-contest-rule-head">
<span class="f-contest-rule-icon">
<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
<path d="M8 3h8v5a4 4 0 0 1-8 0z">
</path>
<path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4">
</path>
</svg>
</span>
<span class="eyebrow">03</span>
</div>
<h3>{{ t("奖品发放规则") }}</h3>
<ul>
<li>{{ t("实物奖品共十名，前五名领奖时须核验操作证号、执照号与呼号一致，并提供相关证明材料供人工审核；报名阶段不收集这些证照资料。领奖时间、寄送方式及其他发放安排待公布。") }}</li>
</ul>
</article>
</div>
<div class="f-contest-scoring"> <div class="f-contest-score-head"> <div class="f-contest-score-head-main"> <p class="f-contest-prize-kicker">{{ t("SCORING · 评分细则") }}</p> <h3 id="contest-scoring-title">{{ t("总分 100 分怎么算") }}</h3> </div> <p class="f-contest-score-lead">{{ t("机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分，三项相加即作品最终得分（满分 100 分）。") }}</p> </div> <div class="f-contest-score-weights" role="img" :aria-label='t("评分构成：机器评分 30 分、人工评分 50 分、投票评分 20 分")'> <div class="f-contest-score-weight-bar"> <span class="is-machine" style="flex:30">
</span> <span class="is-human" style="flex:50">
</span> <span class="is-vote" style="flex:20">
</span> </div> <ul class="f-contest-score-weight-legend"> <li class="is-machine">
<b>30</b>
<span>{{ t("机器评分") }}</span>
</li> <li class="is-human">
<b>50</b>
<span>{{ t("人工评分") }}</span>
</li> <li class="is-vote">
<b>20</b>
<span>{{ t("投票评分") }}</span>
</li> </ul> </div> <div class="f-contest-score-grid"> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">01</span> <h4>{{ t("机器评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("30 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("由 3 个 AI 智能体分别独立打分，每个智能体满分 10 分，三者合计为机器得分。") }}</p> <p class="f-contest-score-formula">{{ t("AI ① + AI ② + AI ③（各 0–10 分）") }}</p> <ul class="f-contest-score-list"> <li>{{ t("3 个智能体独立评分、互不影响；") }}</li> <li>{{ t("单个智能体按 0–10 分打分，可保留 0.5 分；") }}</li> <li>{{ t("三项相加即机器得分，满分 30 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("三个智能体分别打 8.5 / 9 / 8 分 → 机器得分 25.5 分。") }}</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">02</span> <h4>{{ t("人工评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("50 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人的平均分，再乘以 5 折算为 50 分制。") }}</p> <p class="f-contest-score-formula">{{ t("剩余 3 人平均分 × 5（满分 50 分）") }}</p> <ul class="f-contest-score-list"> <li>{{ t("5 位评委独立打分，每人满分 10 分；") }}</li> <li>{{ t("去掉一个最高分、一个最低分；") }}</li> <li>{{ t("剩余 3 人取平均后乘 5，满分 50 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("评委打分 8 / 7.5 / 7 / 6.5 / 6 分 → 去掉 8、6 → (7.5+7+6.5)÷3 = 7 → 7 × 5 = 35 分。") }}</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">03</span> <h4>{{ t("投票评分") }}</h4> <span class="f-contest-score-card-pts">{{ t("20 分") }}</span> </div> <p class="f-contest-score-card-desc">{{ t("由「票数分 10 分」和「排名分 10 分」两部分组成。") }}</p> <p class="f-contest-score-formula">{{ t("前 5 票 × 2 分 + 得票排名分段分") }}</p> <ul class="f-contest-score-list"> <li>
<b>{{ t("票数分") }}</b>{{ t("：作品前 5 票每票 2 分，满 5 票得 10 分；第 6 票起不再累加。") }}</li> <li>
<b>{{ t("排名分") }}</b>{{ t("：全部作品按有效得票数从高到低排名，平均分为 10 段（第 1 段票数最高），分段赋 10 至 1 分；同票同段同分。") }}</li> <li>{{ t("投票分 = 票数分 + 排名分，满分 20 分。") }}</li> </ul> <p class="f-contest-score-example">
<b>{{ t("示例") }}</b>{{ t("7 票、票数排名第 1 段 → 5×2+10 = 20 分；2 票、排名第 3 段 → 2×2+8 = 12 分。") }}</p> </article> </div> <div class="f-contest-score-total"> <p class="f-contest-score-total-title">{{ t("算一笔总分：25.5 + 35 + 14 = 74.5") }}</p> <div class="f-contest-score-total-calc"> <span class="f-contest-score-total-item is-machine">
<b>25.5</b>
<span>{{ t("机器") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-human">
<b>35</b>
<span>{{ t("人工") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-vote">
<b>14</b>
<span>{{ t("投票") }}</span>
</span> <span class="f-contest-score-total-op" aria-hidden="true">=</span> <span class="f-contest-score-total-item is-total">
<b>74.5</b>
<span>{{ t("总分") }}</span>
</span> </div> <p class="f-contest-score-total-note">{{ t("示例作品：机器 25.5 分（8.5+9+8）；人工 35 分（去掉最高最低后剩余 3 人均分 7，×5）；投票 14 分（7 票 → 10 分；得票排名第 7 段 → 4 分），总分 74.5 分。") }}</p> </div> <p class="f-contest-score-tiebreak">
<b>{{ t("同分排名") }}</b>{{ t("作品总分相同时，按人工评分得分高低进行排名；如人工评分也一致，交由赛事举办方做最终排名。") }}</p> <p class="f-contest-score-footnote">{{ t("作品票数不等于最终得分；完整评分维度与争议处理以赛事方公布为准，页面不提供自动评分或获奖计算。") }}</p> </div>
</section>
</div></template>
</template>
