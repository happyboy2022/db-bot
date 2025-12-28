#!/usr/bin/env bun
/**
 * 从 Doppler 同步 Executor 环境变量到 .env.local 文件
 *
 * 支持两种模式:
 * 1. 直接模式: 如果本地已配置 Doppler 项目 (db-bot-executor)，直接使用 doppler secrets
 * 2. 间接模式: 通过 Console 的 CLUSTER_DOPPLER_TOKEN_DEV 从 Doppler API 获取
 *
 * Usage:
 *   bun scripts/sync-executor-env.ts [options]
 *
 * Options:
 *   --cluster <name>   指定集群 (默认: dev)
 *   --api-only         强制使用 API 模式 (通过 CLUSTER_DOPPLER_TOKEN_*)
 *   --quiet            减少输出
 *   --help, -h         显示帮助
 *
 * Examples:
 *   bun scripts/sync-executor-env.ts                    # 同步 dev 集群
 *   bun scripts/sync-executor-env.ts --cluster pre      # 同步 pre 集群
 *   bun scripts/sync-executor-env.ts --api-only         # 强制使用 API 模式
 */

import { $ } from "bun";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

// Colors for output
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const log = {
  info: (msg: string) => console.log(colors.blue("ℹ"), msg),
  success: (msg: string) => console.log(colors.green("✓"), msg),
  warn: (msg: string) => console.log(colors.yellow("⚠"), msg),
  error: (msg: string) => console.log(colors.red("✗"), msg),
};

const projectRoot = join(import.meta.dir, "..");
const executorEnvPath = join(projectRoot, "apps/executor/.env.local");

// Supported clusters and their corresponding token environment variable names
const CLUSTER_TOKEN_MAP: Record<string, string> = {
  dev: "CLUSTER_DOPPLER_TOKEN_DEV",
  pre: "CLUSTER_DOPPLER_TOKEN_PRE",
  "sg-1": "CLUSTER_DOPPLER_TOKEN_SG_1",
  "sg-2": "CLUSTER_DOPPLER_TOKEN_SG_2",
  "sg-3": "CLUSTER_DOPPLER_TOKEN_SG_3",
  "sg-4": "CLUSTER_DOPPLER_TOKEN_SG_4",
  "us-1": "CLUSTER_DOPPLER_TOKEN_US_1",
  "us-2": "CLUSTER_DOPPLER_TOKEN_US_2",
  "us-3": "CLUSTER_DOPPLER_TOKEN_US_3",
  "us-4": "CLUSTER_DOPPLER_TOKEN_US_4",
  "us-5": "CLUSTER_DOPPLER_TOKEN_US_5",
};

interface DopplerSecret {
  raw: string;
  computed: string;
  note: string;
}

interface DopplerSecretsResponse {
  secrets: Record<string, DopplerSecret>;
}

interface Options {
  cluster: string;
  apiOnly: boolean;
  quiet: boolean;
  help: boolean;
}

function parseOptions(): Options {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      cluster: { type: "string", default: "dev" },
      "api-only": { type: "boolean", default: false },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  return {
    cluster: values.cluster || positionals[0] || "dev",
    apiOnly: values["api-only"] || false,
    quiet: values.quiet || false,
    help: values.help || false,
  };
}

