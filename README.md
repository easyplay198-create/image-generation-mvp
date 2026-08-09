# Image Generation MVP

电商 AI 图片生成 MVP 的独立工程。当前基线交付 T-02 商品项目与资产上传，不包含 AI 图片生成、StyleSpec 业务逻辑、Provider 或 Fabric.js 编辑器。

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

## 数据库迁移与恢复

```powershell
npm run db:generate
npm run db:migrate
npm run db:migrate:check
```

`db:migrate:check` 连续执行两次 forward-only migration，用于验证空库初始化和重复执行的非破坏性。已应用迁移不得修改；后续 schema 变更必须新增迁移。

T-02 迁移把 Asset 的 `width`/`height` 设为必填。通过正式 T-02 上传创建的记录总会写入真实解码尺寸；若本地曾手工插入空尺寸测试记录，迁移前必须删除该测试记录或补录经过核验的尺寸。

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
| `npm run db:generate` | 生成 Prisma 客户端 |
| `npm run db:migrate` | 应用尚未执行的数据库迁移 |
| `npm run db:migrate:check` | 连续两次应用迁移，验证重复执行安全性 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动已构建的生产服务器 |

## 目录边界

```text
app/             页面与 Route Handler
src/config/      服务端环境配置
src/domain/      项目与上传运行时校验
src/services/    owner-scoped 项目和资产应用服务
src/providers/   AI Provider 边界（后续任务）
src/storage/     PostgreSQL/S3 访问、owner 查询和补偿边界
src/editor/      编辑器文档与行为（后续任务）
worker/          后台任务执行单元（后续任务）
prisma/          Prisma schema 与 forward-only migrations
tests/           unit / integration / e2e
```

## T-02 范围说明

T-02 只实现项目创建/读取/更新、商品图与参考图上传、严格文件校验、Asset 保存和私有预览。没有 AI 生成、StyleSpec、Provider、任务 Worker、Fabric.js 编辑器或批量 SKU；这些属于后续任务或明确排除范围。
