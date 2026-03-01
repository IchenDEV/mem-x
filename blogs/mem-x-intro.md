# mem-x: 让 AI 助手拥有可进化的长期记忆

你有没有遇到过这样的情况：跟 AI 助手聊了一下午，教了它一堆项目约定、个人偏好、踩坑经验，结果第二天打开新对话，它又变成了一张白纸？

这不是某个产品的 bug，而是当前 AI 助手的一个根本性缺陷——没有持久记忆。每次对话都是从零开始，之前所有的交互积累全部丢失。你不得不一遍又一遍地重复同样的上下文。

这个问题在使用 Claude Code、Cursor、Windsurf 这类 AI 编程助手时尤其明显。你告诉它"这个项目用 Bun 不用 npm"，下次它又跑去 `npm install`。你纠正过三次"不要用 class 写 React 组件"，第四次它依然我行我素。

mem-x 就是为了解决这个问题而生的。

## 什么是 mem-x

mem-x 是一个自进化的 AI 记忆系统。它以 Agent Skill 的形式交付——一个 SKILL.md 文件就能赋予任何 AI 助手跨会话的记忆、学习和进化能力。

"自进化"是关键词。mem-x 不只是一个简单的笔记存储，它有完整的记忆生命周期：观察在短期记忆中自然衰减，有价值的信息通过进化流程被提炼为长期知识，过时的知识会被淘汰更新。就像人类的记忆系统——重要的事情越记越牢，琐碎的细节逐渐淡忘。

技术栈很简洁：TypeScript + SQLite，搭配 FTS5 全文索引和 sqlite-vec 向量扩展。所有数据存在一个 SQLite 文件里，不依赖外部数据库服务。

## 三层记忆架构

mem-x 的核心设计是一个三层记忆架构，模拟了人类记忆从短期到长期的转化过程。

### 第一层：会话记忆 (Session Memory)

会话记忆就是当前对话的草稿纸。每次对话开始时创建一个 session，AI 助手在对话过程中把值得记住的信息写入：

```bash
mem-x session start
# → Session started: a1b2c3

mem-x session add a1b2c3 --content "用户偏好：项目中使用 Bun 而非 npm" --tags "preference"
mem-x session add a1b2c3 --content "纠正：React 组件必须用函数式写法" --tags "correction"
```

会话记忆以 JSON 文件存储，生命周期等于对话本身。对话结束时，所有条目自动提交到短期记忆：

```bash
mem-x session end a1b2c3
```

### 第二层：短期记忆 (Short-term Memory)

短期记忆是观察的暂存区。从会话提交过来的条目默认有 7 轮 TTL（Time To Live）——也就是说，如果 7 次对话之后这条记忆没有被进化流程提升为长期知识，它就自动过期。

这个设计很重要。不是所有信息都值得永久保存。你在调试某个 bug 时的临时发现、某次对话中的随口一提，这些信息如果反复出现说明它有价值，如果只出现一次就让它自然消亡。

短期记忆存储在 SQLite 中，支持 BM25 关键词搜索和向量语义搜索。

### 第三层：长期记忆 (Long-term Memory)

长期记忆是经过提炼的永久知识，分三个子层，按优先级从高到低排列：

**Rules（规则）** 优先级最高。存储行为约束和触发条件，比如"当用户要求写 React 组件时，必须使用函数式组件"。规则在每次搜索中最先返回，确保 AI 的行为始终符合你的要求。

```bash
mem-x memory add rules \
  --trigger "编写 React 组件" \
  --constraint "必须使用函数式组件，禁止 class 组件" \
  --reason "用户在 3 次对话中明确纠正过这一点"
```

**Semantic（语义知识）** 存储提炼后的知识和模式，比如"这个项目的 API 命名风格是 camelCase"、"部署流程是先跑 lint 再跑 test 最后 build"。语义知识有版本状态（active / stale / deprecated），可以随项目演进而更新。