function showHelp(): void {
  console.log(`
${colors.bold(colors.blue("Sync Executor Environment Variables"))}

从 Doppler 同步 Executor 环境变量到 .env.local 文件

${colors.yellow("Usage:")}
  bun scripts/sync-executor-env.ts [options]

${colors.yellow("Options:")}
  --cluster <name>   指定集群 (默认: dev)
  --api-only         强制使用 API 模式 (通过 CLUSTER_DOPPLER_TOKEN_*)
  --quiet, -q        减少输出
  --help, -h         显示帮助

${colors.yellow("可用集群:")}
${Object.keys(CLUSTER_TOKEN_MAP)
  .map((c) => `  ${colors.cyan(c.padEnd(10))} ${CLUSTER_TOKEN_MAP[c]}`)
  .join("\n")}

${colors.yellow("同步模式:")}
  ${colors.cyan("直接模式")} - 如果本地已配置 Doppler 项目 (db-bot-executor)
               使用 doppler secrets 直接获取

  ${colors.cyan("API 模式")} - 通过 Console 的 CLUSTER_DOPPLER_TOKEN_* 环境变量
              从 Doppler API 获取 Executor 配置

${colors.yellow("Examples:")}
  bun scripts/sync-executor-env.ts                    # 同步 dev 集群
  bun scripts/sync-executor-env.ts --cluster pre      # 同步 pre 集群
  bun scripts/sync-executor-env.ts --api-only         # 强制使用 API 模式
  doppler run -- bun scripts/sync-executor-env.ts     # 通过 Console Doppler 运行

${colors.yellow("Note:")}
  API 模式需要 CLUSTER_DOPPLER_TOKEN_* 环境变量。
  可以通过以下方式提供:
  1. 运行 ${colors.cyan("doppler run -- bun scripts/sync-executor-env.ts")}
  2. 先运行 ${colors.cyan("make sync-env")} 同步 Console 的 .env.local
`);
}

/**
 * Fetch secrets from Doppler using a service token
 */
async function fetchDopplerSecrets(
  token: string
): Promise<Record<string, string>> {
  const response = await fetch(
    "https://api.doppler.com/v3/configs/config/secrets",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Doppler API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as DopplerSecretsResponse;
  const secrets: Record<string, string> = {};

  for (const [key, value] of Object.entries(data.secrets)) {
    secrets[key] = value.computed || value.raw;
  }

  return secrets;
}

/**
 * Get cluster token from environment
 */
function getClusterToken(cluster: string): string | null {
  const tokenEnvVar = CLUSTER_TOKEN_MAP[cluster];
  if (!tokenEnvVar) {
    return null;
  }

  return process.env[tokenEnvVar] || null;
}

/**
 * Check if Doppler is configured for executor project
 */
async function isDopplerConfiguredForExecutor(): Promise<{
  configured: boolean;
  project?: string;
  config?: string;
}> {
  try {
    const result = await $`doppler configure --json`.quiet();
    const parsed = JSON.parse(result.stdout.toString());

    // Check if any path has db-bot-executor as project
    for (const [path, settings] of Object.entries(parsed)) {
      const config = settings as Record<string, string>;
      if (config["enclave.project"]?.includes("executor")) {
        return {
          configured: true,
          project: config["enclave.project"],
          config: config["enclave.config"],
        };
      }
    }

    return { configured: false };
  } catch {
    return { configured: false };
  }
}

/**
 * Fetch secrets using Doppler CLI (direct mode)
 */
async function fetchSecretsViaCli(): Promise<Record<string, string>> {
  const result = await $`doppler secrets --json`.quiet();
  const parsed = JSON.parse(result.stdout.toString()) as Record<
    string,
    { computed: string; raw?: string }
  >;

  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    secrets[key] = value.computed || value.raw || "";
  }

  return secrets;
}

/**
 * Write secrets to .env.local file
 */
function writeEnvFile(
  secrets: Record<string, string>,
  cluster: string,
  mode: "cli" | "api"
): void {
  const keys = Object.keys(secrets).sort();

  let content = `# 自动生成的环境变量文件
# 从 Doppler 同步: ${new Date().toISOString()}
# 集群: ${cluster}
# 模式: ${mode === "cli" ? "直接模式 (Doppler CLI)" : "API 模式 (CLUSTER_DOPPLER_TOKEN)"}
#
# 注意: 此文件仅用于本地开发
# 生产环境应使用 Doppler 直接注入环境变量
#
# 要更新此文件，运行: bun scripts/sync-executor-env.ts
#

`;

  for (const key of keys) {
    const value = secrets[key];
    // 如果值包含特殊字符，用双引号包裹
    if (
      value.includes(" ") ||
      value.includes("=") ||
      value.includes("#") ||
      value.includes("\n") ||
      value.includes('"') ||
      value.includes("'")
    ) {
      content += `${key}="${value.replace(/"/g, '\\"')}"\n`;
    } else {
      content += `${key}=${value}\n`;
    }
  }

  writeFileSync(executorEnvPath, content, "utf-8");
}

