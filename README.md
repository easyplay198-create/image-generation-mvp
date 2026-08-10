# Image Generation MVP

电商 AI 图片生成 MVP 的独立工程。当前基线交付 T-04 图片生成 Provider Adapter、确定性 Mock 和后台任务链路；仍不接入真实 AI 供应商，也不包含完整生成页面或 Fabric.js 编辑器。

## 技术基线

- Next.js App Router
- TypeScript strict
- npm（仓库只提交 `package-lock.json`）
- ESLint
- Vitest
- PostgreSQL + Prisma
- AWS SDK for JavaScript v3（S3 兼容对象存储）
- Zod 运行时输入校验
- Sharp 图片签名后解码与尺寸读取
- PostgreSQL 持久化 Job Worker
- 可替换 Style Analyzer 与 Image Generation Provider（默认确定性 Mock）

## 环境要求

- Node.js 20.9 或更高版本
- npm 10 或更高版本
- PostgreSQL 17（CI 使用隔离服务；本地可使用兼容版本）
- S3 兼容对象存储（例如 MinIO）

## 本地启动

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

另开一个终端启动风格分析 Worker：

```powershell
npm run worker:style-analysis
```

需要执行图片生成任务时，再开一个终端启动图片生成 Worker：

```powershell
npm run worker:generation
```

