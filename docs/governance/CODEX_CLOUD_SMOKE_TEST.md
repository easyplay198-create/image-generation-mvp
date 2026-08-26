# Codex Cloud 首次无真实凭据冒烟验证

## 验证范围

本次验证确认托管 Codex Cloud checkout 能够读取仓库治理规则、使用环境自动安装的依赖运行质量门，并在不使用真实服务凭据或外部 PostgreSQL 的前提下验证项目。

## Cloud 基线

- 基线提交：`8ac3cc384d004d88ec35b16980eacaef9391474d`
- 工作目录：`/workspace/image-generation-mvp`
- 工作分支：`work`
- Remote 身份：托管 checkout 未暴露名为 `origin` 的 Git remote；该检查不适用于本次托管环境，未创建或修改任何 remote。
- Node.js：`v20.20.2`
- npm：`11.4.2`

## 验证结果

| 检查 | 退出码 | 结果 |
| --- | ---: | --- |
| `npm ls --depth=0` | 0 | 通过（环境报告了自动安装依赖中的 extraneous 包） |
| `npm run lint` | 0 | 通过 |
| `npm run typecheck` | 0 | 通过 |
| `npx vitest run tests/unit/qwen-image-boundaries.test.ts --configLoader runner` | 0 | 通过 |
| `npm test` | 0 | 通过（22 个测试文件、198 个测试） |
| `npm run build` | 0 | 通过 |

验证期间未使用任何真实 Qwen、S3、PostgreSQL、OpenAI 或其他服务凭据，也未调用真实外部业务 API。由于环境没有外部 PostgreSQL，本地集成测试未运行，将由后续 GitHub Actions 验收。

本次冒烟验证的治理文档变更仅为 `docs/governance/CODEX_CLOUD_SMOKE_TEST.md`；同时包含为解除验证阻塞而对超时测试所做的最小修复。后续变更必须通过 Draft PR 和 GitHub Actions 验收，禁止直接合并。
