#!/usr/bin/env bun
/**
 * SQL Ops Console - Development Server Startup Script
 *
 * 支持 Doppler 环境变量注入和动态端口分配。
 *
 * Usage:
 *   bun scripts/dev.ts [options]
 *   doppler run -- bun scripts/dev.ts [options]     # 推荐方式
 *
 * Options:
 *   --console       Only start Console (Next.js)
 *   --executor      Only start Executor (Hono)
 *   --local-executor  Start local Executor (default for dev)
 *   --remote-cluster <name>  Connect to remote Executor cluster
 *   --port <number>      Specify Console port (default: 3000)
 *   --executor-port <number>  Specify Executor port (default: 8787)
 *   --help          Show help message
 *
 * Examples:
 *   doppler run -- bun scripts/dev.ts              # Start all with Doppler
 *   doppler run -- bun scripts/dev.ts --console    # Start Console only
 *   doppler run -- bun scripts/dev.ts --remote-cluster dev  # Use remote dev Executor
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import { createServer } from "net";

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
  step: (msg: string) => console.log(colors.cyan("→"), msg),
};

// Get project root
const projectRoot = join(import.meta.dir, "..");

interface Options {
  console: boolean;
  executor: boolean;
  localExecutor: boolean;
  remoteCluster: string | undefined;
  port: number;
  executorPort: number;
  help: boolean;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      console: { type: "boolean", default: false },
      executor: { type: "boolean", default: false },
      "local-executor": { type: "boolean", default: true },
      "remote-cluster": { type: "string" },
      port: { type: "string", default: "3000" },
      "executor-port": { type: "string", default: "8787" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  return {
    console: values.console || false,
    executor: values.executor || false,
    localExecutor: values["local-executor"] !== false,
    remoteCluster: values["remote-cluster"],
    port: parseInt(values.port || "3000", 10),
    executorPort: parseInt(values["executor-port"] || "8787", 10),
    help: values.help || false,
  };
}

function showHelp(): void {
  console.log(`
${colors.blue("SQL Ops Console - Development Server")}

${colors.yellow("Usage:")}
  doppler run -- bun scripts/dev.ts [options]
  make dev [options]

${colors.yellow("Options:")}
  --console              Only start Console (Next.js)
  --executor             Only start Executor (Hono)
  --local-executor       Start local Executor (default)
  --remote-cluster <name>  Connect to remote Executor cluster
                         Available: dev, pre, sg-1, sg-2, us-1, us-2, ...
  --port <number>        Specify Console port (default: 3000)
  --executor-port <number>  Specify Executor port (default: 8787)
  --help, -h             Show this help message

${colors.yellow("Examples:")}
  ${colors.cyan("doppler run -- make dev")}              # Start all services with Doppler
  ${colors.cyan("doppler run -- make dev-console")}      # Start Console only
  ${colors.cyan("doppler run -- bun scripts/dev.ts --remote-cluster dev")}
                                     # Use remote dev Executor

${colors.yellow("Environment Variables (from Doppler):")}
  ${colors.cyan("DATABASE_URL")}           Neon database connection string
  ${colors.cyan("BETTER_AUTH_SECRET")}     Better Auth session signing key (use generate-secret.ts)
  ${colors.cyan("EXECUTOR_API_TOKEN")}     Shared API token
  ${colors.cyan("CLUSTER_DOPPLER_TOKEN_*")}  Tokens for accessing cluster configs

${colors.yellow("Dynamic Variables (auto-set based on port):")}
  ${colors.cyan("NEXT_PUBLIC_APP_URL")}    Console URL
  ${colors.cyan("BETTER_AUTH_URL")}        Better Auth base URL
  ${colors.cyan("EXECUTOR_BASE_URL")}      Executor URL

${colors.yellow("Note:")}
  Running with Doppler is recommended for full functionality.
  Without Doppler, the script will fall back to .env files.
`);
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Check if running with Doppler
 */
function isDopplerEnvironment(): boolean {
  return !!(process.env.DOPPLER_PROJECT && process.env.DOPPLER_CONFIG);
}

/**
 * Check required environment variables
 */
function checkRequiredEnvVars(): { missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required for Console
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Info messages for dynamically set variables
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    log.info("NEXT_PUBLIC_APP_URL will be set dynamically based on port");
  }
  if (!process.env.BETTER_AUTH_URL) {
    log.info("BETTER_AUTH_URL will be set dynamically based on port");
  }

  return { missing, warnings };
}

/**
 * Check for legacy .env files (for non-Doppler usage)
 */
