---
name: mem-x
description: 自进化 AI 记忆系统。在每条用户消息时使用，用于回忆上下文、捕获洞察、演化行为。提供 `mem-x recall` 即时上下文引导和 `mem-x search` 跨层精准检索（情景、语义、规则、短期记忆）。触发条件：用户提及 mem-x、记忆、记住、回忆、演化、复盘、知识管理；开始任何对话时；用户教授知识、纠正错误、分配任务或表达偏好时。
---

# mem-x

## Agent 身份

设置唯一的桶名称以实现数据隔离。后续所有命令自动继承此作用域。

```bash
export MEM_X_BUCKET=<agent-name>
# 或前置参数: mem-x --bucket <name> <command>
```

使用稳定的小写标识符，通常是项目名或固定值如 `claude-code`。一旦选定，同一 Agent 的所有会话都必须使用相同名称，否则记忆无法跨会话积累。

---

## 核心循环

每次对话**必须**依次执行以下四条规则。

### 规则 1 — 回忆（首条消息）

收到用户**第一条消息**时，响应前立即引导上下文：

```bash
mem-x recall
```

此命令一次性输出所有激活规则、待办任务和近期记忆。读取并内化全部内容。

然后根据用户消息进行主题搜索：

```bash
mem-x search "<用户首条消息的关键词>"
```

**立即应用所有召回的规则。** 记下待办任务。将记忆作为响应上下文。

对话中如涉及新话题，随时追加搜索：

```bash
mem-x search "<新话题>"
```

### 规则 2 — 开启会话（首条消息）

开启一个会话来追踪本次对话：

```bash
mem-x session start
# → Session started: <session-id>
```

保存 session-id，后续所有捕获操作都需要使用它。

### 规则 3 — 捕获（每条消息）

**每条用户消息**都需要评估：用户是否说了值得记住的内容？

| 信号 | 操作 |
|------|------|
| 用户教授知识 | `mem-x session add <id> --content "..." --tags "fact"` |
| 用户表达偏好 | `mem-x session add <id> --content "..." --tags "preference"` |
| 用户纠正错误 | `mem-x session add <id> --content "..." --tags "correction"` |
| 任务完成有结果 | `mem-x session add <id> --content "..." --tags "outcome"` |
| 用户分配任务 | `mem-x task add --title "..." --priority <p>` |
| 用户说"永远/绝不" | `mem-x memory add rules --trigger "..." --constraint "..." --reason "..."` |
| recall 输出中可见的、3+ 次会话确认的模式 | `mem-x memory add semantic --topic "..." --content "..." --tags "..."` |

**写入前必须检查冲突：**

```bash
mem-x search "<新信息摘要>" --layer <目标层> --limit 5
```

- 重复 → 跳过
- 信息更新 → 写入新条目，标注替代旧条目
- 矛盾 → 写入新条目并附纠正上下文

**跳过不记录的**：打招呼、闲聊、临时调试步骤、已经记录过的信息。

### 规则 4 — 提交（对话结束）

对话明显收尾时执行——用户说再见、任务已完成、话题自然关闭。不确定时也可直接提交，多次运行是安全的。

```bash
mem-x session end <session-id>
mem-x memory purge
```

所有会话条目自动转入短期记忆（TTL 7 轮），递增轮次计数器，并清理过期条目。

---

## 进化工作流

### 触发条件

| 条件 | 操作 |
|------|------|
| 用户说"evolve"/"review"/"reflect"/"复盘" | 执行完整 8 步流程 |
| 上次进化后累积 5+ 个会话 | 执行完整 8 步流程 |
| 捕获时发现记忆冲突 | 执行第 2–6 步 |

### 第 1 步 — 提交

结束当前活跃会话：

```bash
mem-x session end <session-id>
```

### 第 2 步 — 回顾

收集所有近期素材：

```bash
mem-x recall --limit 30
mem-x memory list short_term --limit 30
```

扫描：重复出现的主题、反复犯的错误、一致的偏好、知识空白。

### 第 3 步 — 分析

将分析结果记录为会话条目（为进化过程新开一个会话）：

