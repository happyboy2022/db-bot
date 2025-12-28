#!/usr/bin/env bun
/**
 * SQL Ops Console - First-time Setup Script
 *
 * 设置开发环境，包括 Doppler 配置和依赖安装。
 *
 * Usage: bun scripts/setup.ts
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

// Colors for output
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

const log = {
  info: (msg: string) => console.log(colors.blue("ℹ"), msg),
  success: (msg: string) => console.log(colors.green("✓"), msg),
  warn: (msg: string) => console.log(colors.yellow("⚠"), msg),
  error: (msg: string) => console.log(colors.red("✗"), msg),
  step: (msg: string) => console.log(colors.cyan("→"), msg),
};

// Get project root
const projectRoot = join(import.meta.dir, "..");

async function checkPrerequisites(): Promise<boolean> {
  console.log("\n" + colors.yellow("Checking prerequisites..."));

  // Check Bun version
  const bunVersion = Bun.version;
  log.success(`Bun ${bunVersion}`);

  // Check for Doppler CLI
  try {
    const result = await $`doppler --version`.quiet();
    const version = result.stdout.toString().trim();
    log.success(`Doppler CLI ${version}`);
    return true;
  } catch {
    log.warn("Doppler CLI not installed");
    log.step("Install with: brew install dopplerhq/cli/doppler");
    log.step("Or visit: https://docs.doppler.com/docs/install-cli");
    return false;
  }
}

async function installDependencies(): Promise<void> {
  console.log("\n" + colors.yellow("Installing dependencies..."));

  await $`cd ${projectRoot} && bun install`.quiet();
  log.success("Dependencies installed");
}

async function setupEnvFiles(): Promise<void> {
  console.log("\n" + colors.yellow("Setting up environment files..."));

  const envFiles = [
    {
      example: "apps/console/.env.example",
      target: "apps/console/.env.local",
    },
    {
      example: "apps/executor/.env.example",
      target: "apps/executor/.env",
    },
  ];

  for (const { example, target } of envFiles) {
    const examplePath = join(projectRoot, example);
    const targetPath = join(projectRoot, target);

    if (existsSync(targetPath)) {
      log.step(`${target} already exists (skipped)`);
    } else if (existsSync(examplePath)) {
      await Bun.write(targetPath, await Bun.file(examplePath).text());
      log.success(`Created ${target}`);
    } else {
      log.warn(`${example} not found`);
    }
  }
}

async function checkDopplerSetup(): Promise<boolean> {
  console.log("\n" + colors.yellow("Checking Doppler configuration..."));

  try {
    // Check if doppler is configured in this directory
    const result = await $`cd ${projectRoot} && doppler configs`.quiet();
    log.success("Doppler is configured");
    return true;
  } catch {
    log.warn("Doppler not configured for this project");
    return false;
  }
}

async function showDopplerSetupGuide(hasDopplerCli: boolean): Promise<void> {
  console.log("\n" + colors.yellow("Doppler Setup Guide"));
  console.log("─".repeat(60));

  if (!hasDopplerCli) {
    console.log(`
${colors.cyan("Step 1:")} Install Doppler CLI

  ${colors.blue("brew install dopplerhq/cli/doppler")}

  Or visit: https://docs.doppler.com/docs/install-cli
`);
  }

  console.log(`
${colors.cyan(hasDopplerCli ? "Step 1:" : "Step 2:")} Login to Doppler

  ${colors.blue("doppler login")}

${colors.cyan(hasDopplerCli ? "Step 2:" : "Step 3:")} Setup Doppler in project root

  ${colors.blue("cd " + projectRoot)}
  ${colors.blue("doppler setup")}

  Select:
  - Project: ${colors.green("db-bot-console")}
  - Config: ${colors.green("dev")}

${colors.yellow("Doppler Projects:")}
  - ${colors.cyan("db-bot-console")}: Console 管理后台的环境变量
  - ${colors.cyan("db-bot-executor")}: Executor 执行服务的环境变量（多集群）

${colors.yellow("Environment Variables in db-bot-console:")}
  ${colors.dim("Database:")}
    DATABASE_URL              Neon 数据库连接字符串

  ${colors.dim("Authentication:")}
    BETTER_AUTH_SECRET        Better Auth 会话签名密钥
    NEXT_PUBLIC_APP_URL       应用 URL（动态端口时自动设置）

  ${colors.dim("Executor API:")}
    EXECUTOR_BASE_URL         Executor 服务 URL（动态端口时自动设置）
    EXECUTOR_API_TOKEN        共享 API 令牌

  ${colors.dim("Cluster Tokens (用于访问远程 Executor):")}
    CLUSTER_DOPPLER_TOKEN_DEV    开发环境 Executor
    CLUSTER_DOPPLER_TOKEN_PRE    预发布环境 Executor
    CLUSTER_DOPPLER_TOKEN_SG_1   新加坡集群 1
    CLUSTER_DOPPLER_TOKEN_US_1   美国集群 1
    ...

${colors.yellow("Cluster Token 命名规范:")}
  格式: CLUSTER_DOPPLER_TOKEN_{ENV}[_{REGION}_{NUMBER}]

  这些 Token 用于通过 Doppler API 获取对应 Executor 集群的配置。
  Console 通过这些 Token 可以动态获取 EXECUTOR_BASE_URL 等信息。
`);
}

async function showCompletionMessage(
  hasDopplerCli: boolean,
  hasDopplerConfig: boolean
): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log(colors.green("  Setup Complete!"));
  console.log("═".repeat(60));

  if (hasDopplerCli && hasDopplerConfig) {
    console.log(`
${colors.yellow("Start development server:")}

  ${colors.blue("doppler run -- make dev")}

  Or with remote Executor cluster:

  ${colors.blue("doppler run -- bun scripts/dev.ts --remote-cluster dev")}
`);
  } else {
    console.log(`
${colors.yellow("Next steps:")}

1. Configure Doppler (recommended):
   ${colors.blue("doppler login && doppler setup")}

2. Start development server:
   ${colors.blue("doppler run -- make dev")}

${colors.dim("Alternative (without Doppler):")}

1. Configure environment files manually:
   - ${colors.cyan("apps/console/.env.local")}
   - ${colors.cyan("apps/executor/.env")}

2. Start development server:
   ${colors.blue("make dev")}
`);
  }

  console.log(`
${colors.yellow("Useful commands:")}
   ${colors.blue("make help")}              Show all available commands
   ${colors.blue("doppler run -- make dev")} Start development servers
   ${colors.blue("make lint")}              Run linter
   ${colors.blue("make typecheck")}         Run type checker
   ${colors.blue("make db-migrate")}        Run database migrations
   ${colors.blue("make db-seed")}           Create local admin user
`);
}

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log(colors.blue("  SQL Ops Console - Development Setup"));
  console.log("═".repeat(60));

  try {
    const hasDopplerCli = await checkPrerequisites();
    await installDependencies();
    await setupEnvFiles();

    let hasDopplerConfig = false;
    if (hasDopplerCli) {
      hasDopplerConfig = await checkDopplerSetup();
    }

    await showDopplerSetupGuide(hasDopplerCli);
    await showCompletionMessage(hasDopplerCli, hasDopplerConfig);
  } catch (error) {
    log.error(`Setup failed: ${error}`);
    process.exit(1);
  }
}

main();