打开 [http://localhost:3000](http://localhost:3000)。健康端点为 [http://localhost:3000/api/health](http://localhost:3000/api/health)。

缺少必要环境变量时，服务启动会快速失败，并列出缺失的变量名；错误信息不会输出已配置的变量值。不要提交 `.env` 或任何真实凭据。

## 本地 PostgreSQL 与对象存储

本地运行使用以下依赖边界：

- PostgreSQL：监听 `127.0.0.1:5432`，创建 `image_generation` 数据库与本地开发用户；
- S3 兼容存储：监听 `127.0.0.1:9000`，创建私有 `image-generation-mvp` bucket；
- 将连接信息填入 `.env`，变量名称以 `.env.example` 为准。

可以使用本机已有服务，也可以用 Docker 启动 PostgreSQL 和 MinIO。`/api/health` 会实际探测数据库与 bucket；任一依赖不可用时返回 HTTP 503 和 `degraded`，且不会暴露底层连接错误。

## 商品项目与资产上传

首页用于创建和列出当前 Demo owner 的商品项目。进入项目工作台后可以编辑商品信息、上传 1 张主商品图及最多 6 张参考图。上传只接受 PNG、JPEG 和 WebP，单文件上限为 20 MiB；服务端同时校验扩展名、声明 MIME、签名字节和真实解码结果。

对象 Key 完全由服务端生成，不使用原始文件名。Bucket 保持私有；页面预览通过 owner-scoped 同源代理读取，不返回对象 Key 或签名 URL。对象写入后若容量检查或数据库写入失败，服务会补偿删除对象。

当前 T-02 API：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET/POST` | `/api/projects` | 列出或创建商品项目 |
| `GET/PATCH` | `/api/projects/:projectId` | 读取或更新 owner-scoped 项目 |
| `POST` | `/api/projects/:projectId/assets` | 上传单张 `PRODUCT` 或 `REFERENCE` 图片 |
| `GET` | `/api/projects/:projectId/assets/:assetId` | 读取私有图片预览 |

所有 JSON 响应包含 `requestId`；错误使用稳定机器码且不返回内部堆栈。

## StyleSpec 风格分析

项目至少有 1 张参考图后，可在工作台创建风格分析任务。Web 只把任务以 `QUEUED` 状态写入 PostgreSQL；独立 Worker 使用行锁和 `SKIP LOCKED` 原子领取，按 `QUEUED → RUNNING → SUCCEEDED/FAILED` 更新状态。Worker 中断后，过期租约会在剩余尝试次数内重新排队；仅限流和超时错误自动重试，最多执行 2 次。

默认 `STYLE_ANALYZER_PROVIDER=mock`，不会发送外部网络请求。`STYLE_ANALYZER_MOCK_SCENARIO` 支持 `success`、`auth-failure`、`rate-limited`、`policy-rejected`、`timeout` 和 `invalid-response`，用于可重复测试成功和五类失败。`external-placeholder` 只保留真实适配器边界并明确拒绝执行，不会调用任何真实 AI API。

Provider 输出始终先作为不可信 JSON 处理。只有通过 StyleSpec V1 严格 Schema 的结果才会在同一事务内创建 revision 并把 Job 标记为成功。V1 包含 `summary`、`moodKeywords`、`palette`、`background`、`composition`、`typography`、`decorations` 和 `negativeConstraints`，并校验字段长度、数组数量、`#RRGGBB` 颜色和未知字段。工作台可查看并编辑完整 JSON；每次保存都会创建不可变的新 revision。

T-03 API：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/:projectId/style-analysis-jobs` | 使用幂等键创建分析任务 |
| `GET` | `/api/jobs/:jobId` | owner-scoped 查询任务状态 |
| `GET` | `/api/projects/:projectId/style-spec` | 读取最新 revision 和任务 |
| `PUT` | `/api/projects/:projectId/style-spec` | 校验并保存用户编辑的新 revision |

## 图片生成 Provider Adapter

T-04 引入可替换的 `ImageGenerationProvider` 边界，业务服务和 Worker 只调用 `generateBackground()`、`getJobStatus()` 与 `normalizeUsage()`，不直接依赖任何供应商 SDK。所有适配器错误统一映射为认证、限流、策略拒绝、超时或无效响应；只有限流和超时允许重试，任务最多执行 2 次。

默认 `IMAGE_GENERATION_PROVIDER=mock`，不会发送外部网络请求，也不需要 API Key。`IMAGE_GENERATION_MOCK_SCENARIO` 支持 `success`、`timeout`、`rate-limited`、`invalid-response` 和 `policy-rejected`。`external-placeholder` 只验证适配器可替换边界，并明确拒绝执行。

创建任务时必须显式绑定一个属于当前项目的 StyleSpec revision，并提供幂等键。独立 Worker 原子领取任务，提交 Provider、轮询状态、验证返回图片的签名/解码结果/1080 × 1080 尺寸，然后把私有 `GENERATED_BACKGROUND` Asset、GenerationResult 和成功状态写入同一数据库事务。对象先写入存储而数据库事务失败时，Worker 会补偿删除对象；无结果记录时不会把 Job 标记为成功。

GenerationResult 保存 `providerName`、供应商请求 ID、应用请求 ID、Provider duration、归一化用量及成本元数据。当前 Mock 生成背景占位图，只验证工程链路，不代表真实 AI 生成能力。

T-04 API：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/projects/:projectId/generation-jobs` | 使用 revision 与幂等键创建生成任务 |
| `GET` | `/api/jobs/:jobId` | owner-scoped 查询任意任务状态 |
| `GET` | `/api/projects/:projectId/generations` | 列出项目生成结果与 Provider 元数据 |
| `GET` | `/api/projects/:projectId/generations/:generationId/preview` | 读取私有生成背景预览 |

## 数据库迁移与恢复

```powershell
npm run db:generate
npm run db:migrate
npm run db:migrate:check
```

`db:migrate:check` 连续执行两次 forward-only migration，用于验证空库初始化和重复执行的非破坏性。已应用迁移不得修改；后续 schema 变更必须新增迁移。

T-02 迁移把 Asset 的 `width`/`height` 设为必填。T-03 迁移补齐 Job 的输入快照、最大尝试次数、租约时间、Provider 名称/请求 ID 和完成时间，并保留现有 Job 数据。T-04 迁移为 GenerationResult 补齐 Provider、请求、耗时、用量和成本元数据。通过正式 T-02 上传创建的记录总会写入真实解码尺寸；若本地曾手工插入空尺寸测试记录，迁移前必须删除该测试记录或补录经过核验的尺寸。

- 可丢弃的本地数据库：删除并重建本地数据库，然后执行 `npm run db:migrate`；
- 不可丢弃环境：先停止写入并从已验证备份恢复，再根据迁移记录决定是否重新执行 deploy；
- 当前初始迁移不提供自动向下迁移脚本，避免把生产恢复误当成无损回滚。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run lint` | 运行 ESLint，警告也会导致失败 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run test` | 运行单元测试基线 |
| `npm run test:integration` | 使用 `DATABASE_URL` 运行数据库集成测试 |
| `npm run worker:style-analysis` | 启动 PostgreSQL 风格分析 Worker |
| `npm run worker:generation` | 启动 PostgreSQL 图片生成 Worker |
| `npm run db:generate` | 生成 Prisma 客户端 |
| `npm run db:migrate` | 应用尚未执行的数据库迁移 |
| `npm run db:migrate:check` | 连续两次应用迁移，验证重复执行安全性 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动已构建的生产服务器 |

## 目录边界

```text
app/             页面与 Route Handler
src/config/      服务端环境配置
src/domain/      项目、上传、StyleSpec 和生成结果运行时校验
src/services/    owner-scoped 项目、资产、任务和 revision 服务
src/providers/   Style Analyzer/Image Generation 适配器与确定性 Mock
src/storage/     PostgreSQL/S3 访问、owner 查询和补偿边界
src/editor/      编辑器文档与行为（后续任务）
worker/          PostgreSQL 原子领取、StyleSpec 分析和图片生成执行单元
prisma/          Prisma schema 与 forward-only migrations
tests/           unit / integration / e2e
```

## T-04 范围说明

T-04 只增加 Image Generation Provider Adapter、统一错误、五种 Mock 场景、生成 Job Worker、结果持久化和只读结果 API。没有配置生产 API Key、绑定单一模型、接入真实 AI 供应商、开发完整图片生成页面、Fabric.js 编辑器或批量生成。本阶段是可测试的工程适配层，不是完整业务 MVP。