```bash
mem-x memory add semantic \
  --topic "项目部署流程" \
  --content "代码提交后的标准流程：lint → test → build → deploy to staging → smoke test → deploy to prod" \
  --tags "devops,workflow"
```

**Episodic（情景记忆）** 存储原始的交互记录和具体事件，类似日记。比如"2024-12-15 帮用户修复了一个 N+1 查询问题，原因是 ORM 的 eager loading 配置不对"。情景记忆可以在进化过程中被提炼为语义知识。

```bash
mem-x memory add episodic \
  --event "修复 N+1 查询问题" \
  --context "用户报告 API 响应慢，排查发现是 Prisma 的 include 配置缺失" \
  --result "添加 include 后响应时间从 2s 降到 200ms" \
  --tags "performance,database"
```

## 双路搜索

存了记忆还不够，关键是能在对的时机找到对的记忆。mem-x 采用双路搜索策略：

**BM25 关键词搜索**：基于 SQLite 的 FTS5 全文索引，擅长精确匹配。你搜"Prisma N+1"，它能准确找到包含这些关键词的记忆。

**向量语义搜索**：基于 sqlite-vec 向量扩展和 embedding 模型，擅长语义理解。你搜"数据库查询性能优化"，即使记忆中没有出现这些词，只要语义相近就能被召回。

两路搜索的结果通过 Reciprocal Rank Fusion (RRF, k=60) 融合，取长补短。搜索时按优先级跨层查询：rules > short_term > semantic > episodic，确保规则始终优先。

```bash
# 默认混合搜索
mem-x search "React 组件写法"

# 指定搜索模式
mem-x search "React 组件写法" --mode bm25
mem-x search "React 组件写法" --mode vector

# 限定搜索层
mem-x search "React 组件写法" --layer rules
```

每次搜索命中还会更新记忆的 hit_count，为后续的进化决策提供依据——被频繁命中的记忆说明它有价值，长期未命中的可能已经过时了。

## 进化引擎

进化引擎是 mem-x 最核心的部分。它是一个 8 步工作流，负责把短期观察提炼为长期知识：

1. **Commit** -- 结束当前会话，确保所有观察已提交
2. **Review** -- 回顾所有近期记忆和短期记忆
3. **Analyze** -- 分析其中的模式：重复出现的主题、反复犯的错误、一致的偏好
4. **Plan** -- 制定提升计划：哪些要提升为规则、哪些提炼为语义知识、哪些丢弃
5. **Execute** -- 执行提升操作
6. **Verify** -- 验证新知识不与已有知识冲突
7. **Log** -- 记录本次进化过程
8. **Distill** -- 分析历次进化日志，发现元模式并生成元规则

进化可以由用户手动触发（说"evolve"或"复盘"），也可以在积累了 5 次以上会话后自动触发。

这个流程的精妙之处在于第 8 步的自反馈。如果 AI 在多次进化中反复发现同一类模式（比如"用户总是拒绝 class 写法"），它会将这个观察提炼为更高层级的元规则。记忆系统本身在不断学习如何更好地学习。

## 万能 Agent Skill

这可能是 mem-x 最巧妙的设计决策：**记忆作为技能，而不是基础设施**。

传统做法是把记忆功能做成 SDK 或 API，需要在代码层面集成。mem-x 换了一个思路——用一个 SKILL.md 文件定义整套记忆操作规范，任何 AI 助手只要读取这个文件，就自动获得自进化记忆能力。

```
# 在 Claude Code 中使用
# 把 SKILL.md 加到项目的 skills 目录即可

# 在 Cursor 中使用
# 把 SKILL.md 的内容添加到 .cursorrules 或项目规则中

# 在 Windsurf 中使用
# 把 SKILL.md 添加到 .windsurfrules 中
```

SKILL.md 定义了完整的核心循环：每次对话开头执行 recall 加载上下文，每条消息评估是否需要捕获信息，对话结束时提交会话，定期触发进化。AI 助手按照这个规范操作 mem-x CLI，就实现了完整的记忆生命周期。

