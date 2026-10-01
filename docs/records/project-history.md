---
kind: changelog
lang: zh
---

# Git 开发历史与文档事件边界

> 文档归属：[实施记录](README.md)。

本页按本次整理基线的 Git 主线排列可识别提交，保留 Git 的完整日期和原始主题。提交主题描述开发意图，不自动证明业务完成、CI 通过或生产部署。正文中较早的设计日期与首次进入 Git 的日期可以不同；判断开发、验收与发布分别查询其来源。

## 从 Git 重现

```sh
git log --reverse --first-parent --date=iso-strict --format='%h %cI %s'
git log --follow --format='%h %cI %s' -- <document-path>
git show <commit>:<original-path>
```

主线中仅写作“commit”等无法说明内容的主题不据此推断业务事件，详细改动保留在 Git diff。下表是此次 checkout 的主线快照；新事件通过注明日期的记录追加，Git 保持完整开发历史。

## 主线月份导航

[四月](#2026-04) · [五月](#2026-05) · [六月](#2026-06) · [七月](#2026-07) · [九月](#2026-09)。按 Git 首父链顺序排列，不将 commit timestamp 推定为设计或上线日期。

## 2026-04

| Git 提交时间 | 提交 | 原始主题 |
| --- | --- | --- |
| 2026-04-02T15:16:18+08:00 | [a8fcf102](https://github.com/LiLink-Campus/LiLink/commit/a8fcf1026e4943fdc84d39127bc53e1f95b68ae2) | first commit |
| 2026-04-02T16:49:14+08:00 | [d7c95920](https://github.com/LiLink-Campus/LiLink/commit/d7c95920dfa45dd5107adf362293d164d2e66f6c) | Queue intro emails and tighten auth responses |
| 2026-04-03T10:55:22+08:00 | [6aa344b8](https://github.com/LiLink-Campus/LiLink/commit/6aa344b804bbadb0dbb2f9316cf9ca8457d76157) | feat(web): enable Vercel Analytics and Speed Insights in root layout |
| 2026-04-05T22:31:49+08:00 | [130236e9](https://github.com/LiLink-Campus/LiLink/commit/130236e96f00e5b88a37538d04604a6e9756d654) | fix: add userType to hasListQuery and improve test user cascade deletion |
| 2026-04-06T00:53:34+08:00 | [36aaa02f](https://github.com/LiLink-Campus/LiLink/commit/36aaa02f888f59699785358c0277b2dab29fadd1) | fix(web): improve mobile layout for About and legal pages |
| 2026-04-06T00:59:59+08:00 | [c99acd6e](https://github.com/LiLink-Campus/LiLink/commit/c99acd6e0ab451649630afd9de2cb040f50540c7) | fix(web): prevent About mechanism steps overflowing on narrow screens |
| 2026-04-06T01:15:28+08:00 | [f1d386a0](https://github.com/LiLink-Campus/LiLink/commit/f1d386a0a85a55873d83f2571a0fa6266fb6e025) | fix(web): dashboard questionnaire UX, about cards, landing stats |
| 2026-04-06T01:31:09+08:00 | [f6edbdc0](https://github.com/LiLink-Campus/LiLink/commit/f6edbdc05902968e057792c29257e9df1b3f4375) | fix(web): align stats strip value row for narrative and numerals |
| 2026-04-06T01:42:20+08:00 | [174d5ede](https://github.com/LiLink-Campus/LiLink/commit/174d5ede8b07fdd26017cc4a952b78e097b5a7c9) | Merge branch 'preview' into main |
| 2026-04-06T01:50:56+08:00 | [78acd37e](https://github.com/LiLink-Campus/LiLink/commit/78acd37ec75aac6096be05895c78a82c9580f727) | fix(admin): clarify registration cap field layout and copy |
| 2026-04-06T02:04:20+08:00 | [fa868fc0](https://github.com/LiLink-Campus/LiLink/commit/fa868fc032e468d80eafa0c39c5d804bffdaeca0) | feat(web): questionnaire completion hints and nickname-only intro field |
| 2026-04-06T02:10:29+08:00 | [6b722837](https://github.com/LiLink-Campus/LiLink/commit/6b72283763feb0bd616e574caf5d2cd1e6c711a7) | perf(web): dedupe /auth/me and preconnect to API origin |
| 2026-04-06T02:23:33+08:00 | [9f9c3714](https://github.com/LiLink-Campus/LiLink/commit/9f9c371476aff91e1e988463a135b0d873837ac1) | perf(admin): slim user list and lazy-load full questionnaire |
| 2026-04-06T02:46:08+08:00 | [9cebe267](https://github.com/LiLink-Campus/LiLink/commit/9cebe267d6c8e6a0d42f18c1d771a006ef039979) | fix(web): prevent auth panel horizontal overflow on narrow viewports |
| 2026-04-06T18:17:57+08:00 | [d53c73a8](https://github.com/LiLink-Campus/LiLink/commit/d53c73a83d528bd6b65a4df0b7fa2e094e7f37e9) | change number |
| 2026-04-06T19:09:24+08:00 | [c5823ebb](https://github.com/LiLink-Campus/LiLink/commit/c5823ebb81fd4e31f95ed231b08951b5ac545f65) | perf(web): RSC bootstrap for dashboard and admin, Caddy encode api |
| 2026-04-06T19:44:27+08:00 | [ecc45934](https://github.com/LiLink-Campus/LiLink/commit/ecc45934cf799413055f025099b91f9847e955c5) | chore: empty commit to trigger deployment |
| 2026-04-06T20:28:29+08:00 | [c21e7c7a](https://github.com/LiLink-Campus/LiLink/commit/c21e7c7afebdce79f5d79a7a8ca07372f38b4eae) | fix(admin): retry overview when initial dashboard data is missing |
| 2026-04-06T20:54:56+08:00 | [e1a6b884](https://github.com/LiLink-Campus/LiLink/commit/e1a6b884f637d30bf9aee835f004060d2bfcd4ab) | fix(web): separate nickname from questionnaire one-liner intro |
| 2026-04-06T21:16:23+08:00 | [b475bb5d](https://github.com/LiLink-Campus/LiLink/commit/b475bb5d56a41faff4271e2e2e4ed0759de8310e) | feat(web): surface match reasons on dashboard with email parity copy |
| 2026-04-10T02:20:32+08:00 | [4c6be861](https://github.com/LiLink-Campus/LiLink/commit/4c6be8616896ac662516480e462539701792e4e0) | change number |
| 2026-04-10T03:35:57+08:00 | [b42b6991](https://github.com/LiLink-Campus/LiLink/commit/b42b69910bd7dbf1d86168af20d4afa91e73a1c6) | feat(web): replace hero reveal date with live countdown |
| 2026-04-10T03:40:25+08:00 | [9ad9011f](https://github.com/LiLink-Campus/LiLink/commit/9ad9011fd694cb599983c745f4badb90c2c8ae23) | style(web): refine hero countdown UI to match minimalist design |
| 2026-04-10T03:41:55+08:00 | [5332ba23](https://github.com/LiLink-Campus/LiLink/commit/5332ba23a8b6a001f79f9f14b3747d89951a43dc) | feat(web): always show days in hero countdown |
| 2026-04-10T03:45:55+08:00 | [bf8cd778](https://github.com/LiLink-Campus/LiLink/commit/bf8cd778daad679ff58c5eccd63e1840d3da91a6) | style(web): remove trailing punctuation in about cta to fix optical alignment |
| 2026-04-10T03:47:02+08:00 | [b8c27633](https://github.com/LiLink-Campus/LiLink/commit/b8c276336f05f8000db94390c573efbc4b7ef29a) | style(web): restore question mark with optical centering |
| 2026-04-11T21:07:29+08:00 | [310f3485](https://github.com/LiLink-Campus/LiLink/commit/310f3485e065768a1a522ad8244882c5b98bfaac) | chore(api): remove legacy Prisma SQL scripts and apply formatting fixes |
| 2026-04-11T23:01:55+08:00 | [f92b70b1](https://github.com/LiLink-Campus/LiLink/commit/f92b70b1b4ca8757192fc98bab46cae09ac9993c) | feat: migrate admin and hard-match logic into shared workspace |
| 2026-04-11T23:46:43+08:00 | [da823005](https://github.com/LiLink-Campus/LiLink/commit/da823005fa27eec37bc29434cd0c9426d5d0b91a) | Improve cycle match selection |
| 2026-04-11T23:49:12+08:00 | [cf229510](https://github.com/LiLink-Campus/LiLink/commit/cf229510a7ab144be16b9543ba094a2a431bc2be) | fix(shared): run tests via directory path for POSIX shells |
| 2026-04-12T00:04:30+08:00 | [7416e0b3](https://github.com/LiLink-Campus/LiLink/commit/7416e0b35343d58dd47ebc88d852837e95030eda) | Merge branch 'main' into codex |
| 2026-04-12T00:37:50+08:00 | [c0c3ceda](https://github.com/LiLink-Campus/LiLink/commit/c0c3ceda3039d45150ef2f7881cd207505bbbb3a) | fix: stabilize shared tests and refresh cycle admin data |
| 2026-04-12T01:32:20+08:00 | [57a43250](https://github.com/LiLink-Campus/LiLink/commit/57a43250e4ddf40cfba56c1882014f07ac24c417) | fix(api): align monorepo env loading |
| 2026-04-12T01:38:11+08:00 | [68af3a6d](https://github.com/LiLink-Campus/LiLink/commit/68af3a6de54123f66fb11729e77ee9dae6e6eaaf) | docs: update operations notes |
| 2026-04-12T01:47:41+08:00 | [482c3697](https://github.com/LiLink-Campus/LiLink/commit/482c36977ebb3e86b606a2b70fac2c96fd40a2b9) | fix(ci): build shared before lint and tests |
| 2026-04-12T02:10:05+08:00 | [386dd68b](https://github.com/LiLink-Campus/LiLink/commit/386dd68b577cf712778b115095621e21271d303f) | chore(docker): unify compose, slim API image build |
| 2026-04-12T02:46:35+08:00 | [115b1cfa](https://github.com/LiLink-Campus/LiLink/commit/115b1cfa8418ca31f905fa733cced30ed02c48fb) | fix(web): resolve @lilink/shared for Vercel Turbopack build |
| 2026-04-12T02:58:22+08:00 | [268f71f2](https://github.com/LiLink-Campus/LiLink/commit/268f71f22eac0b1d70e75369aab991322deeeef1) | feat: remap match score to 70-100 range and show on dashboard |
| 2026-04-12T15:05:30+08:00 | [b515fb50](https://github.com/LiLink-Campus/LiLink/commit/b515fb50985c6dae356e6e14451de33fde5565a0) | Merge branch 'codex-match-history-coverage-api' into main |
| 2026-04-12T15:05:43+08:00 | [bb105d5d](https://github.com/LiLink-Campus/LiLink/commit/bb105d5d0949ed204a2d920d8772b3446961577b) | Merge branch 'codex-admin-search-enter-submit' into main |
| 2026-04-12T21:04:01+08:00 | [069ea7a2](https://github.com/LiLink-Campus/LiLink/commit/069ea7a29ccae1c97b42800e8db7b903bd42458c) | Remove MATCHING_API_FOR_FRONTEND.md |
| 2026-04-12T22:10:43+08:00 | [24d896f9](https://github.com/LiLink-Campus/LiLink/commit/24d896f9bb5a1e5be982b240c5067bf18f9ffd30) | fix: handle empty response body in fetchApi to prevent JSON parse error |
| 2026-04-12T22:34:53+08:00 | [b43e5930](https://github.com/LiLink-Campus/LiLink/commit/b43e5930800eba5c8412cb07d36b5892abfa0b8d) | Merge branch 'codex-sticky-cycle-participation' into main |
| 2026-04-12T22:34:59+08:00 | [21bf251e](https://github.com/LiLink-Campus/LiLink/commit/21bf251e6a26c617413b97284ca8767cd1ed3164) | chore: remove 测试操作.md from repository |
| 2026-04-12T23:15:46+08:00 | [3957a2ab](https://github.com/LiLink-Campus/LiLink/commit/3957a2abf7e829352b8e13bea740719a08c5f0f0) | Merge branch 'codex-recent-match-history-api' into main |
| 2026-04-12T23:17:43+08:00 | [470a58d8](https://github.com/LiLink-Campus/LiLink/commit/470a58d8a4721381d518f1a6e21a01718679a8fd) | Fix ESLint require-await in Prisma $transaction test mocks |
| 2026-04-13T00:22:43+08:00 | [07efe165](https://github.com/LiLink-Campus/LiLink/commit/07efe16506cb94810b12629b11fa51c2b44d65b7) | Restrict matching to active users and add admin gender filter |
| 2026-04-13T13:01:18+08:00 | [2470ee0d](https://github.com/LiLink-Campus/LiLink/commit/2470ee0d4ec48a74123dcb327e71e1d56a1fca4e) | fix(cycles): maximize pair count before total raw score |
| 2026-04-13T13:52:40+08:00 | [f9000491](https://github.com/LiLink-Campus/LiLink/commit/f90004915e3852df192fdba8460cda3332d71e7f) | fix(admin): count only OPTED_IN participations in getUserById |
| 2026-04-13T14:03:38+08:00 | [d1ef81de](https://github.com/LiLink-Campus/LiLink/commit/d1ef81de2a017a040c5e681592e43cbf0395ce3e) | fix(admin): count OPTED_IN participations in cycle lists and relabel UI |
| 2026-04-13T15:19:05+08:00 | [0760fcf6](https://github.com/LiLink-Campus/LiLink/commit/0760fcf6e24af6a3ac9dcd0d0a5e9b31ab8b53f9) | refactor(api): move sticky participation backfill out of request paths |
| 2026-04-13T23:16:20+08:00 | [2ac1384d](https://github.com/LiLink-Campus/LiLink/commit/2ac1384d7ec19242795a8e4f84a90a66d18e551a) | feat(api): add bulk reminder script for non-participating questionnaire respondents |
| 2026-04-14T21:11:57+08:00 | [50111e3e](https://github.com/LiLink-Campus/LiLink/commit/50111e3ee6528ecb3860e34965fa694b4b9a74ec) | Add homepage completed-questionnaire display offset constant |
| 2026-04-14T21:14:42+08:00 | [d4b1add6](https://github.com/LiLink-Campus/LiLink/commit/d4b1add6bcc5c583ceef6da8ec91e54b13e9ad61) | Move homepage +10 display offset from questionnaires to matches delivered |
| 2026-04-14T21:19:47+08:00 | [67483a72](https://github.com/LiLink-Campus/LiLink/commit/67483a72a3f86b5a3e9912d4c78fe7a54fcf54c4) | Dashboard: explain bilateral referral emails after introduction |
| 2026-04-15T02:50:13+08:00 | [67682661](https://github.com/LiLink-Campus/LiLink/commit/67682661e5d02f8565ae0ac3b52cd2c84685a17a) | Fix report form UX and stabilize web typecheck |
| 2026-04-15T03:17:59+08:00 | [008ed3fd](https://github.com/LiLink-Campus/LiLink/commit/008ed3fd3202646451a5207e0517c6b7ccb79dac) | fix(web): show correct report status labels on dashboard |
| 2026-04-15T04:19:45+08:00 | [e84d2d61](https://github.com/LiLink-Campus/LiLink/commit/e84d2d61472e35206bc238cb2251eeedb79383a5) | feat(auth): add password reset flow with forgot-password UI |
| 2026-04-16T15:18:28+08:00 | [91e2f7c4](https://github.com/LiLink-Campus/LiLink/commit/91e2f7c48ef0f41ac2e0a7e4e55fa767e18ca084) | feat: school-scoped hard match, questionnaire sync, and announcements |
| 2026-04-16T15:32:51+08:00 | [428f918c](https://github.com/LiLink-Campus/LiLink/commit/428f918c47f1df3786b7ee2a100dc95138305d39) | chore: satisfy eslint and simplify announcement dialog |
| 2026-04-18T22:43:21+08:00 | [18fb52c6](https://github.com/LiLink-Campus/LiLink/commit/18fb52c628098f237a621f217f6f6ab8e1ab9463) | Add silent questionnaire autosave with draft handling |
| 2026-04-19T00:01:29+08:00 | [051945b4](https://github.com/LiLink-Campus/LiLink/commit/051945b4801e9afd286c245d8c74edd6cc0a7ccc) | wip: questionnaire silent autosave with retry and dedicated exception |
| 2026-04-20T00:50:53+08:00 | [56caa9bd](https://github.com/LiLink-Campus/LiLink/commit/56caa9bd1d45c348ba90e4ee739db8ea7d69834e) | fix(questionnaire): stop autosave retry loop and keep draft writes atomic |
| 2026-04-20T01:01:46+08:00 | [9c781419](https://github.com/LiLink-Campus/LiLink/commit/9c7814190031f90611e5bc8d4c76fc22ed095882) | Merge branch 'main' into codex/questionnaire-silent-autosave |
| 2026-04-20T02:00:32+08:00 | [936b3bf1](https://github.com/LiLink-Campus/LiLink/commit/936b3bf132e0de9bb823a024aa33114ad56fe445) | fix(questionnaire): stop autosave retries on invalid payloads |
| 2026-04-20T02:03:44+08:00 | [cef48c68](https://github.com/LiLink-Campus/LiLink/commit/cef48c68eab4da9bed354a03cf86f95efff4a410) | chore(api): apply lint formatting |
| 2026-04-20T02:33:11+08:00 | [3d600333](https://github.com/LiLink-Campus/LiLink/commit/3d6003330b6bfbe549f743c2b7f1b85ad04ea85f) | fix(api): drop tsconfig paths to keep nest build emitting dist/src/main.js |
| 2026-04-20T15:36:10+08:00 | [a807dc2b](https://github.com/LiLink-Campus/LiLink/commit/a807dc2bb6766d734986ee46b522d5932327430d) | Add DeepSeek-generated match narratives |
| 2026-04-20T18:52:11+08:00 | [6fa9aac4](https://github.com/LiLink-Campus/LiLink/commit/6fa9aac49ef22ae3abcaf023d4700bfa972032c4) | feat(api): automate cycle preparation and reveal |
| 2026-04-20T21:52:54+08:00 | [49160e40](https://github.com/LiLink-Campus/LiLink/commit/49160e40e43b0292ca9df06885dc5ab346bfc622) | fix(api): finalize cycle preparation fallback flow |
| 2026-04-20T21:59:44+08:00 | [89a30ac2](https://github.com/LiLink-Campus/LiLink/commit/89a30ac2ccaf415531490292c155113d5f2166cd) | test(api): add remaining controller and service coverage |
| 2026-04-21T17:03:02+08:00 | [0b7a17a8](https://github.com/LiLink-Campus/LiLink/commit/0b7a17a84023e547ba879f4c18cb4344d5fa9cab) | Handle locked weekly cycles in dashboard |
| 2026-04-22T23:09:42+08:00 | [95568c1e](https://github.com/LiLink-Campus/LiLink/commit/95568c1e7feec508c3d1e6761d6df69942e935ac) | Merge remote-tracking branch 'origin/main' into codex/deepseek-match-reason |
| 2026-04-23T16:09:07+08:00 | [e055dd92](https://github.com/LiLink-Campus/LiLink/commit/e055dd92f8115e2517cabdd7e59c93d8b6927ea8) | fix(cycles): lock prepared participation and filter narrative signals |
| 2026-04-23T16:27:20+08:00 | [30ff46ee](https://github.com/LiLink-Campus/LiLink/commit/30ff46ee40127594a4f8ff43d6b49db16350dfcb) | fix(ci): resolve api lint violations |
| 2026-04-23T18:56:33+08:00 | [cfcad136](https://github.com/LiLink-Campus/LiLink/commit/cfcad1361aed2f3c8cb77e0140d624a2410cc86c) | fix(api): prevent stale and unrevealed dashboard snapshots |
| 2026-04-24T00:25:30+08:00 | [659b5dee](https://github.com/LiLink-Campus/LiLink/commit/659b5dee59c5ce1b11cbfbf46d5d66068d7d88d6) | fix(api): checkpoint pending cycle updates |
| 2026-04-24T00:34:54+08:00 | [27f198d3](https://github.com/LiLink-Campus/LiLink/commit/27f198d346a97b8d1bb1e0cae2d331077a7056aa) | fix(api): harden cycle preparation flow |
| 2026-04-24T04:50:20+08:00 | [47059d88](https://github.com/LiLink-Campus/LiLink/commit/47059d88a89e6bc31a9a2d982c797b477d4b8389) | fix(api): address cycle preparation review issues |
| 2026-04-24T05:30:57+08:00 | [f0a1f12b](https://github.com/LiLink-Campus/LiLink/commit/f0a1f12b4128e304bf7b25d3c72a9cb3e88d4c7b) | Fix cycle preparation and reveal status guards |
| 2026-04-24T05:35:46+08:00 | [90821060](https://github.com/LiLink-Campus/LiLink/commit/908210606423a58ba209d24dd714016d6ca76f3e) | Fix cycle preparation spec lint |
| 2026-04-24T17:35:40+08:00 | [15707979](https://github.com/LiLink-Campus/LiLink/commit/15707979082bdcc1d15c52acf59e7f2524d4326a) | Harden cycle preparation state transitions |
| 2026-04-24T19:54:42+08:00 | [7a5ac567](https://github.com/LiLink-Campus/LiLink/commit/7a5ac56721b057ccb4ac71d6102c7f9b7eacfadd) | Update DeepSeek model and topic UI |
| 2026-04-24T19:59:47+08:00 | [58a95894](https://github.com/LiLink-Campus/LiLink/commit/58a95894700e5004db1d9a1862dd4913da697778) | Normalize env loader line endings |
| 2026-04-24T20:06:27+08:00 | [0a41255e](https://github.com/LiLink-Campus/LiLink/commit/0a41255e5b0b96636cc427190dfa5e81bd0d178b) | Fix admin throttling test typing |
| 2026-04-24T23:35:07+08:00 | [d27a6dca](https://github.com/LiLink-Campus/LiLink/commit/d27a6dcaf88c5471710d72ba2e574d1568fcb514) | Register: clarify real name field is optional and can be blank |
| 2026-04-25T04:14:14+08:00 | [f659f7ed](https://github.com/LiLink-Campus/LiLink/commit/f659f7edc8d27480255219e2cca0627d4ee3e38a) | feat(web): mobile-first UI refresh for LiLink |
| 2026-04-25T05:24:39+08:00 | [44bc328d](https://github.com/LiLink-Campus/LiLink/commit/44bc328d64edb67260ab6a2328e1df806b202d21) | perf(web): smooth dashboard navigation |
| 2026-04-25T05:29:14+08:00 | [d84b5792](https://github.com/LiLink-Campus/LiLink/commit/d84b5792598a58ba7a134ea4ffcdcc6331363c1c) | chore(api): normalize tsconfig.json line endings |
| 2026-04-25T05:29:16+08:00 | [afcc3ee5](https://github.com/LiLink-Campus/LiLink/commit/afcc3ee52e0b976788f6463f51271d42b9cf1c73) | chore(docker): pass DeepSeek env vars to API service |
| 2026-04-25T05:54:24+08:00 | [07f2ea48](https://github.com/LiLink-Campus/LiLink/commit/07f2ea48bd77938902171bbe90aea80860ccde5e) | fix(web): polish mobile navigation and match details |
| 2026-04-25T06:48:35+08:00 | [b2921019](https://github.com/LiLink-Campus/LiLink/commit/b2921019a9be326fd87e4b4662727afc1fef892c) | Fix dashboard profile mobile overflow |
| 2026-04-25T22:51:03+08:00 | [18450cc2](https://github.com/LiLink-Campus/LiLink/commit/18450cc2d85a23a655f6cfd72852dd8e4f8abb2f) | Refine match UI and local mail setup |
| 2026-04-25T23:12:43+08:00 | [e680d209](https://github.com/LiLink-Campus/LiLink/commit/e680d2099c8ae384a47864a860bc215f99f0dcd6) | feat(api): outbound email categories and optional bulk From |
| 2026-04-25T23:14:30+08:00 | [984a4e0a](https://github.com/LiLink-Campus/LiLink/commit/984a4e0a4baaf6d0706ee742d5027e51e14a350a) | fix(api): load monorepo .env for Prisma CLI (DATABASE_URL) |
| 2026-04-25T23:14:37+08:00 | [a32c6987](https://github.com/LiLink-Campus/LiLink/commit/a32c6987160ea58853bf524e64da308b4931d131) | chore: add npm run db:migrate:deploy for production migrations |
| 2026-04-25T23:15:32+08:00 | [65060019](https://github.com/LiLink-Campus/LiLink/commit/650600197cf42b52a60cdcc27ed2cb90fc68b361) | fix(api): point Prisma env loader at monorepo root (two levels up) |
| 2026-04-26T00:13:01+08:00 | [9d449584](https://github.com/LiLink-Campus/LiLink/commit/9d4495845d04157508fb5e8b2525d6a0739c778f) | fix(web): tighten responsive layout edges |
| 2026-04-26T00:26:57+08:00 | [2ce724e0](https://github.com/LiLink-Campus/LiLink/commit/2ce724e011d02976fda61024c780806208668c8e) | fix(web): align mobile school summary |
| 2026-04-26T22:00:27+08:00 | [5f1e934e](https://github.com/LiLink-Campus/LiLink/commit/5f1e934e58f1bfe3b27d9968c31fca0a7ca8c9f2) | chore(web): normalize line endings in dashboard and shell components |
| 2026-04-27T04:24:44+08:00 | [0711ae38](https://github.com/LiLink-Campus/LiLink/commit/0711ae3802f9010660a50b4123e6650e2416ce33) | Merge branch 'zyy/performance-improvement' |
| 2026-04-27T17:00:34+08:00 | [d9d872da](https://github.com/LiLink-Campus/LiLink/commit/d9d872da81d79a08e627fa515b0c1b61c3ef79df) | fix(api): apply lint formatting |
| 2026-04-28T17:18:08+08:00 | [02f28562](https://github.com/LiLink-Campus/LiLink/commit/02f28562b2597bf03208581ff76400866eb945fc) | fix: resolve open issue configuration updates |
| 2026-04-28T17:33:28+08:00 | [969cafb6](https://github.com/LiLink-Campus/LiLink/commit/969cafb6011914c54380981316d6de5d0afe6b7c) | docs: add shared agent instructions |
| 2026-04-28T17:39:40+08:00 | [3b1498dd](https://github.com/LiLink-Campus/LiLink/commit/3b1498ddabcce76f4cf1df263efa81c5dd1b5977) | ci: update checkout action |
| 2026-04-29T17:42:35+08:00 | [f46eb44d](https://github.com/LiLink-Campus/LiLink/commit/f46eb44d4ccc6bfea8a0a5525bb94ed609558c36) | feat: add nationality language weight matching |
| 2026-04-29T19:35:45+08:00 | [5816bd99](https://github.com/LiLink-Campus/LiLink/commit/5816bd99dc012cf89736bd22f1ca89e84b4b0fc9) | style: compact profile language selectors |
| 2026-04-29T19:45:06+08:00 | [8b155662](https://github.com/LiLink-Campus/LiLink/commit/8b1556621999e7d2c90b65a6686ce6d905993bcf) | style: keep picker option labels single line |
| 2026-04-29T19:49:33+08:00 | [0fe751a6](https://github.com/LiLink-Campus/LiLink/commit/0fe751a609e84b9273041a61066547f363b27d8e) | style: allow picker option labels to wrap |
| 2026-04-29T19:53:37+08:00 | [38cb7b16](https://github.com/LiLink-Campus/LiLink/commit/38cb7b165801c114913d825de7abba6248345655) | style: center multi choice dialog |
| 2026-04-30T12:53:22+08:00 | [af6e6a1d](https://github.com/LiLink-Campus/LiLink/commit/af6e6a1de55c7725c1d6e6ab4b1b6f82931be719) | self-iterating-review: apply automated fixes |

## 2026-05

| Git 提交时间 | 提交 | 原始主题 |
| --- | --- | --- |
| 2026-05-01T23:15:12+08:00 | [552bc26e](https://github.com/LiLink-Campus/LiLink/commit/552bc26e5b75927758848cf15b414ae1eb7fa81e) | feat(api): add anonymous user export script for ops |
| 2026-05-02T00:46:31+08:00 | [408648a7](https://github.com/LiLink-Campus/LiLink/commit/408648a7443d2cf100735b79472bbf624da15056) | chore: normalize dashboard progress line endings |
| 2026-05-02T18:54:29+08:00 | [22765c40](https://github.com/LiLink-Campus/LiLink/commit/22765c4047777f80757aeccf3b624a2600624248) | feat(api): prioritize unmatched match participants |
| 2026-05-02T23:15:32+08:00 | [17fbd396](https://github.com/LiLink-Campus/LiLink/commit/17fbd3961ce83977c05f39d2b63ad7f97dbe21dc) | Merge branch 'codex/issue-4-matching-scoring-versioning' |
| 2026-05-04T17:01:09+08:00 | [8d454283](https://github.com/LiLink-Campus/LiLink/commit/8d454283f13f223d41bd56d839c092efbedcf12a) | Merge branch 'codex/soft-disable-deepseek-match-narratives' |
| 2026-05-05T18:54:00+08:00 | [88ecfdaf](https://github.com/LiLink-Campus/LiLink/commit/88ecfdafa1a222fdd87d38a85957bc14fbb831a8) | feat(matching): treat partner age window as soft preference |
| 2026-05-05T19:01:12+08:00 | [8154e5ff](https://github.com/LiLink-Campus/LiLink/commit/8154e5ff4a299d9b05788faa51d9242a91b9170b) | chore(web): shorten partner age hint on profile |
| 2026-05-05T19:11:23+08:00 | [62be3347](https://github.com/LiLink-Campus/LiLink/commit/62be3347a2f2cd0bdb14fdcd195921c199306e49) | feat(account): require a complete questionnaire before opting into a cycle |
| 2026-05-05T19:15:51+08:00 | [f9ce5803](https://github.com/LiLink-Campus/LiLink/commit/f9ce58030e8bc5e755373c96775bd54dbc6d230d) | i18n(web): translate questionnaire-required opt-in errors to Chinese |
| 2026-05-05T19:22:50+08:00 | [736a6192](https://github.com/LiLink-Campus/LiLink/commit/736a61921f1856187a9f02e3cf5259f4da63ded2) | test: cover age soft-preference decay and opt-in questionnaire gate edge cases |
| 2026-05-06T12:16:53+08:00 | [ac73295b](https://github.com/LiLink-Campus/LiLink/commit/ac73295ba839d222ac1d18427286ca3b698f985e) | fix(api): use $executeRaw for registration capacity advisory lock |
| 2026-05-06T12:27:03+08:00 | [64b0baef](https://github.com/LiLink-Campus/LiLink/commit/64b0baef04b3d0a54c84927bc18dbeb031d5cff1) | ui(web): make the questionnaire-blocked participation state self-explanatory |
| 2026-05-06T13:19:10+08:00 | [9c27001e](https://github.com/LiLink-Campus/LiLink/commit/9c27001efa5a4e01f80fd7524d34e1e4e6790e81) | fix(api): unblock CI on the registration-capacity e2e and lint format |
| 2026-05-06T13:19:31+08:00 | [8a8c24be](https://github.com/LiLink-Campus/LiLink/commit/8a8c24be85389048b270962e1ada75e00d359968) | feat(account): block opt-in when an unsaved draft is incomplete |
| 2026-05-06T23:10:05+08:00 | [a7c941ab](https://github.com/LiLink-Campus/LiLink/commit/a7c941ab75936c9b9305e90bbd3bdd9b994e23b4) | Merge pull request #7 from nanzhi84/codex/prisma-7-client-migration |
| 2026-05-06T23:27:28+08:00 | [f9ddb6f8](https://github.com/LiLink-Campus/LiLink/commit/f9ddb6f8b84bc49a17befd4f3b786bea1f9b20e0) | Merge pull request #6 from nanzhi84/cursor/missing-test-coverage-c631 |
| 2026-05-06T23:44:20+08:00 | [2d58d1e1](https://github.com/LiLink-Campus/LiLink/commit/2d58d1e1363a09d82e81d975bb8aa71591f7771f) | docs(agents): note prod DATABASE_URL is not in container env |
| 2026-05-07T18:30:28+08:00 | [a6d03bd8](https://github.com/LiLink-Campus/LiLink/commit/a6d03bd82efc76c0a76a688129e276429f5ff2af) | Merge pull request #8 from nanzhi84/codex/issue-5-questionnaire-update-highlight |
| 2026-05-07T19:03:30+08:00 | [e562085b](https://github.com/LiLink-Campus/LiLink/commit/e562085bc12fef7875ab121ffaa43f6410301d19) | fix(web): always show questionnaire progress on dashboard home |
| 2026-05-08T16:41:35+08:00 | [79c9bc73](https://github.com/LiLink-Campus/LiLink/commit/79c9bc737d66f6c1f9e63772f110ec2af155cbca) | Merge pull request #11 from nanzhi84/cursor/increase-risky-test-coverage-5793 |
| 2026-05-08T16:42:20+08:00 | [e96d44af](https://github.com/LiLink-Campus/LiLink/commit/e96d44af036247dd1df05326fab497e4a77c2ec4) | Merge pull request #13 from nanzhi84/cursor/more-registration-tests-5793 |
| 2026-05-08T20:16:30+08:00 | [fbebe585](https://github.com/LiLink-Campus/LiLink/commit/fbebe585e98762fda97084dbabf7067f7b1ddf5c) | Merge pull request #9 from nanzhi84/cursor/regression-test-coverage-68f2 |
| 2026-05-08T20:17:18+08:00 | [728b7dda](https://github.com/LiLink-Campus/LiLink/commit/728b7dda9dd6ece974b781d4ba2c44156b7f1714) | Merge pull request #17 from nanzhi84/cursor/application-security-review-6af0 |
| 2026-05-08T20:33:47+08:00 | [6bd5e49f](https://github.com/LiLink-Campus/LiLink/commit/6bd5e49f2b161b7c6d3ef43e5280a5e23f43ecbc) | chore(web): limit Speed Insights to production with 10% sample rate |
| 2026-05-08T20:59:35+08:00 | [4bd83121](https://github.com/LiLink-Campus/LiLink/commit/4bd83121ff4fc384e96fc36b80346cdc3df65d8b) | Merge pull request #16 from nanzhi84/cursor/regression-test-coverage-02e7 |
| 2026-05-08T21:01:39+08:00 | [57b49dfa](https://github.com/LiLink-Campus/LiLink/commit/57b49dfa95b22303d8031258f9cfc0d896e0e856) | Merge pull request #19 from nanzhi84/cursor/application-security-review-a793 |
| 2026-05-08T22:41:22+08:00 | [7e8e5d19](https://github.com/LiLink-Campus/LiLink/commit/7e8e5d1915a9f3e3f3485bd6387e16b13acb18a7) | Merge pull request #20 from nanzhi84/codex/cursor-automation-policy |
| 2026-05-08T22:55:51+08:00 | [e691ea1a](https://github.com/LiLink-Campus/LiLink/commit/e691ea1a2c094afc9103abbdaf1f6435ea5a2b2d) | Fix questionnaire attention and touch pickers |
| 2026-05-08T23:37:00+08:00 | [df59f06c](https://github.com/LiLink-Campus/LiLink/commit/df59f06c50a3ade69e020e14714cea9b7a9a5a27) | Always use native <select> in ValuePicker |
| 2026-05-09T15:11:21+08:00 | [21944f90](https://github.com/LiLink-Campus/LiLink/commit/21944f908f71b81d894e188994b9d0d6b91f9eb2) | fix(shared): align height picker options with API-valid range (#21) |
| 2026-05-09T15:12:07+08:00 | [547ee181](https://github.com/LiLink-Campus/LiLink/commit/547ee181376b33ca12fe71c5652fe087c5f91ced) | test(shared): cover profile attention hashes and hard-match attention registry (#22) |
| 2026-05-09T07:34:59Z | [c42587d1](https://github.com/LiLink-Campus/LiLink/commit/c42587d1391121481c756b1cf366a63c547380b1) | fix(web): stabilize CI root build when API base URL env is unset (#23) |
| 2026-05-09T18:49:45+08:00 | [3c5dbd78](https://github.com/LiLink-Campus/LiLink/commit/3c5dbd781a8936408e2cd7a39b7af144d285efd5) | docs: add Cursor Cloud specific instructions to AGENTS.md (#25) |
| 2026-05-09T19:45:29+08:00 | [20fbe64d](https://github.com/LiLink-Campus/LiLink/commit/20fbe64db81bf91647ae94e95097d2c24c34d7ca) | chore: reset AI automation policy |
| 2026-05-09T20:15:42+08:00 | [a2e01a26](https://github.com/LiLink-Campus/LiLink/commit/a2e01a264df831f970a9104a6e02e8af727024c2) | chore: allow Cursor AI branch names |
| 2026-05-09T23:41:38+08:00 | [edb9643a](https://github.com/LiLink-Campus/LiLink/commit/edb9643a5156080c31724059e2fc25816b487fe9) | fix(shared): avoid URIError when profile attention hash is malformed (#26) |
| 2026-05-09T23:41:59+08:00 | [0ba03711](https://github.com/LiLink-Campus/LiLink/commit/0ba037113575d355326cf84d8fa19969fa41d019) | fix(api): block bulk test user seed/delete in production (#27) |
| 2026-05-09T23:42:13+08:00 | [51cfa394](https://github.com/LiLink-Campus/LiLink/commit/51cfa394bdcd05f8cdddc390f4796d3b4024372b) | test(shared): cover normalizeBirthDate, readHeightValue, one-liner edges (#28) |
| 2026-05-09T23:42:27+08:00 | [89a01965](https://github.com/LiLink-Campus/LiLink/commit/89a0196587291c5f71e0876d5ea7b36ab3ea887a) | fix(web): preserve next redirect across register and login links (#29) |
| 2026-05-09T23:44:00+08:00 | [083c21a3](https://github.com/LiLink-Campus/LiLink/commit/083c21a3b959ec61a7486885bffaeaab69458fce) | [AI][RISK] Fix throttle client IP trust when API is directly reachable (#30) |
| 2026-05-10T00:09:41+08:00 | [14f29d91](https://github.com/LiLink-Campus/LiLink/commit/14f29d9137e6099bb1851765680e47802a714e0a) | Stop logging admin bootstrap email to stdout (#31) |
| 2026-05-10T06:18:28+08:00 | [018e4b21](https://github.com/LiLink-Campus/LiLink/commit/018e4b21f9d697efb2d9ea5dd8c44d6a04765e7a) | fix(web): null-safe questionnaire attention array access |
| 2026-05-10T06:18:43+08:00 | [e8b56afc](https://github.com/LiLink-Campus/LiLink/commit/e8b56afc02ff80374df81b5b9521e9dcb7b93fe8) | fix(web): omit aria-controls when schools panel is collapsed |
| 2026-05-10T06:18:58+08:00 | [8ecf556c](https://github.com/LiLink-Campus/LiLink/commit/8ecf556c15cf88dce5697942fdfbb384449b6b31) | fix(api): verify dummy hash for inactive admin logins |
| 2026-05-10T06:19:14+08:00 | [d9ead24d](https://github.com/LiLink-Campus/LiLink/commit/d9ead24d505d76361816f62ccbc134899d0994d7) | fix(web): sync match dashboard state from server props |
| 2026-05-10T06:19:29+08:00 | [36dede00](https://github.com/LiLink-Campus/LiLink/commit/36dede007cb81a6bb60ddfc80ad0d5300c5b79bb) | test(shared): cover school exclusion allowlist and height bounds |
| 2026-05-10T06:21:23+08:00 | [641152d2](https://github.com/LiLink-Campus/LiLink/commit/641152d2df26b8b8233fa399b0ee889afdea2ee0) | fix(web): honor safe next redirect for authenticated users |
| 2026-05-10T06:31:38+08:00 | [597d209d](https://github.com/LiLink-Campus/LiLink/commit/597d209ddade6f07d21bf8a21e709bd1d0d49e99) | chore: remove cursor automation policy |
| 2026-05-15T01:24:12+08:00 | [9815e6f2](https://github.com/LiLink-Campus/LiLink/commit/9815e6f2187ff63c5461f87cbcc19b69f3d52ca4) | Fix CVE-2026-44578 by updating Next.js (#41) |
| 2026-05-16T15:57:31+08:00 | [de8e18e4](https://github.com/LiLink-Campus/LiLink/commit/de8e18e4e381829f7940f21165b846048d11da59) | chore(web): disable Vercel auto-deploy on main |
| 2026-05-16T17:08:00+08:00 | [0c8c24f9](https://github.com/LiLink-Campus/LiLink/commit/0c8c24f9ed50a5530cb2ce1ec90f2b449f45884d) | docs: add meetup contract design |
| 2026-05-16T17:08:00+08:00 | [4922d366](https://github.com/LiLink-Campus/LiLink/commit/4922d366cf3dc63d3f4d93334b9e81fec0c93a18) | feat: icebreak |
| 2026-05-16T17:08:00+08:00 | [aef10158](https://github.com/LiLink-Campus/LiLink/commit/aef10158c5ed32f9cc4d9ee7414db74d1b00ca6f) | feat(web): improve meetup arrangement flow |
| 2026-05-16T17:08:00+08:00 | [caaa7ad1](https://github.com/LiLink-Campus/LiLink/commit/caaa7ad1dc00ab162568d9b2575d83f360371857) | feat(meetup): add campus location options |
| 2026-05-16T17:08:00+08:00 | [3369b489](https://github.com/LiLink-Campus/LiLink/commit/3369b4897d2d71054bd8cd53de6cdfc2196aab51) | fix(api): show canceled meetup dashboard task |
| 2026-05-16T17:08:00+08:00 | [277790a2](https://github.com/LiLink-Campus/LiLink/commit/277790a25b4aa3a836e23e94ab47a189775f70a9) | fix(web): center meetup confirm dialog |
| 2026-05-16T17:08:00+08:00 | [87030313](https://github.com/LiLink-Campus/LiLink/commit/8703031313dcc710c56d5a59aa25d73830e5a73e) | chore(ci): fix lint |
| 2026-05-16T17:08:00+08:00 | [c6be93b4](https://github.com/LiLink-Campus/LiLink/commit/c6be93b4028fdf1695687268ed51126eb56b3e93) | feat(api): add meetup reminder emails |
| 2026-05-16T22:52:05+08:00 | [1eda8f8d](https://github.com/LiLink-Campus/LiLink/commit/1eda8f8de81e5145e5739ac4b3daa75a6d8af293) | Adopt config-based lint hooks |
| 2026-05-17T02:53:16+08:00 | [8e29f82c](https://github.com/LiLink-Campus/LiLink/commit/8e29f82c4a1cbd595e982109251e1dfa9db3cfdd) | chore(ci): upgrade CI test database to postgres 17 |
| 2026-05-17T06:42:31+08:00 | [90dabee9](https://github.com/LiLink-Campus/LiLink/commit/90dabee92f8ff85b0a9402952a45c54e2c2e3459) | Merge pull request #47 from nanzhi84/codex/contact-channel-preferences |
| 2026-05-17T15:30:21+08:00 | [5872dd41](https://github.com/LiLink-Campus/LiLink/commit/5872dd4154fd9de78a283eb5a883410b9de23772) | fix security review findings |
| 2026-05-17T15:30:21+08:00 | [1a034b93](https://github.com/LiLink-Campus/LiLink/commit/1a034b93beb61025afa6145db3b09fa6c1a88ac6) | clear dependency audit advisories |
| 2026-05-17T22:49:16+08:00 | [15365ea9](https://github.com/LiLink-Campus/LiLink/commit/15365ea9ed28130567dbbf7219be1023cb208194) | fix account display name validation |
| 2026-05-17T22:49:16+08:00 | [aec42f7e](https://github.com/LiLink-Campus/LiLink/commit/aec42f7e75c92f08e6a6a6325804a3ff935ab985) | harden API input validation limits |
| 2026-05-17T22:49:16+08:00 | [7fe1a63f](https://github.com/LiLink-Campus/LiLink/commit/7fe1a63fc2f0c2d57c06a13bdc0dfce06136939a) | harden loadtest staging secrets |
| 2026-05-22T00:30:46+08:00 | [dca9539a](https://github.com/LiLink-Campus/LiLink/commit/dca9539a65976c515cf7038cd824fc35ada12ab0) | docs(web): add PWA adaptation design spec |
| 2026-05-22T00:30:46+08:00 | [810b8532](https://github.com/LiLink-Campus/LiLink/commit/810b8532f05c6a8fa7fb49f477853e81cc05bccd) | docs(web): add PWA adaptation implementation plan |
| 2026-05-22T00:30:46+08:00 | [6e41a08d](https://github.com/LiLink-Campus/LiLink/commit/6e41a08d4ad6b3b8ab61ba6a81606c806f194322) | feat(web): generate branded PWA icons |
| 2026-05-22T00:30:46+08:00 | [f73b88fd](https://github.com/LiLink-Campus/LiLink/commit/f73b88fd6384ea45ccf7f178756f9171722f1890) | feat(web): add PWA web app manifest |
| 2026-05-22T00:30:46+08:00 | [5f11a1ab](https://github.com/LiLink-Campus/LiLink/commit/5f11a1ab1f1441a3f882465e47b3d244586ffa43) | feat(web): add service worker and offline fallback page |
| 2026-05-22T00:30:46+08:00 | [4d90779f](https://github.com/LiLink-Campus/LiLink/commit/4d90779f0e51dc6fab38688dd822d63cbba79f0d) | feat(web): register service worker and add Apple web-app metadata |
| 2026-05-22T00:30:46+08:00 | [d9697d1f](https://github.com/LiLink-Campus/LiLink/commit/d9697d1f78ed978654830bcd635ae4d3f838d273) | feat(web): emit legacy apple-mobile-web-app-capable for iOS standalone |
| 2026-05-22T00:30:46+08:00 | [288043cc](https://github.com/LiLink-Campus/LiLink/commit/288043cc11ee953212df41b87555f8291d9726db) | fix(web): address Codex PWA review |
| 2026-05-22T00:30:46+08:00 | [e3309117](https://github.com/LiLink-Campus/LiLink/commit/e33091176080445d9c9ad9076721dc047cf9fa07) | fix(web): drop sparkle dot from PWA icons, keep clean Li wordmark |
| 2026-05-22T00:33:54+08:00 | [0600ecab](https://github.com/LiLink-Campus/LiLink/commit/0600ecab6bc498fb7d13c030e4e28a3d37afbcf1) | docs(invite-code): add invite code system design spec |
| 2026-05-22T00:33:54+08:00 | [df8071d1](https://github.com/LiLink-Campus/LiLink/commit/df8071d123cf3c3ec2b164d1ef662271dbccc771) | docs(invite-code): add implementation plan |
| 2026-05-22T00:33:54+08:00 | [24d72c29](https://github.com/LiLink-Campus/LiLink/commit/24d72c297737df5593a1829ec4feb22d55976944) | feat(invite-code): add InviteCode model and User referral link |
| 2026-05-22T00:33:54+08:00 | [b2277057](https://github.com/LiLink-Campus/LiLink/commit/b22770574bdccc6014b3fe55330bfa3bb4b28198) | feat(invite-code): add admin endpoints, service, and live-derived stats |
| 2026-05-22T00:33:54+08:00 | [a055d1bd](https://github.com/LiLink-Campus/LiLink/commit/a055d1bd213df65ca605b1d3ef0ccb7ca5d76ae6) | feat(auth): accept optional invite code at registration |
| 2026-05-22T00:33:54+08:00 | [9bef66ac](https://github.com/LiLink-Campus/LiLink/commit/9bef66ac98d4c0d1b0f26ca16f63b50fdd1215fd) | feat(web): admin invite codes page with per-code stats |
| 2026-05-22T00:33:54+08:00 | [c473b4e0](https://github.com/LiLink-Campus/LiLink/commit/c473b4e0f6ac143c7ce23a21812fa8fa330c8327) | feat(web): optional invite code field on register |
| 2026-05-22T00:33:54+08:00 | [35627e3e](https://github.com/LiLink-Campus/LiLink/commit/35627e3ef60db8c569d1c64746af8cc17d7544c3) | test(invite-code): satisfy lint in new specs |
| 2026-05-22T00:33:54+08:00 | [4afd9fcb](https://github.com/LiLink-Campus/LiLink/commit/4afd9fcb1d4933c8a3f307a430075091bbcf9c97) | test(invite-code): cover 非二元, invalid gender, and draft isolation in stats |
| 2026-05-22T00:33:54+08:00 | [6129eaf7](https://github.com/LiLink-Campus/LiLink/commit/6129eaf7037145d621104b1e4f632c20775147c2) | docs(invite-code): remove agent planning notes |
| 2026-05-22T01:52:49+08:00 | [3d15391f](https://github.com/LiLink-Campus/LiLink/commit/3d15391f151e9368b556cab16b22e3bde74a6ced) | feat(matching): estimate match odds when excluding partner schools/genders |
| 2026-05-22T01:52:49+08:00 | [f66c57b2](https://github.com/LiLink-Campus/LiLink/commit/f66c57b243d5c4bd7f6d33069e1987f0d7d155c8) | fix(matching): assert findMany args via toHaveBeenCalledWith to satisfy lint |
| 2026-05-22T01:52:49+08:00 | [62606c74](https://github.com/LiLink-Campus/LiLink/commit/62606c742bf3b3d4654e691e01afc4aad1ced3cb) | fix(matching): precompute match estimate pools |
| 2026-05-22T19:28:48+08:00 | [5aa1bae4](https://github.com/LiLink-Campus/LiLink/commit/5aa1bae491873bc32a74196c6bab75c11cee19b0) | 首页待办清单重设计 + 问卷诚实进度（含匹配/见面/agent 基建） (#53) |
| 2026-05-24T19:46:10+08:00 | [3869706b](https://github.com/LiLink-Campus/LiLink/commit/3869706b08147c3d79fab3f1a30edff8efe4d67e) | Merge pull request #54 from nanzhi84/feat/merchant-system |
| 2026-05-24T20:56:34+08:00 | [81a67db7](https://github.com/LiLink-Campus/LiLink/commit/81a67db76227025fe4d9f894d9ac7f3d9739b8a6) | chore: trigger Vercel deployment |
| 2026-05-24T21:28:02+08:00 | [e7cbdc5f](https://github.com/LiLink-Campus/LiLink/commit/e7cbdc5fdbb2b44940eb5847b4a89f45eaf86d2c) | fix(web): load admin school lookup within API pageSize limit |
| 2026-05-25T13:23:48+08:00 | [f7dc5c16](https://github.com/LiLink-Campus/LiLink/commit/f7dc5c16865f57fec044caa672ed822cde76a36f) | fix(web): improve mobile dashboard and coupon card layouts |
| 2026-05-25T13:33:32+08:00 | [f9952cb9](https://github.com/LiLink-Campus/LiLink/commit/f9952cb931a9c2875106230b823dadf4d1d9f390) | fix(web): polish match waiting strip layout and styling |
| 2026-05-25T13:58:39+08:00 | [f1d863ca](https://github.com/LiLink-Campus/LiLink/commit/f1d863ca2feefd5e9972dfd41e930ec0a33f61f6) | Merge pull request #55 from nanzhi84/feat/new-user-first-cycle-boost |
| 2026-05-25T17:40:37+08:00 | [7958020b](https://github.com/LiLink-Campus/LiLink/commit/7958020bb947cf186b0d6b4b6d8bba5c0b7c875d) | Merge pull request #57 from nanzhi84/feat/admin-analytics-dashboard |
| 2026-05-25T17:46:04+08:00 | [5e6a9234](https://github.com/LiLink-Campus/LiLink/commit/5e6a9234a8790a4638fe74f6fe0743373f7b6881) | Merge pull request #56 from nanzhi84/perf/promo-coupons-and-qr |
| 2026-05-25T22:14:26+08:00 | [81ebcb23](https://github.com/LiLink-Campus/LiLink/commit/81ebcb233919b5b8cd84b8bbf92665cef6fab514) | refactor: remove AI-slop duplication and dead code across API and web |
| 2026-05-25T22:14:26+08:00 | [3f3ca6ec](https://github.com/LiLink-Campus/LiLink/commit/3f3ca6ec540f21050773a74b68406a5bd01b5981) | refactor(web): extract shared AdminPagination component |
| 2026-05-25T22:14:26+08:00 | [4be22a46](https://github.com/LiLink-Campus/LiLink/commit/4be22a46a409d9ea5212ed6019670d7d9d3b7f5d) | test(coupon): restore ISSUED-status contract assertions |
| 2026-05-26T00:27:30+08:00 | [32b23f46](https://github.com/LiLink-Campus/LiLink/commit/32b23f46d87c29459e9c4934c2ede70f3aee22ab) | refactor(web): improve admin analytics match leaderboard layout |
| 2026-05-26T16:23:06+08:00 | [9db7a832](https://github.com/LiLink-Campus/LiLink/commit/9db7a832929792db49a511b76838a0b5a3f24724) | chore(docs): update 运维笔记 content |
| 2026-05-26T19:16:30+08:00 | [e6fed23e](https://github.com/LiLink-Campus/LiLink/commit/e6fed23e8489c8aa1fda7ccc7095557d98b1aafa) | perf: address scaling hotspots across api and web |
| 2026-05-26T21:56:32+08:00 | [5edc2dcd](https://github.com/LiLink-Campus/LiLink/commit/5edc2dcd65e16a8716df2bb3a797a0fd01b7cf50) | fix(web): prioritize last-round unmatched state on match page |
| 2026-05-26T23:15:16+08:00 | [682f9d17](https://github.com/LiLink-Campus/LiLink/commit/682f9d17f493c7b34d7b527da77fe3def44b1ee7) | fix(api): resolve admin analytics SQL GROUP BY failure on PostgreSQL |
| 2026-05-27T20:04:35+08:00 | [36edfdc1](https://github.com/LiLink-Campus/LiLink/commit/36edfdc147290c3b04ea4757b80579cfe6154c5f) | feat(dashboard): add coupon read agenda (#62) |
| 2026-05-27T20:11:47+08:00 | [2ff98684](https://github.com/LiLink-Campus/LiLink/commit/2ff98684dbf548bdadb6415eb9c89fedcff3a20c) | chore: empty commit |
| 2026-05-27T20:31:35+08:00 | [37e5a42f](https://github.com/LiLink-Campus/LiLink/commit/37e5a42f9c53d320da940d460b411d51b55ae776) | fix(api): remove outdated Shanghai meetup location candidates |
| 2026-05-28T14:52:30+08:00 | [7d4e9180](https://github.com/LiLink-Campus/LiLink/commit/7d4e9180a31e1d4321a0932b10e795a0f54ed9ad) | feat: storybook (#63) |
| 2026-05-28T14:52:37+08:00 | [05c44385](https://github.com/LiLink-Campus/LiLink/commit/05c44385244c0c21169503dfebbfdc93efcb5de1) | chore: trigger Vercel production deploy |
| 2026-05-28T15:39:18+08:00 | [db27f441](https://github.com/LiLink-Campus/LiLink/commit/db27f441f01cbc66eab361d6378abe8e9733adaa) | fix(web): exclude Storybook from production typecheck |
| 2026-05-28T16:47:19+08:00 | [b6e40297](https://github.com/LiLink-Campus/LiLink/commit/b6e402975382c7c4bab3125dc3ecd510fd7f2248) | fix(web): split production typecheck tsconfig |
| 2026-05-30T03:06:46+08:00 | [8beb70d5](https://github.com/LiLink-Campus/LiLink/commit/8beb70d55a91ee75d406ae46cb2a15fca3e2e119) | Merge pull request #64 from nanzhi84/chore/bump-deps |
| 2026-05-31T01:09:27+08:00 | [bdb09154](https://github.com/LiLink-Campus/LiLink/commit/bdb09154e0751223bd52da8a4c020154b43dcf67) | Merge pull request #66 from nanzhi84/feat/analytics |
| 2026-05-31T15:41:33+08:00 | [c79a6a67](https://github.com/LiLink-Campus/LiLink/commit/c79a6a67f493a48821d9c05dabc3fb51e032c0ee) | chore: trigger Vercel production deploy |

## 2026-06

| Git 提交时间 | 提交 | 原始主题 |
| --- | --- | --- |
| 2026-06-01T02:50:22+08:00 | [622a9db5](https://github.com/LiLink-Campus/LiLink/commit/622a9db571e5fd9b09744f18cd67a8458ea8209c) | fix(participation): recheck questionnaire before sticky OPTED_IN carry-over (#68) |
| 2026-06-01T17:38:06+08:00 | [11d4478f](https://github.com/LiLink-Campus/LiLink/commit/11d4478f54dfa11c409510c9f195f311cf9288e9) | Merge pull request #69 from nanzhi84/feat/analytics |
| 2026-06-01T18:26:48+08:00 | [a89e0383](https://github.com/LiLink-Campus/LiLink/commit/a89e0383e66db476647014c8da2b0b4efea7a98c) | fix(admin-analytics): hide suspended users and show top 10 in match leaderboard (#70) |
| 2026-06-01T21:39:00+08:00 | [575a2823](https://github.com/LiLink-Campus/LiLink/commit/575a28234f6ccabfa5b284ee487d1e40ee88cf3e) | feat: 把 devlog 更新集成到 LiLink 公开侧 (#71) |
| 2026-06-01T21:48:40+08:00 | [51262f8d](https://github.com/LiLink-Campus/LiLink/commit/51262f8d1cd459289083e31c42523db25a0a987b) | Revert "feat: 把 devlog 更新集成到 LiLink 公开侧 (#71)" (#72) |
| 2026-06-02T15:47:40+08:00 | [0d8792d3](https://github.com/LiLink-Campus/LiLink/commit/0d8792d396e231d29d63947e464b0a5f7584cc60) | feat: 把 devlog 更新集成到 LiLink 公开侧 (#73) |
| 2026-06-02T16:24:22+08:00 | [a1cfc309](https://github.com/LiLink-Campus/LiLink/commit/a1cfc3093ab0b47b5aabea6ae4120126f928460f) | fix(web): 统一首页 section 纵向间距 |
| 2026-06-02T16:30:48+08:00 | [60636b99](https://github.com/LiLink-Campus/LiLink/commit/60636b9986464f71230ba8db6205b8069a37fb5c) | fix(web): 首页更新卡片 NEW 标签随已读状态隐藏 |
| 2026-06-02T16:53:59+08:00 | [17e1e8ac](https://github.com/LiLink-Campus/LiLink/commit/17e1e8acbbb96e54b404039e870c3d9fb07d1234) | Merge pull request #74 from nanzhi84/feat/setup-sentry |
| 2026-06-02T17:06:54+08:00 | [8cb10fdf](https://github.com/LiLink-Campus/LiLink/commit/8cb10fdfcf653debf6c55eb0acc948ba4b421576) | chore: trigger Vercel redeploy |
| 2026-06-03T01:37:11+08:00 | [371e9872](https://github.com/LiLink-Campus/LiLink/commit/371e987215278408eb24434bd9318a2ab51b2aa3) | Merge pull request #77 from nanzhi84/codex/split-production-compose |
| 2026-06-03T03:51:58+08:00 | [4e22c3c3](https://github.com/LiLink-Campus/LiLink/commit/4e22c3c3516eb3c45c23afb1f6ec13681b295316) | fix(web): mobile hero overflow & birth-date picker clipping (#76) (#78) |
| 2026-06-03T16:04:18+08:00 | [10330846](https://github.com/LiLink-Campus/LiLink/commit/103308464a638ba5417afc6c6f39d7d10fc24038) | fix(web): clamp narrow hero text to viewport on iOS Safari (#79) |
| 2026-06-03T16:52:51+08:00 | [42471f3d](https://github.com/LiLink-Campus/LiLink/commit/42471f3de3893c402a35d2aaf52faa07a11c2266) | fix(web): clamp hero copy with calc(100vw) on iOS Safari (#80) |
| 2026-06-03T17:08:26+08:00 | [2adfd3f8](https://github.com/LiLink-Campus/LiLink/commit/2adfd3f8ea7e6b59a0b1857d93499b87ffc56abc) | fix(web): make What's new grid responsive like How it works (#81) |
| 2026-06-03T17:20:37+08:00 | [a680617c](https://github.com/LiLink-Campus/LiLink/commit/a680617c3ecf01ce4b3a0b364ed9f46154bb8490) | chore(web): drop dead --recent-count var and media query from What's new (#82) |
| 2026-06-04T19:55:51+08:00 | [64c768a8](https://github.com/LiLink-Campus/LiLink/commit/64c768a8460dd0a26d504b8244a50d5d6d690e03) | fix(web): freeze render-time clock to stop /dashboard hydration mismatch (#83) |
| 2026-06-05T01:27:17+08:00 | [3605330e](https://github.com/LiLink-Campus/LiLink/commit/3605330e1028bed323e8cae1b0879839db0911f1) | fix(web): stop /about hero and cards overflowing on iOS Safari |
| 2026-06-05T03:05:01+08:00 | [0ff61edb](https://github.com/LiLink-Campus/LiLink/commit/0ff61edb05c6b9e117385391eb6fcd8d4ce15045) | refactor: remove recruiter invite-code system, keep personal referral codes (#84) |
| 2026-06-09T01:48:56+08:00 | [f162f36c](https://github.com/LiLink-Campus/LiLink/commit/f162f36cddff35eea7b4ff10867a1e815f62d056) | feat(auth): 实现非教育邮箱注册、次数风控及管理后台审计功能 |
| 2026-06-09T02:11:11+08:00 | [82703922](https://github.com/LiLink-Campus/LiLink/commit/8270392251040b92c59723d5d3894a50298093a2) | chore: trigger Vercel deployment |
| 2026-06-09T16:21:11+08:00 | [7e1cf2b8](https://github.com/LiLink-Campus/LiLink/commit/7e1cf2b8859f3678e79efadde134523b000cb3a6) | fix(web): stabilize admin overview hydration |
| 2026-06-09T16:32:34+08:00 | [0fa22468](https://github.com/LiLink-Campus/LiLink/commit/0fa22468af9bb6198b7374fb99ab8f22560d2209) | Filter injected Sentry addEventListener error |
| 2026-06-09T16:34:46+08:00 | [3097f6e8](https://github.com/LiLink-Campus/LiLink/commit/3097f6e8116f241f73204368cb07963b84798363) | Fix unusable invite referral flow |
| 2026-06-09T17:39:01+08:00 | [1f31b177](https://github.com/LiLink-Campus/LiLink/commit/1f31b177ef6117a87d8386dcd984c5315143c387) | [codex] remove unused locale code and dead exports (#86) |
| 2026-06-12T21:37:07+08:00 | [393ba841](https://github.com/LiLink-Campus/LiLink/commit/393ba84116827801e3fe031bee2e876ba114d314) | Merge pull request #87 from nanzhi84/feat/meetup-feedback |
| 2026-06-12T21:37:20+08:00 | [28a342b7](https://github.com/LiLink-Campus/LiLink/commit/28a342b7e4c1a2fd97fb6ac9ea6c9e3d6ec704ef) | chore: trigger Vercel deployment |
| 2026-06-21T01:12:03+08:00 | [36548bbd](https://github.com/LiLink-Campus/LiLink/commit/36548bbd98ed772e47e0396b0362a5a725bd7af2) | feat(web): 主页新增学期末公告横幅(6/23 最后一次匹配) (#91) |
| 2026-06-21T01:29:02+08:00 | [e2ac17f8](https://github.com/LiLink-Campus/LiLink/commit/e2ac17f81c4b89fd708a48f3155e8950eb9d225d) | fix(api): exclude test accounts from the live matching pool (#93) |
| 2026-06-21T01:57:45+08:00 | [068e213e](https://github.com/LiLink-Campus/LiLink/commit/068e213ec947ca7e451efc015eae49fb2d0a8951) | fix(api): let Neon scale to zero by gating background cron polling (#95) |
| 2026-06-21T02:21:39+08:00 | [5fefba7c](https://github.com/LiLink-Campus/LiLink/commit/5fefba7cf5d1b0dd6c45402d017e092131812f34) | fix(web): show counterpart rejection note in meetup re-propose state (#90) |
| 2026-06-21T02:46:22+08:00 | [f6bbec75](https://github.com/LiLink-Campus/LiLink/commit/f6bbec751d484c83efc96444f31ec75233ff2525) | [codex] add Storybook visual evidence workflow (#89) |
| 2026-06-21T10:01:44-07:00 | [1f570fa9](https://github.com/LiLink-Campus/LiLink/commit/1f570fa94291b891f837f093ca9b030fd8712e3c) | fix(api): raise public landing/schools cache TTL to 10min for Neon scale-to-zero (#96) |
| 2026-06-21T10:38:39-07:00 | [28e4758a](https://github.com/LiLink-Campus/LiLink/commit/28e4758af8f546d3ee91f5f414a07e1657f18c11) | fix(api): raise public landing/schools cache TTL to 30min for more Neon headroom (#97) |

## 2026-07

| Git 提交时间 | 提交 | 原始主题 |
| --- | --- | --- |
| 2026-07-11T10:27:44-07:00 | [c83749b5](https://github.com/LiLink-Campus/LiLink/commit/c83749b560b9884742f345e71a73e5fa86fb7771) | fix(api): align questionnaire/current cache with landing/schools TTL (30min + invalidation) (#99) |

## 2026-09

| Git 提交时间 | 提交 | 原始主题 |
| --- | --- | --- |
| 2026-09-08T02:50:58+08:00 | [29258abb](https://github.com/LiLink-Campus/LiLink/commit/29258abbda6df8ca8f255b11a09e35c13cbca2f0) | chore: standardize agent guidance and migrate to Node 24 LTS |
| 2026-09-08T03:03:53+08:00 | [849271a2](https://github.com/LiLink-Campus/LiLink/commit/849271a273e66777b2be52ba5e9a6190d31f7f85) | docs: add project README and development guide |
| 2026-09-08T10:18:08+08:00 | [2ffba039](https://github.com/LiLink-Campus/LiLink/commit/2ffba039e6db3272b3249abb4e0c76e2c858355a) | docs: recover dated archives and keep operations notes private |
| 2026-09-08T10:27:10+08:00 | [facb5a63](https://github.com/LiLink-Campus/LiLink/commit/facb5a63663a66654b565562907e727afe5da7ba) | docs: use archive README as the documentation index |
| 2026-09-08T10:49:25+08:00 | [c6157c78](https://github.com/LiLink-Campus/LiLink/commit/c6157c78198976eb3ce5cb3fe762f62991ace742) | security: sanitize operations docs and remove shared test credentials |
| 2026-09-08T10:52:34+08:00 | [3da4b13b](https://github.com/LiLink-Campus/LiLink/commit/3da4b13b7012f17b072a49104a36f49a1f828c0e) | docs: update archive provenance after history sanitization |
| 2026-09-11T19:30:35+08:00 | [3fa97a7a](https://github.com/LiLink-Campus/LiLink/commit/3fa97a7a5ae8e0be9df9bc9866d8e7a41a1cab60) | chore: checkpoint autumn design work and streamline registration |
| 2026-09-11T19:34:33+08:00 | [23765a33](https://github.com/LiLink-Campus/LiLink/commit/23765a33ff31b462b53c64e52d5813ec16b186bf) | test: align registration throttle payload with minimal signup |
| 2026-09-20T16:06:21+08:00 | [67b1ce64](https://github.com/LiLink-Campus/LiLink/commit/67b1ce644e4b161a18c0f47e022a1636a8dfbff1) | feat: ship autumn matching experience with VIP and explicit opt-in |
| 2026-09-20T16:11:27+08:00 | [3d628a7a](https://github.com/LiLink-Campus/LiLink/commit/3d628a7a5d8fdb07076346565d3423fdb0eedb1b) | test: clear pointer hover before visual baseline checks |
| 2026-09-20T16:28:41+08:00 | [eea1d33e](https://github.com/LiLink-Campus/LiLink/commit/eea1d33e4c37da04f00a46f00e3b483a9d3c5f6b) | fix: patch vulnerable dependencies and stabilize release checks |
| 2026-09-20T16:40:13+08:00 | [ef3e94f1](https://github.com/LiLink-Campus/LiLink/commit/ef3e94f15924e6e3100747f311aadfd4779606ac) | fix: consistently focus VIP dialog close action across browsers |
| 2026-09-20T17:00:49+08:00 | [d05eb891](https://github.com/LiLink-Campus/LiLink/commit/d05eb891606d16d1902ffd79cf09223a73992836) | test: capture intentional loading states without waiting for network idle |
| 2026-09-21T13:59:54+08:00 | [d3e01280](https://github.com/LiLink-Campus/LiLink/commit/d3e01280676b20dbfbf26a1038db44f3db7777e4) | Merge pull request #101 from LiLink-Campus/codex/questionnaire-reset-release |
| 2026-09-21T14:11:35+08:00 | [b1b3f1a2](https://github.com/LiLink-Campus/LiLink/commit/b1b3f1a2b37ca14bf73100ea5ad7a584708103ea) | Merge pull request #102 from LiLink-Campus/codex/production-release-record |
| 2026-09-21T14:38:04+08:00 | [72bf9146](https://github.com/LiLink-Campus/LiLink/commit/72bf9146a4063c60c5f7c88413c79f8566c42ac3) | Merge pull request #103 from LiLink-Campus/codex/mail-brand-auth |
| 2026-09-21T15:09:10+08:00 | [db80533e](https://github.com/LiLink-Campus/LiLink/commit/db80533e6430a7a8713de164e6d8df5949d7d204) | Merge pull request #104 from LiLink-Campus/codex/public-statistics-and-schools |
| 2026-09-21T16:04:39+08:00 | [de1bdb05](https://github.com/LiLink-Campus/LiLink/commit/de1bdb05dda6676d6d6ac74e3d9d59cb6f6e2b7e) | Merge pull request #105 from LiLink-Campus/codex/frontend-performance |
| 2026-09-21T16:26:16+08:00 | [77b61115](https://github.com/LiLink-Campus/LiLink/commit/77b61115f5b7719819b200789c041128a142df9a) | Merge pull request #106 from LiLink-Campus/codex/dashboard-request-resilience |
| 2026-09-21T17:13:24+08:00 | [d7dbc992](https://github.com/LiLink-Campus/LiLink/commit/d7dbc992b6fead491d254798ee252bbf6f5f0c34) | Merge pull request #107 from LiLink-Campus/codex/community-stats-resilience |
| 2026-09-21T17:21:32+08:00 | [19530e0d](https://github.com/LiLink-Campus/LiLink/commit/19530e0d78ca3dfbd801a60c21f4b52ec95c0fce) | Merge pull request #108 from LiLink-Campus/codex/community-timer-regression |
| 2026-09-21T17:48:18+08:00 | [26de2822](https://github.com/LiLink-Campus/LiLink/commit/26de2822ef1eea959d45ea5e69ffdc1e24d5f4d7) | Merge pull request #109 from LiLink-Campus/codex/reuse-profile-basics |
| 2026-09-21T18:10:44+08:00 | [e52a0740](https://github.com/LiLink-Campus/LiLink/commit/e52a0740626088c20cacf2f5c74962de69ec3fea) | fix(web): keep public statistics refresh failures out of the UI (#110) |
| 2026-09-21T18:43:11+08:00 | [2bd3fbaa](https://github.com/LiLink-Campus/LiLink/commit/2bd3fbaa8c8584229966564292ec5cddc7bd0338) | fix(web): let mobile questionnaire content scroll naturally (#111) |
| 2026-09-21T21:03:02+08:00 | [342542b8](https://github.com/LiLink-Campus/LiLink/commit/342542b81c151d6256fcde74db76615404c52cfd) | fix(web): anchor questionnaire actions to viewport bottom (#112) |
| 2026-09-21T22:37:30+08:00 | [e07cd1f5](https://github.com/LiLink-Campus/LiLink/commit/e07cd1f513c3062e1082392456380c2368499054) | fix(web): show directional hints for scrollable questions (#113) |
| 2026-09-21T23:24:56+08:00 | [c9e959a4](https://github.com/LiLink-Campus/LiLink/commit/c9e959a4f24f925e9e148f9407827a588fb1166a) | fix(web): inset downward scroll hint inside question card (#114) |
| 2026-09-22T00:19:25+08:00 | [37e3af62](https://github.com/LiLink-Campus/LiLink/commit/37e3af62c5d035d6ea50a5bc7b28d4d784a907c0) | Merge pull request #115 from LiLink-Campus/codex/profile-save-and-loading |
| 2026-09-22T00:28:50+08:00 | [6b44937d](https://github.com/LiLink-Campus/LiLink/commit/6b44937d4a1c91c6dfcc857d1f1e677aaf58eef8) | Merge pull request #116 from LiLink-Campus/codex/dashboard-session-regression |
| 2026-09-22T00:46:16+08:00 | [6cc00586](https://github.com/LiLink-Campus/LiLink/commit/6cc00586d2513fc2eb9e6c972fe5a98252f9bb68) | Merge pull request #117 from LiLink-Campus/codex/server-api-transport |
| 2026-09-22T02:24:32+08:00 | [11d06a92](https://github.com/LiLink-Campus/LiLink/commit/11d06a9288cc981fc3bc0f28467d33f31af723d7) | Merge pull request #118 from LiLink-Campus/codex/pwa-install-stability |
| 2026-09-22T02:28:05+08:00 | [dd0d2bfa](https://github.com/LiLink-Campus/LiLink/commit/dd0d2bfa1b08451715019f710d0f9cf37fbab7f3) | Merge pull request #119 from LiLink-Campus/codex/yoryon-intro-refresh |
| 2026-09-22T02:42:03+08:00 | [7dab16fb](https://github.com/LiLink-Campus/LiLink/commit/7dab16fbbe2492d6e50d96ae5e5d12f1451f285e) | Merge pull request #120 from LiLink-Campus/codex/form-hydration-readiness |
| 2026-09-22T02:46:17+08:00 | [5379738a](https://github.com/LiLink-Campus/LiLink/commit/5379738a664830033916e15394da4226fed04bc7) | Merge pull request #121 from LiLink-Campus/codex/profile-tabs-hydration-fix |
| 2026-09-22T03:01:29+08:00 | [92598f9e](https://github.com/LiLink-Campus/LiLink/commit/92598f9e3b1eb16ef95c85556de01a6a428d74a7) | Merge pull request #122 from LiLink-Campus/codex/register-baseline-without-announcement |
| 2026-09-22T10:50:05+08:00 | [176d86ee](https://github.com/LiLink-Campus/LiLink/commit/176d86ee9851136c36a156d013387ef5a5f4dae0) | Merge pull request #123 from LiLink-Campus/codex/pwa-manual-guide-copy |
| 2026-09-22T11:08:39+08:00 | [798d3566](https://github.com/LiLink-Campus/LiLink/commit/798d3566ab9e27027f49939c8a8be755f344b992) | Merge pull request #124 from LiLink-Campus/codex/one-to-one-desktop-flow |
| 2026-09-22T11:35:45+08:00 | [25ccab65](https://github.com/LiLink-Campus/LiLink/commit/25ccab65e3fa5d2850af8771d881832931a27afd) | Merge pull request #125 from LiLink-Campus/codex/lifestyle-concrete-preferences |
| 2026-09-22T11:46:52+08:00 | [3a09c419](https://github.com/LiLink-Campus/LiLink/commit/3a09c4196d48375e34980173db25dcb2b467666e) | Merge pull request #126 from LiLink-Campus/codex/lifestyle-preference-regression |
| 2026-09-22T17:57:10+08:00 | [3206544e](https://github.com/LiLink-Campus/LiLink/commit/3206544ec2cf5a6a6aec77300ef62e61e8afe177) | feat: refresh matching experience and account-linked registration |
| 2026-09-22T18:02:38+08:00 | [ee14547d](https://github.com/LiLink-Campus/LiLink/commit/ee14547dce5655a020abd656834053a49ac286ca) | test: wait for public page entrance animation |
| 2026-09-22T23:57:38+08:00 | [ab5029f9](https://github.com/LiLink-Campus/LiLink/commit/ab5029f9918d2d1e7567854c335f5ac4b55146be) | feat(vip): clarify activation outcomes and membership status |
| 2026-09-23T00:58:35+08:00 | [fb739794](https://github.com/LiLink-Campus/LiLink/commit/fb73979426bbefbfe67ecdcdc7ed33ae56e2aebd) | test(web): await streamed profile before choosing directory |
| 2026-09-23T00:58:35+08:00 | [d92e0e1f](https://github.com/LiLink-Campus/LiLink/commit/d92e0e1f9fb9fb50c2155d1e124541e4b618a18d) | fix(web): guard password reset input until hydration |
| 2026-09-23T10:11:12+08:00 | [4522fde0](https://github.com/LiLink-Campus/LiLink/commit/4522fde0308e480bb471eddd77b132388f9e3c88) | Merge pull request #128 from LiLink-Campus/codex/matching-priority |
| 2026-09-23T14:22:44+08:00 | [61960495](https://github.com/LiLink-Campus/LiLink/commit/61960495c583a90f64927778cd4dbf5175566ae2) | Merge pull request #129 from LiLink-Campus/codex/vip-priority-benefits |
| 2026-09-23T15:31:21+08:00 | [aa38d151](https://github.com/LiLink-Campus/LiLink/commit/aa38d151ae3d827d2e0cd54d3668cd3d182d94da) | Merge pull request #130 from LiLink-Campus/codex/weekly-cycle-scheduling |
| 2026-09-23T16:32:11+08:00 | [320c1e0e](https://github.com/LiLink-Campus/LiLink/commit/320c1e0e3b371d045068f57d3d4962574aa37d87) | Merge pull request #131 from LiLink-Campus/codex/cycle-display-analytics-fix |
| 2026-09-23T16:54:59+08:00 | [12464338](https://github.com/LiLink-Campus/LiLink/commit/1246433835d5b2c3dde138fec7afdd70d5a26ef7) | Merge pull request #132 from LiLink-Campus/codex/faq-pricing-copy |
| 2026-09-23T18:19:55+08:00 | [8c469591](https://github.com/LiLink-Campus/LiLink/commit/8c4695910ead6ea81385d96f930f1f301097697c) | Merge pull request #133 from LiLink-Campus/codex/profile-compact-preview |
| 2026-09-26T21:29:39+08:00 | [513ea100](https://github.com/LiLink-Campus/LiLink/commit/513ea1002b907d0f31f4827b3444265b5bec4e02) | refactor: 拆分资料页与账户职责，清理冗余测试及内部兼容层 (#134) |
| 2026-09-26T21:59:30+08:00 | [a229ecb8](https://github.com/LiLink-Campus/LiLink/commit/a229ecb802567ffad7c0432df9d724fa22f36510) | perf: 优化首屏加载、读取并发与资料导航一致性 (#135) |
| 2026-09-26T22:24:41+08:00 | [f6b2b200](https://github.com/LiLink-Campus/LiLink/commit/f6b2b2003dfd53d8899878c5cf898dd6ee16eebc) | test: cover dashboard bootstrap recovery in Storybook (#136) |
| 2026-09-27T00:47:47+08:00 | [a4f91a47](https://github.com/LiLink-Campus/LiLink/commit/a4f91a47cda9836e1d3f7c100d12fba12af4230c) | fix(api): keep coupon overview reads on one snapshot (#137) |

## 效力冲突的处理

- 早期见面、破冰和产品事件采集方案保留在归档；模块是否启用以当前 AppModule 与路由为准。
- 秋季设计文件中的撤回与探索保留为有日期的决策，当前账户与匹配行为按参考文档核验。
- 旧交接资料中的自动继承参与、工具链和生产统计只代表当时记录；当前每轮显式报名规则由匹配参考维护。
- 已实现功能的验收报告可以早于其提交时间；报告的本地、模拟、隔离数据库和生产范围分别保留。

源文件逐篇去向见 [迁移表](2026-10-01-document-migration.md)，未确认的产品意图见 [计划入口](../plans/README.md)。