async function main(): Promise<void> {
  const options = parseOptions();

  if (options.help) {
    showHelp();
    return;
  }

  // Validate cluster
  if (!CLUSTER_TOKEN_MAP[options.cluster]) {
    log.error(
      `未知集群: ${options.cluster}. 可用集群: ${Object.keys(CLUSTER_TOKEN_MAP).join(", ")}`
    );
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(
      colors.bold(colors.blue("\n🔄 同步 Executor 环境变量到 .env.local\n"))
    );
  }

  let secrets: Record<string, string>;
  let mode: "cli" | "api";

  // Try direct mode first (unless --api-only is specified)
  if (!options.apiOnly) {
    const dopplerStatus = await isDopplerConfiguredForExecutor();

    if (dopplerStatus.configured) {
      if (!options.quiet) {
        log.info(`检测到 Doppler 直接配置`);
        log.info(`  项目: ${colors.cyan(dopplerStatus.project!)}`);
        log.info(`  配置: ${colors.cyan(dopplerStatus.config!)}`);
        console.log("");
      }

      try {
        if (!options.quiet) {
          log.info("从 Doppler CLI 获取环境变量...");
        }
        secrets = await fetchSecretsViaCli();
        mode = "cli";
      } catch (error) {
        log.warn(`Doppler CLI 获取失败: ${error}`);
        log.info("尝试使用 API 模式...");
        options.apiOnly = true; // Fall back to API mode
      }
    }
  }

  // API mode
  if (options.apiOnly || !secrets!) {
    if (!options.quiet) {
      log.info(`使用 API 模式 (集群: ${colors.cyan(options.cluster)})`);
    }

    const token = getClusterToken(options.cluster);
    if (!token) {
      log.error(
        `未找到集群 Token: ${CLUSTER_TOKEN_MAP[options.cluster]}`
      );
      console.log("");
      log.info("请通过以下方式之一提供 Token:");
      console.log(
        `  1. 运行: ${colors.cyan("doppler run -- bun scripts/sync-executor-env.ts")}`
      );
      console.log(
        `  2. 先运行: ${colors.cyan("make sync-env")} 同步 Console 的 .env.local`
      );
      console.log(
        `  3. 设置环境变量: ${colors.cyan(`export ${CLUSTER_TOKEN_MAP[options.cluster]}=<token>`)}`
      );
      process.exit(1);
    }

    try {
      if (!options.quiet) {
        log.info("从 Doppler API 获取环境变量...");
      }
      secrets = await fetchDopplerSecrets(token);
      mode = "api";
    } catch (error) {
      log.error(`API 获取失败: ${error}`);
      process.exit(1);
    }
  }

  // Write to file
  const envCount = Object.keys(secrets!).length;
  if (envCount === 0) {
    log.error("没有获取到任何环境变量");
    process.exit(1);
  }

  writeEnvFile(secrets!, options.cluster, mode!);

  if (!options.quiet) {
    console.log("");
    log.success(`环境变量已同步到: ${colors.cyan(executorEnvPath)}`);
    console.log("");
    console.log(colors.dim(`已同步 ${envCount} 个环境变量:`));
    console.log("");

    // Display all synced variable names (values hidden)
    const keys = Object.keys(secrets!).sort();
    for (const key of keys) {
      console.log(`   ${colors.green("✓")} ${key}`);
    }

    console.log("");
    console.log(
      colors.dim(
        "💡 提示: 现在可以运行 'bun dev' 或 'make dev-executor'"
      )
    );
    console.log("");
  } else {
    log.success(
      `已同步 ${envCount} 个环境变量到 apps/executor/.env.local`
    );
  }
}

main().catch((error) => {
  log.error(String(error));
  process.exit(1);
});

export { fetchDopplerSecrets, getClusterToken, CLUSTER_TOKEN_MAP };