async function checkEnvFiles(): Promise<boolean> {
  const consoleEnvLocal = join(projectRoot, "apps/console/.env.local");
  const consoleEnv = join(projectRoot, "apps/console/.env");
  const executorEnv = join(projectRoot, "apps/executor/.env");

  let hasIssues = false;

  if (!existsSync(consoleEnvLocal) && !existsSync(consoleEnv)) {
    log.warn("apps/console/.env.local or .env not found");
    log.step("Run 'make setup' first or use Doppler: 'doppler run -- make dev'");
    hasIssues = true;
  }

  if (!existsSync(executorEnv)) {
    log.warn("apps/executor/.env not found");
    log.step("Run 'make setup' first or use Doppler");
    hasIssues = true;
  }

  return !hasIssues;
}

/**
 * Fetch Executor configuration from remote cluster via Doppler API
 */
async function fetchRemoteClusterConfig(
  cluster: string
): Promise<{ executorUrl: string; apiToken: string } | null> {
  const tokenEnvVar = `CLUSTER_DOPPLER_TOKEN_${cluster.toUpperCase().replace(/-/g, "_")}`;
  const token = process.env[tokenEnvVar];

  if (!token) {
    log.error(`${tokenEnvVar} not found in environment`);
    log.step(`Make sure this token is configured in your Doppler Console project`);
    return null;
  }

  try {
    log.info(`Fetching configuration for cluster: ${colors.cyan(cluster)}`);

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
      throw new Error(`Doppler API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      secrets: Record<string, { computed: string; raw: string }>;
    };

    const secrets = data.secrets;
    const executorUrl =
      secrets.EXECUTOR_BASE_URL?.computed || secrets.EXECUTOR_BASE_URL?.raw;
    const apiToken =
      secrets.EXECUTOR_API_TOKEN?.computed || secrets.EXECUTOR_API_TOKEN?.raw;

    if (!executorUrl || !apiToken) {
      throw new Error("EXECUTOR_BASE_URL or EXECUTOR_API_TOKEN not found in cluster config");
    }

    log.success(`Cluster config loaded: ${colors.cyan(executorUrl)}`);
    return { executorUrl, apiToken };
  } catch (error) {
    log.error(`Failed to fetch cluster config: ${error}`);
    return null;
  }
}

interface StartupConfig {
  consolePort: number;
  executorPort: number;
  consoleUrl: string;
  executorUrl: string;
  useLocalExecutor: boolean;
  /** 签名密钥，用于 Console 与 Executor 之间的请求验证 */
  signingSecret: string;
}

async function prepareStartup(options: Options): Promise<StartupConfig> {
  let consolePort = options.port;
  let executorPort = options.executorPort;
  let executorUrl = "";
  let useLocalExecutor = true;

  // 获取或生成签名密钥
  const signingSecret = getOrGenerateSigningSecret();

  // Check for remote cluster configuration
  if (options.remoteCluster) {
    const clusterConfig = await fetchRemoteClusterConfig(options.remoteCluster);
    if (clusterConfig) {
      executorUrl = clusterConfig.executorUrl;
      useLocalExecutor = false;
      // Set the API token in environment for the Console to use
      process.env.EXECUTOR_API_TOKEN = clusterConfig.apiToken;
    } else {
      log.warn("Failed to get remote cluster config, falling back to local Executor");
    }
  }

  // Find available ports if needed
  if (!options.executor) {
    // Starting Console
    if (!(await isPortAvailable(consolePort))) {
      log.warn(`Port ${consolePort} is in use, finding alternative...`);
      consolePort = await findAvailablePort(consolePort);
      log.info(`Using port ${colors.cyan(String(consolePort))} for Console`);
    }
  }

  if (useLocalExecutor && !options.console) {
    // Starting local Executor
    if (!(await isPortAvailable(executorPort))) {
      log.warn(`Port ${executorPort} is in use, finding alternative...`);
      executorPort = await findAvailablePort(executorPort);
      log.info(`Using port ${colors.cyan(String(executorPort))} for Executor`);
    }
    executorUrl = `http://localhost:${executorPort}`;
  }

  const consoleUrl = `http://localhost:${consolePort}`;

  return {
    consolePort,
    executorPort,
    consoleUrl,
    executorUrl,
    useLocalExecutor,
    signingSecret,
  };
}

function showStartupInfo(config: StartupConfig, options: Options): void {
  console.log("═".repeat(60));
  console.log(colors.blue("  SQL Ops Console - Development Server"));
  if (isDopplerEnvironment()) {
    console.log(
      colors.dim(
        `  Doppler: ${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG}`
      )
    );
  }
  console.log("═".repeat(60));
  console.log();

  if (!options.console && !options.executor) {
    console.log(colors.green("Services:"));
    console.log(`  Console:   ${colors.cyan(config.consoleUrl)}`);
    if (config.useLocalExecutor) {
      console.log(`  Executor:  ${colors.cyan(config.executorUrl)} ${colors.dim("(local)")}`);
    } else {
      console.log(`  Executor:  ${colors.cyan(config.executorUrl)} ${colors.dim("(remote)")}`);
    }
  } else if (options.console) {
    console.log(colors.green("Starting Console only:"));
    console.log(`  Console:   ${colors.cyan(config.consoleUrl)}`);
    console.log(`  Executor:  ${colors.cyan(config.executorUrl)}`);
  } else if (options.executor) {
    console.log(colors.green("Starting Executor only:"));
    console.log(`  Executor:  ${colors.cyan(config.executorUrl)}`);
  }

  console.log();
  console.log(colors.dim("Press Ctrl+C to stop.\n"));
}

async function startConsole(config: StartupConfig): Promise<void> {
  log.step(`Starting Console (Next.js) on port ${config.consolePort}...`);

  // Set dynamic environment variables
  const env = {
    ...process.env,
    PORT: String(config.consolePort),
    NEXT_PUBLIC_APP_URL: config.consoleUrl,
    BETTER_AUTH_URL: config.consoleUrl,
    EXECUTOR_BASE_URL: config.executorUrl,
    EXECUTOR_SIGNING_SECRET: config.signingSecret,
  };

  await $`cd ${projectRoot}/apps/console && bun dev`.env(env);
}

/**
 * 获取或生成签名密钥
 * 在本地开发时，如果没有配置 EXECUTOR_SIGNING_SECRET，自动生成一个临时密钥
 */
function getOrGenerateSigningSecret(): string {
  const existingSecret = process.env.EXECUTOR_SIGNING_SECRET;
  if (existingSecret) {
    return existingSecret;
  }

  // 生成一个临时的签名密钥用于本地开发
  const tempSecret = crypto.randomUUID() + crypto.randomUUID();
  log.info(`Generated temporary signing secret for local development`);
  return tempSecret;
}

async function startExecutor(config: StartupConfig): Promise<void> {
  log.step(`Starting Executor (Hono) on port ${config.executorPort}...`);

  const env = {
    ...process.env,
    PORT: String(config.executorPort),
    EXECUTOR_SIGNING_SECRET: config.signingSecret,
    EXECUTOR_BASE_URL: config.executorUrl,
  };

  await $`cd ${projectRoot}/apps/executor && bun dev`.env(env);
}

async function startAll(config: StartupConfig): Promise<void> {
  log.step("Starting all services...");

  // For Turbo, we set the environment variables that will be passed to both services
  const env = {
    ...process.env,
    // Shared env vars
    EXECUTOR_SIGNING_SECRET: config.signingSecret,
    // Console env vars
    NEXT_PUBLIC_APP_URL: config.consoleUrl,
    BETTER_AUTH_URL: config.consoleUrl,
    EXECUTOR_BASE_URL: config.executorUrl,
    // Executor env vars
    PORT: String(config.executorPort),
  };

  // When using turbo dev, both apps start with their respective configurations
  // We need to pass environment variables through
  await $`cd ${projectRoot} && bun dev`.env(env);
}

async function main(): Promise<void> {
  const options = parseOptions();

  if (options.help) {
    showHelp();
    return;
  }

  // Check environment
  if (isDopplerEnvironment()) {
    log.success(
      `Running with Doppler: ${colors.cyan(
        `${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG}`
      )}`
    );

    const { missing, warnings } = checkRequiredEnvVars();

    if (missing.length > 0) {
      log.error(`Missing required environment variables: ${missing.join(", ")}`);
      log.step("Check your Doppler configuration");
      process.exit(1);
    }

    for (const warn of warnings) {
      log.warn(warn);
    }
  } else {
    log.warn("Not running with Doppler - using .env files");
    log.step("For better experience, run: " + colors.cyan("doppler run -- make dev"));

    const envOk = await checkEnvFiles();
    if (!envOk) {
      process.exit(1);
    }
  }

  // Prepare startup configuration
  const config = await prepareStartup(options);

  // Show startup info
  showStartupInfo(config, options);

  // Start services
  try {
    if (options.console) {
      await startConsole(config);
    } else if (options.executor) {
      await startExecutor(config);
    } else {
      await startAll(config);
    }
  } catch (error) {
    // User pressed Ctrl+C or process was killed
    console.log("\n" + colors.yellow("Development server stopped."));
  }
}

main();