不需要改一行代码，不需要集成任何 SDK。这意味着 mem-x 可以即插即用地适配几乎所有主流 AI 编程助手。

## 数据存储

所有数据存储在 `~/.mem-x/` 目录下，按 bucket 隔离：

```
~/.mem-x/
├── config.json              # 全局配置（embedding 模型等）
├── default/                 # 默认 bucket
│   ├── mem-x.db            # SQLite 数据库（数据 + FTS5 + vec0）
│   └── sessions/            # 会话 JSON 文件
├── claude-code/             # Claude Code 专属 bucket
│   ├── mem-x.db
│   └── sessions/
└── cursor/                  # Cursor 专属 bucket
    ├── mem-x.db
    └── sessions/
```

多 bucket 设计是为了多 agent 隔离。你可能同时用 Claude Code 和 Cursor，它们各自积累的记忆不应该互相干扰。通过 `--bucket` 参数或 `MEM_X_BUCKET` 环境变量指定 bucket 名称：

```bash
export MEM_X_BUCKET=claude-code
mem-x recall  # 只加载 claude-code bucket 的记忆
```

SQLite 单文件存储的好处是显而易见的：备份就是复制文件，迁移就是移动文件，不需要跑数据库服务，不需要管理连接池。FTS5 全文索引和 sqlite-vec 向量索引都内嵌在同一个数据库文件中。

## 快速上手

### 安装

```bash
# 克隆仓库
git clone https://github.com/nicepkg/mem-x.git
cd mem-x

# 安装依赖并构建
bun install
bun run build

# 初始化数据库
npx mem-x init
```

### 配置 Embedding

mem-x 需要一个 embedding 模型来支持向量搜索。支持 OpenAI API 兼容的任何服务：

```bash
# 使用 OpenAI
npx mem-x config set embedding.apiKey sk-xxx
npx mem-x config set embedding.model text-embedding-3-small

# 使用本地 Ollama
npx mem-x config set embedding.baseUrl http://localhost:11434/v1
npx mem-x config set embedding.model nomic-embed-text

# 使用 LM Studio
npx mem-x config set embedding.baseUrl http://localhost:1234/v1
npx mem-x config set embedding.model text-embedding-bge-m3
```

### 接入 AI 助手

最简单的方式是把 `skills/mem-x/SKILL.md` 文件引入你的 AI 助手配置。以 Claude Code 为例，把 SKILL.md 放到项目的 skills 目录下，Claude Code 会自动识别并遵循其中的记忆操作规范。

### 验证

```bash
# 手动测试一轮
npx mem-x session start
# → Session started: abc123

npx mem-x session add abc123 --content "测试记忆：mem-x 安装成功" --tags "test"
npx mem-x session end abc123

# 搜索验证
npx mem-x search "安装成功"
```

### 调试面板

mem-x 自带一个浏览器调试面板，方便你查看记忆状态：

```bash
npx mem-x debug --port 3210
# 打开 http://localhost:3210
```

面板提供五个视图：概览（统计数据）、时间线（跨层浏览）、浏览器（按层查看）、搜索（分数明细）、健康检查（数据完整性）。

## 写在最后

mem-x 的核心理念是：AI 助手应该像人一样学习和记忆——不是记住所有东西，而是记住重要的东西，忘掉不重要的，并且在这个过程中不断进化。

三层架构模拟了认知科学中的记忆转化模型，进化引擎提供了自动的知识提炼流程，SKILL.md 的设计让整套系统可以零侵入地接入任何 AI 助手。

项目目前处于早期阶段（v0.1.0），但核心功能已经可用。如果你也受够了每次对话都要重复上下文，不妨试试给你的 AI 助手装一个可进化的记忆系统。

项目地址：[https://github.com/nicepkg/mem-x](https://github.com/nicepkg/mem-x)