```bash
mem-x session start
# → Session started: <evo-session-id>

mem-x session add <evo-session-id> \
  --content "分析：用户在 3 个会话中一致偏好 X 而非 Y，原因是 Z。模式 P 反复出现。" \
  --tags "evolution,analysis"
```

### 第 4 步 — 规划晋升

决定哪些记忆要晋升、丢弃或合并，记录计划：

```bash
mem-x session add <evo-session-id> \
  --content "计划：'偏好X' → semantic；'必须使用X' → rule；丢弃过期条目 A、B" \
  --tags "evolution,plan"
```

### 第 5 步 — 执行

逐一执行晋升操作，并创建图边追踪来源：

```bash
# 晋升为语义记忆（然后建立溯源边）
mem-x memory add semantic \
  --topic "<知识主题>" \
  --content "<整合后的知识>" \
  --tags "promoted"
# → Created: <new-semantic-id>

mem-x graph link <short-term-id> <new-semantic-id> \
  --relation promoted_from \
  --source-layer short_term --target-layer semantic

# 晋升为规则
mem-x memory add rules \
  --trigger "<适用场景>" \
  --constraint "<约束内容>" \
  --reason "<基于分析的原因>"
# → Created: <new-rule-id>

mem-x graph link <short-term-id> <new-rule-id> \
  --relation promoted_from \
  --source-layer short_term --target-layer rules

# 晋升为情景记忆
mem-x memory add episodic \
  --event "<重要事件>" \
  --context "<上下文>" \
  --result "<结果>" \
  --tags "promoted"

# 关联跨层记忆
mem-x graph link <semantic-id> <episodic-id> \
  --relation related_to \
  --source-layer semantic --target-layer episodic
```

### 第 6 步 — 验证

检查新记忆是否与现有高置信度记忆冲突：

```bash
mem-x search "<新知识摘要>" --layer rules --limit 5
mem-x search "<新知识摘要>" --layer semantic --limit 5

# 通过图邻居检查冲突
mem-x graph neighbors <new-id> --relation contradicts
```

发现冲突 → 创建 `contradicts` 或 `supersedes` 边，然后更新或删除冲突条目：

```bash
mem-x graph link <new-id> <old-conflicting-id> \
  --relation supersedes \
  --source-layer <new-layer> --target-layer <old-layer>
```

### 第 7 步 — 日志

将本次进化周期记录为情景事件：

```bash
mem-x memory add episodic \
  --event "进化周期：从短期记忆晋升 N 条 → M 条语义, K 条规则" \
  --context "evolution-cycle" \
  --result "<变更摘要：晋升了什么、丢弃了什么、更新了什么>" \
  --tags "evolution"
```

### 第 8 步 — 提炼

搜索历次进化日志并自动发现相关记忆：

```bash
mem-x search "evolution" --layer episodic --limit 20
mem-x graph auto-link --threshold 0.85
```

如果跨进化周期出现重复模式（如"用户总是拒绝 class 写法"），提炼为元规则：

```bash
mem-x memory add rules \
  --trigger "<元模式触发条件>" \
  --constraint "<提炼后的约束>" \
  --reason "在 N 次进化周期中观察到的元模式"
```

结束进化会话：

```bash
mem-x session end <evo-session-id>
```

---

## 维护

### 每次对话结束后（必须 — 规则 4 的一部分）

```bash
mem-x memory purge
```

### 每次进化时（第 2 步的一部分）

在回顾过程中同时检查：

**过期语义记忆** — 30 天以上无命中：

```bash
mem-x memory list semantic --limit 50
```

`hit_count: 0` 或 `last_hit_at` 过旧的条目 → 删除或更新。

**冗余短期条目** — 多条记录同一主题：

→ 在第 5 步合并为一条语义记忆，原始条目自然过期。

**未验证规则** — `hit_count: 0` 的规则：

```bash
mem-x memory list rules --limit 50
```

→ 下次其触发条件出现时主动测试。有效则保留，无效则删除：

```bash
mem-x memory delete <id> --layer rules
```

