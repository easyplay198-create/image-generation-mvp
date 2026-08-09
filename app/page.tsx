const checks = [
  "Next.js App Router",
  "TypeScript strict",
  "ESLint 与类型检查",
  "Vitest 单元测试基线",
  "环境变量启动校验",
];

export default function Home() {
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">T-00 Foundation</p>
        <h1>AI 图片生成 MVP</h1>
        <p className="summary">
          项目骨架与运行基线已就位。AI 生成、上传、数据库业务模型和编辑器不属于本阶段。
        </p>
        <ul>
          {checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
        <p className="health-link">
          运行状态：<a href="/api/health">/api/health</a>
        </p>
      </section>
    </main>
  );
}
