# 开发计划：编排循环（Claude Code 规划/审查 ↔ Codex 执行）

## 1. 背景与目标

**现状**：App 里「派发」= 把一段原始 prompt 直接丢给 Codex 跑完，然后人工看 diff 验收。

**目标**：派发一个**高层目标**后，自动走完整循环、Claude 与 Codex 持续交互、人只在旁边看（可随时介入），不需要人工逐步搬运/验收：

1. **Claude Code 规划**：把目标拆成若干**阶段**，每阶段给出 详细代码规划 / UI 规划 / 验收标准。
2. **逐阶段执行**：每个阶段交给 **Codex** 开发。
3. **Claude Code 审查**：阶段完成后，Claude 按该阶段验收标准审查 diff → 通过则进入下一阶段；不通过则把意见回灌给 Codex 修订（小循环），直到通过或上抛人工。
4. 如此循环直到所有阶段完成。

**一句话**：在现有引擎之上加一层「**编排器 Orchestrator**」，把 `规划(Claude) → 执行(Codex) → 审查(Claude) → 再执行` 做成自动状态机，App 实时展示并可介入。

---

## 2. 架构（在现有引擎之上加一层，不推倒重来）

```
                         ┌──────────────── Orchestrator（新增）────────────────┐
   GUI: 输入目标 ──────▶ │  Run = 目标 + Plan(阶段[]) + 循环状态机              │
   实时看/介入  ◀──────  │  plan → 每阶段{ execute → review → 修订小循环 } → done│
                         └───────┬───────────────┬───────────────┬────────────┘
                                 │ plan/review   │ execute       │ revise
                                 ▼               ▼               ▼
                         ┌──────────────┐  ┌──────────┐   （Codex resume 回灌意见）
                         │ Claude 后端   │  │ Codex     │
                         │ 规划 / 审查    │  │ 执行       │   ← 都复用现有 TaskStore：
                         │ (claude -p,    │  │ (codex     │      每个 plan/execute/review
                         │  只读, schema) │  │  exec)     │      都是一个 Task，挂在 Run/Phase 上
                         └──────────────┘  └──────────┘
```

- **新增后端：Claude 当规划/审查器**。用 `claude -p --output-format json --json-schema <schema>`（已核实可用），并用 `--disallowedTools Edit Write ...` 强制**只读**。规划/审查产出**结构化 JSON**（schema 强约束，和 Codex 的 `--output-schema` 同思路）。
- **新增编排层 Orchestrator / Run**：位于 `TaskStore` 之上。一个 Run 持有目标 + Plan(阶段数组) + 循环状态。每个步骤（规划/执行/审查/修订）仍是一个 **Task**（复用现有 TaskStore、事件流、diff、持久化）；编排器负责把它们串成自动循环。
- **保留**现有「快速单任务派发」模式，新增「编排 Run」模式并存。编排器放在 `core` 引擎里，App 与（将来）MCP 都能驱动。

### 角色 / 原语
| 角色 | 后端 | 沙箱 | 输入 → 输出 |
|---|---|---|---|
| Planner 规划 | Claude (`claude -p`) | read-only | 目标 + 仓库 → **Plan**（阶段[]，每阶段含代码规划/UI规划/验收标准） |
| Executor 执行 | Codex (`codex exec`) | workspace-write | 阶段规格 → diff |
| Reviewer 审查 | Claude (`claude -p`) | read-only | 阶段 + diff + 验收标准 → **Verdict**（通过/不通过 + 意见） |
| Reviser 修订 | Codex (`codex exec resume`) | workspace-write | 审查意见 → diff（小循环，至多 N 次） |

### 结构化 Schema（关键，决定 Claude 产出的形状）
- **PlanSchema**：`{ summary, phases: [{ id, title, goal, codePlan, uiPlan, acceptanceCriteria[], filesLikely[], dependsOn[] }] }`
- **VerdictSchema**：`{ pass: boolean, score, summary, findings: [{severity, file?, line?, note}], requiredChanges: [] }`

