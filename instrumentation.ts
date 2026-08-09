export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerEnvironment } = await import(
      "./src/config/environment"
    );

    assertServerEnvironment();
  }
}
