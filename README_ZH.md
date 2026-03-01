# mem-x

[English](./README.md)

自进化 AI 记忆系统，三级架构：**会话记忆 → 短期记忆 → 长期记忆**。双路检索（BM25 + 向量）+ 进化引擎，持续积累、提炼、纠正知识 —— 以 Agent Skill 形式交付，兼容任意 AI 助手。

## 特性

- **三级记忆** — 会话（对话缓冲）→ 短期（按轮次 TTL 自动衰减）→ 长期（情景 / 语义 / 规则）
- **双路检索** — BM25 关键词 + 向量语义搜索，RRF 融合排序
- **进化引擎** — 八步工作流，将短期观察晋升为长期知识
- **上下文引导** — `mem-x recall` 聚合规则、任务和近期记忆，支持冷启动
- **多桶隔离** — 每个 Agent 通过 `--bucket` 在 `~/.mem-x/` 下获得独立数据目录
- **调试面板** — 浏览器 UI，查看记忆统计、时间线、健康检查和搜索调试
- **可插拔 Embedding** — 支持 OpenAI API、Ollama 及任意 OpenAI 兼容接口（如 LM Studio）
- **通用 Agent Skill** — 一个 `SKILL.md` 即可让任意 AI 助手获得自进化记忆能力
- **SQLite 一体化** — 数据、FTS5 全文索引、sqlite-vec 向量索引，单文件存储

## 快速开始

```bash
bun install
bun run build

# 初始化数据库（创建 ~/.mem-x/default/mem-x.db）
npx mem-x init

# 配置 Embedding（写入 ~/.mem-x/config.json，以 OpenAI 兼容接口为例）
npx mem-x config set embedding.apiKey sk-xxx
npx mem-x config set embedding.baseUrl http://localhost:1234/v1
npx mem-x config set embedding.model text-embedding-bge-m3
```

## CLI 命令参考

```bash
# 数据库
mem-x init                                       # 初始化数据库

# 上下文引导
mem-x recall [--limit N]                         # 聚合规则 + 任务 + 近期记忆

# 会话记忆（第一层 — 对话缓冲）
mem-x session start                              # 开始新会话
mem-x session add <id> --content "..." [--tags]  # 添加会话条目
mem-x session end <id> [--ttl <rounds>]          # 结束会话 → 提交到短期记忆
mem-x session show <id>                          # 查看会话详情
mem-x session list                               # 列出最近会话

# 记忆 CRUD（第二层 & 第三层）
mem-x memory add short_term --content "..." [--tags "a,b"] [--ttl <rounds>]
mem-x memory add episodic   --event "..." [--context "..."] [--result "..."] [--tags "a,b"]
mem-x memory add semantic   --topic "..." --content "..." [--tags "a,b"]
mem-x memory add rules      --trigger "..." --constraint "..." [--reason "..."]
mem-x memory list <layer> [--since YYYY-MM-DD] [--limit N]
mem-x memory get <id> [--layer <layer>]
mem-x memory delete <id> [--layer <layer>]
mem-x memory purge                               # 清除过期短期记忆

# 搜索（双路检索，优先级：rules > short_term > semantic > episodic）
mem-x search "<query>" [--layer short_term|episodic|semantic|rules] [--mode bm25|vector|hybrid] [--limit N]

# 任务管理
mem-x task add --title "..." [--deadline "..."] [--priority low|medium|high|urgent]
mem-x task list [--status pending|in_progress|done|cancelled]
mem-x task update <id> --status <status>

# 调试面板
mem-x debug [--port 3030]                        # 启动浏览器调试 UI

# 配置
mem-x config show
mem-x config set <key> <value>

# 多桶隔离（Agent 隔离，数据存储在 ~/.mem-x/<bucket>/）
mem-x --bucket my-agent <command>                # 使用独立数据目录
MEM_X_BUCKET=my-agent mem-x <command>            # 或通过环境变量
```

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                      Agent Skill                         │
│                 (skills/mem-x/SKILL.md)                  │
├──────────────────────────────────────────────────────────┤
│                       CLI 层                             │
│  init │ session │ memory │ search │ task │ recall │ debug│
├──────────────────────────────────────────────────────────┤
│ 会话层 (JSON)       │ 短期 + 长期记忆 (SQLite)              │
│ ~/.mem-x/<bucket>/ │ 记忆存储     │ 双路搜索                │
│   sessions/        │ CRUD + 向量化 │ BM25 + Vector → RRF    │
├──────────────────────────────────────────────────────────┤
│ Embedding 提供者            │ SQLite 数据库               │
│ OpenAI / Ollama / 自定义    │ FTS5 + sqlite-vec          │
└──────────────────────────────────────────────────────────┘
```

### 记忆层级

| 层级 | 层名 | 生存期 | 存储 | 检索 |
|------|------|--------|------|------|
| 1 | **会话 (Session)** | 单次对话 | JSON 文件 | 无需检索 |
| 2 | **短期 (Short-term)** | 7 轮（可配置） | SQLite + FTS5 + vec0 | BM25 + 向量 |
| 3 | **规则 (Rules)** 最高优先 | 永久 | SQLite + FTS5 + vec0 | BM25 + 向量 |
| 3 | **语义 (Semantic)** | 永久 | SQLite + FTS5 + vec0 | BM25 + 向量 |
| 3 | **情景 (Episodic)** | 永久 | SQLite + FTS5 + vec0 | BM25 + 向量 |

### 记忆生命周期

```
会话条目 ──[会话结束]──▶ 短期记忆 ──[进化引擎]──▶ 情景记忆
                                             ──▶ 语义记忆
                                             ──▶ 规则
                                             ──▶ (丢弃)