---

## 3. 大阶段（里程碑）+ 小阶段（详细任务）

### M1 — Claude 后端：规划/审查原语
> 让「给目标出结构化 Plan」「给 diff 出结构化 Verdict」这两个原语稳定可用。

- **M1.1 探针**：跑 `claude -p --output-format json --json-schema <file>` 抓真实输出包络（result 字段、usage、session_id、错误形态），录 fixture。确认 `--disallowedTools`/`--permission-mode` 能锁只读。
- **M1.2 `ClaudeRunner`**：包装 `claude -p`（spawn/stream/解析 json 结果），支持 model / add-dir / 只读(禁用 Edit,Write,...) / 超时 / 取消。复用现有 `CliExecutor` 模式或独立 runner；可作为一个新「executor 后端」注册（name=`claude`）。
- **M1.3 `planner`**：定义 `PlanSchema` + 规划 system/prompt；`plan(goal, repoDir, opts) → Plan`。JSON 校验 + 失败重试/修复。
- **M1.4 `reviewer`**：定义 `VerdictSchema` + 审查 prompt；`review(phase, diff, criteria, repoDir) → Verdict`。
- **M1.5 单测**：schema 解析、argv 构造、prompt 构造、坏 JSON 修复；fixture 驱动。
- **验收**：给定一个目标，`plan()` 返回合法多阶段 Plan；给定 diff+标准，`review()` 返回 Verdict。对真实 `claude -p` 无头验证一次。

### M2 — 编排引擎：循环状态机（core）
> 把规划/执行/审查/修订串成自动、可暂停、可恢复的状态机。

- **M2.1 数据模型**：`Run` / `Phase` / `Step`（plan|execute|review|revise）/ 迭代计数；持久化到 `.agentconnector/runs/<id>.json`（复用 persistence 模式）。
- **M2.2 Orchestrator 状态机**：`planning → executing(phase i) → reviewing(phase i) → (pass→下一阶段 | fail→revise) → … → done/failed/paused`。事件驱动、非阻塞、可恢复。
- **M2.3 接 TaskStore**：每个 Step = 一个 Task（plan/review 用 claude 后端、execute/revise 用 codex），Task 关联 `runId`/`phaseId`/`step`。
- **M2.4 修订小循环**：审查不通过 → 用 `codex exec resume` 回灌 `requiredChanges` 重做；`maxReviseIters`（默认 3）耗尽 → 标记该阶段 `needs_human` 并暂停。
- **M2.5 闸门与控制**：闸门模式（`auto` 默认 / 规划后人工确认 / 每阶段后人工确认，可配）；控制：pause/resume/abort/approvePlan/editPlan/approvePhase/intervene(注入指令)。
- **M2.6 事件**：`run:update` / `phase:update` / `step:update` / `step:activity` 推给前端（扩展现有 `StoreEvent`）。
- **M2.7 编排器测试**：用 mock planner/executor/reviewer 跑：2 阶段计划、全通过路径、某阶段审查失败→修订→通过、修订耗尽→needs_human、闸门 auto/manual、持久化与恢复。
- **验收**：mock 下，一个 Run 能 规划→逐阶段执行→审查→推进；失败阶段走修订小循环；闸门生效；可持久化/恢复。

### M3 — IPC + GUI：Run 视图
> 让人能发起目标、看到计划、实时看循环、必要时介入。