### 周期性检查（上次进化后 5+ 个会话时）

执行完整 8 步进化工作流。先找到上次进化的时间戳：

```bash
mem-x search "evolution-cycle" --layer episodic --limit 1
mem-x session list --limit 10
```

统计上次进化情景条目之后创建的会话数，达到 5+ 则触发进化。

---

## CLI 参考

```
# 上下文引导
mem-x recall [--limit N]                                 # 一键输出所有规则、任务、近期记忆

# 会话（第 1 层 — 临时）
mem-x session start                                      # 开启会话 → 返回 <session-id>
mem-x session add <id> --content "..." [--tags "a,b"]    # 添加会话条目
mem-x session end <id> [--ttl <rounds>]                   # 结束 → 提交到短期记忆 + 轮次++
mem-x session show <id>                                  # 查看会话详情
mem-x session list [--limit N]                           # 列出近期会话

# 记忆 CRUD（第 2 & 3 层）
mem-x memory add short_term --content "..." [--ttl <rounds>] [--tags "..."]
mem-x memory add episodic --event "..." [--context C] [--result R] [--tags "..."]
mem-x memory add semantic --topic "..." --content "..." [--tags "..."]
mem-x memory add rules --trigger "..." --constraint "..." [--reason "..."]
mem-x memory list <layer> [--since DATE] [--limit N]
mem-x memory get <id> --layer <layer>
mem-x memory delete <id> --layer <layer>
mem-x memory purge                                       # 清理过期短期记忆

# 搜索（BM25 + 向量混合，可选图增强）
mem-x search "<query>" [--layer L] [--mode bm25|vector|hybrid] [--limit N] [--graph]
mem-x search "<query>" --graph --graph-depth 2 --graph-boost 0.5  # 深度图增强搜索

# 图（记忆关联关系）
mem-x graph link <source> <target> --relation <type> --source-layer <L> --target-layer <L> [--weight N]
mem-x graph unlink <edge-id>
mem-x graph neighbors <memory-id> [--relation <type>]
mem-x graph list [--relation <type>] [--layer L] [--limit N]
mem-x graph auto-link [--threshold N] [--limit N]

# 任务
mem-x task add --title "..." [--priority P] [--deadline D] [--tags "..."]
mem-x task list [--status S] [--limit N]
mem-x task update <id> --status <status>

# 配置与调试
mem-x config show
mem-x config set <key> <value>
mem-x debug [--port 3210]                                # 启动 Web 调试面板

# 全局选项: mem-x --bucket <name> <command>  或  MEM_X_BUCKET=<name>
```

---

## 架构参考

```
会话记忆 ──[session end]──▶ 短期记忆 ──[evolution]──▶ 长期记忆
  (JSON 文件)                 (TTL 7轮)                  ├── 情景 (日记)
  临时，每次对话               SQLite + FTS5 + vec0       ├── 语义 (知识)
                              可搜索，按轮次衰减           └── 规则 (约束)

                           图关联层 (edges 表)
                  通过类型化边连接所有层的记忆节点：
                  promoted_from, derived_from, related_to,
                  contradicts, supersedes, caused_by, leads_to, similar_to
```

| 层级 | 类型 | 生命周期 | 类比 |
|------|------|----------|------|
| 1 | 会话 | 单次对话 | 草稿纸 |
| 2 | 短期 | 7 轮（可配置） | 便利贴 |
| 3 | 情景 | 永久 | 日记本 |
| 3 | 语义 | 永久 | 笔记本 |
| 3 | 规则 | 永久，最高优先级 | 规则手册 |
| - | 图 | 永久 | 笔记间的连线 |

- **搜索优先级**：规则 → 短期 → 语义 → 情景
- **搜索模式**：BM25（关键词）+ 向量（语义）→ 通过 RRF 融合
- **图增强搜索**：`--graph` 参数扩展邻居节点 + 提升关联记忆得分
- **存储**：SQLite + FTS5 全文索引 + sqlite-vec 向量扩展 + edges 关联表
- **桶隔离**：每个 Agent 获得 `~/.mem-x/<bucket>/` 独立数据空间