```

### 项目结构

```
src/
├── cli.ts                  # 入口 + 全局 --bucket 选项
├── cli/                    # CLI 命令
│   ├── session.ts          #   会话 start/add/end/show/list
│   ├── memory.ts           #   记忆 list/get/delete/purge
│   ├── memory-add.ts       #   记忆 add（提取的子命令）
│   ├── memory-utils.ts     #   共享 CLI 工具函数
│   ├── search.ts           #   搜索（BM25/向量/混合）
│   ├── task.ts             #   任务 add/list/update
│   ├── recall.ts           #   recall（上下文引导）
│   ├── config.ts           #   配置 show/set
│   ├── init.ts             #   初始化
│   └── debug.ts            #   调试面板服务
├── db/
│   ├── connection.ts       # SQLite 单例 + sqlite-vec 扩展
│   ├── schema/             # Schema 定义（按职责拆分）
│   │   ├── tables.ts       #   数据表 + metadata
│   │   ├── fts.ts          #   FTS5 虚拟表 + 触发器
│   │   ├── vec.ts          #   vec0 向量表
│   │   └── index.ts        #   Schema 编排入口
│   ├── migrate.ts          # 数据库初始化
│   └── rounds.ts           # 轮次计数器（短期记忆 TTL）
├── debug/
│   ├── handlers.ts         # 统计、时间线、健康检查、详情
│   ├── search-debug.ts     # 调试模式搜索（含分数明细）
│   └── server.ts           # HTTP 服务器 + 面板 HTML
├── embedding/
│   ├── provider.ts         # EmbeddingProvider 接口
│   ├── openai.ts           # OpenAI 兼容 Provider
│   ├── ollama.ts           # Ollama Provider
│   └── factory.ts          # Provider 工厂
├── memory/
│   ├── types.ts            # TypeScript 类型定义
│   ├── session.ts          # 会话记忆（JSON 文件读写）
│   ├── layers/             # 记忆层 CRUD（每层一个文件）
│   │   ├── episodic.ts
│   │   ├── semantic.ts
│   │   ├── rules.ts
│   │   ├── short-term.ts
│   │   └── tasks.ts
│   ├── helpers.ts          # 标签解析、向量化、数据水合
│   ├── store.ts            # 桶文件（re-exports）
│   ├── search.ts           # BM25 + 向量 + RRF 融合
│   └── recall.ts           # 上下文引导聚合
└── utils/
    ├── config.ts           # 配置管理 (~/.mem-x/config.json)
    ├── bucket.ts           # 多桶路径解析 (~/.mem-x/<bucket>/)
    └── id.ts               # UUID 生成
```

## Agent Skill

`skills/mem-x/SKILL.md` 是完整的 AI 技能定义文件。将任意 AI 助手（Cursor、Claude Code、Windsurf 等）指向此文件，即可获得自进化记忆能力 —— 无需代码集成。

中文版本：`skills/mem-x/SKILL_ZH.md`

## 技术栈

- **运行时**: Node.js >= 20
- **包管理器**: Bun
- **语言**: TypeScript (ESM)
- **数据库**: SQLite (better-sqlite3) + FTS5 + sqlite-vec
- **Embedding**: OpenAI SDK（兼容 LM Studio、Ollama 等）
- **测试**: Vitest（137 个测试，覆盖率 90%+）
- **代码检查**: ESLint + typescript-eslint

## 开源协议

MIT