- **M3.1 IPC**：`run_start(goal, opts)` / `run_get` / `run_list` / `run_approvePlan` / `run_editPlan` / `run_approvePhase` / `run_pause|resume|abort` / `run_intervene` + 实时事件。
- **M3.2 GUI Run 视图**：目标输入 → **Plan 视图**（阶段时间线：代码规划 / UI 规划 / 验收标准，**可编辑**）→ **实时阶段进度**（当前在 规划/执行/审查 哪一步、第几次修订、哪个 agent 在跑）→ 每阶段 **diff + 审查结论/意见** → 控制按钮。
- **M3.3 执行前可编辑计划**（人可改阶段/标准/增删阶段，再开跑）。
- **M3.4 复用** diff 查看器（逐阶段）；渲染 Verdict 的 findings/requiredChanges。
- **M3.5 设置**：闸门模式、最大修订次数、各角色模型（planner/reviewer/executor）、分支/隔离策略。
- **M3.6 双模式并存**：保留「快速单任务」；新增「编排 Run」。
- **验收**：App 里输入目标 → 看到计划 → 阶段自动推进（Claude 规划/审查、Codex 执行）→ 看到每阶段 diff 与审查结论 → 可暂停/介入；**无强制人工步骤**。

### M4 — 硬化与打磨
- **M4.1 失败 UX**：计划 JSON 解析失败 / 执行器报错 / 修订耗尽 → 清晰升级与提示（不静默卡死）。
- **M4.2 成本/耗时**：每步 token/时长 + Run 汇总。
- **M4.3 跨重启恢复**：进行中的 Run 能被 reconcile/resume（凭持久化 + codex/claude session）。
- **M4.4 transcript/日志**：每步留痕，可导出 Run 报告。
- **M4.5 e2e**：真实小目标端到端跑通（Claude 规划 → Codex 执行 → Claude 审查 → 循环 → 完成）。
- **验收**：一个真实多阶段目标，人只看不动，自动完成；对失败鲁棒。

---

## 4. 关键设计决策（建议值，待你确认/微调）

1. **Claude 后端方式**：`claude -p --output-format json --json-schema`（只读靠 `--disallowedTools Edit Write NotebookEdit`）。✅ 已核实可用。备选：Claude Agent SDK（更强但更重）。
2. **工作区策略**：整个 Run 在项目内、**专用分支** `agentconnector/run-<id>` 上累积推进；审查看「本阶段相对上阶段的 diff」+ 验收标准；Run 结束可选 squash/合并。备选：每 Run 一个 worktree。
3. **闸门默认 = `auto`**（Claude 审查即闸门，自动续跑）；人可随时暂停/介入；可选「规划后」「每阶段后」人工确认。— 契合你「不要直接派发等结果再人工验收」的诉求。
4. **修订上限**默认 3，耗尽 → 该阶段 `needs_human` 并暂停等你。
5. **模型**：planner/reviewer 用较强 Claude（opus/sonnet 可配），executor 用 codex 默认；都可在设置里改。
6. **上下文传递**：阶段 prompt 给 Codex 时带上该阶段 codePlan/uiPlan/acceptanceCriteria + 必要的前序产出；审查给 Claude 时带 验收标准 + 本阶段 diff。结构化产物都存在 Run 里，避免跨 agent 漂移。

---

## 5. 复用 vs 新增

- **复用**：`TaskStore`（每步=一个 Task）、executor 抽象 + `CliExecutor`、事件流、diff（git + 快照）、持久化模式、GUI 外壳 + diff 查看器。
- **新增**：Claude 规划/审查后端、`Orchestrator/Run` 层、Plan/Verdict schema、Run 的 IPC、Run GUI 视图。

## 6. 风险

- Claude 与 Codex 都需已登录（无头鉴权）。
- 长 Run 的 token/时长成本 → 需可视化 + 上限。
- Plan/Verdict 的 JSON 可靠性 → schema 强约束 + 解析修复。
- 跨 agent 上下文漂移 → 结构化产物落 Run。
- 修订用 `codex exec resume` 续跑（复用 sessionId）。

---

## 7. 落地顺序
M1（Claude 原语）→ M2（编排引擎 + mock 测试）→ M3（IPC + GUI）→ M4（硬化）。每个里程碑结束都能 typecheck/test 绿、且可演示。
