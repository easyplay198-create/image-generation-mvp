# Image Generation MVP

电商 AI 图片生成 MVP 的独立工程。本提交仅交付 T-00 项目骨架与运行基线，不包含 AI 图片生成、上传、数据库业务模型、StyleSpec 或 Fabric.js 编辑器。

## 技术基线

- Next.js App Router
- TypeScript strict
- npm（仓库只提交 `package-lock.json`）
- ESLint
- Vitest

## 环境要求

- Node.js 20.9 或更高版本
- npm 10 或更高版本
- 可选：本地 PostgreSQL 与 S3 兼容对象存储（例如 MinIO）。T-00 只建立配置边界，连接实现属于 T-01。

## 本地启动

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。健康端点为 [http://localhost:3000/api/health](http://localhost:3000/api/health)。

缺少必要环境变量时，服务启动会快速失败，并列出缺失的变量名；错误信息不会输出已配置的变量值。不要提交 `.env.local` 或任何真实凭据。

## 本地 PostgreSQL 与对象存储

后续任务使用以下本地依赖边界：

- PostgreSQL：监听 `127.0.0.1:5432`，创建 `image_generation` 数据库与本地开发用户；
- S3 兼容存储：监听 `127.0.0.1:9000`，创建私有 `image-generation-mvp` bucket；
- 将连接信息填入 `.env.local`，变量名称以 `.env.example` 为准。

可以使用本机已有服务，也可以用 Docker 启动 PostgreSQL 和 MinIO。当前 T-00 健康端点会分别返回 Web、数据库、对象存储状态；数据库和对象存储连接检查明确标记为 `not_checked`，实际探测在 T-01 实现。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run lint` | 运行 ESLint，警告也会导致失败 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run test` | 运行单元测试基线 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动已构建的生产服务器 |

## 目录边界

```text
app/             页面与 Route Handler
src/config/      服务端环境配置
src/domain/      领域类型与规则（后续任务）
src/services/    应用服务（后续任务）
src/providers/   AI Provider 边界（后续任务）
src/storage/     PostgreSQL/S3 访问（后续任务）
src/editor/      编辑器文档与行为（后续任务）
worker/          后台任务执行单元（后续任务）
prisma/          Schema 与迁移（后续任务）
tests/           unit / integration / e2e
```

## T-00 范围说明

`/api/health` 的 Web 状态可实际验证；数据库与对象存储仅验证所需配置是否完整，并如实标记连接尚未检查。该限制不会被静默兜底，T-01 必须补充真实连接探测。
