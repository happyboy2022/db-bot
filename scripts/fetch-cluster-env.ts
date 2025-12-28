#!/usr/bin/env bun
/**
 * Fetch Executor Cluster Environment Variables via Doppler API
 *
 * 此脚本通过 Doppler API 获取指定集群的 Executor 环境变量，
 * 以及通过 TARGET_DB_DOPPLER_TOKEN 获取目标数据库配置。
 *
 * Usage:
 *   bun scripts/fetch-cluster-env.ts [cluster] [options]
 *
 * Clusters:
 *   dev       开发环境 (默认)
 *   pre       预发布环境
 *   sg-1      新加坡集群 1
 *   sg-2      新加坡集群 2
 *   us-1      美国集群 1
 *   ...
 *
 * Options:
 *   --json        Output as JSON
 *   --all         Fetch all environment variables
 *   --target-db   Fetch target database configuration (via TARGET_DB_DOPPLER_TOKEN)
 *
 * Examples:
 *   bun scripts/fetch-cluster-env.ts           # 获取 dev 集群配置
 *   bun scripts/fetch-cluster-env.ts sg-1      # 获取新加坡集群 1 配置
 *   bun scripts/fetch-cluster-env.ts dev --target-db  # 获取目标数据库配置
 *   bun scripts/fetch-cluster-env.ts --json    # 以 JSON 格式输出
 */

import { parseArgs } from "util";

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
};

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

// Environment variables to fetch from Executor's Doppler config
const EXECUTOR_ENV_KEYS = [
  "CLUSTER_NAME",
  "EXECUTOR_API_TOKEN",
  "EXECUTOR_SIGNING_SECRET",
  "EXECUTOR_BASE_URL",
  "PORT",
  "TARGET_DB_DOPPLER_TOKEN",
];

// Environment variables in target database Doppler project
const TARGET_DB_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_ADB",
  "REDIS_URL",
];

interface DopplerSecret {
  raw: string;
  computed: string;
  note: string;
}

interface DopplerSecretsResponse {
  secrets: Record<string, DopplerSecret>;
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
function getClusterToken(cluster: string): string {
  const tokenEnvVar = CLUSTER_TOKEN_MAP[cluster];
  if (!tokenEnvVar) {
    throw new Error(
      `Unknown cluster: ${cluster}. Available clusters: ${Object.keys(CLUSTER_TOKEN_MAP).join(", ")}`
    );
  }

  const token = process.env[tokenEnvVar];
  if (!token) {
    throw new Error(
      `${tokenEnvVar} not found in environment. ` +
        `Make sure you're running with Doppler: doppler run -- bun scripts/fetch-cluster-env.ts ${cluster}`
    );
  }

  return token;
}

interface Options {
  cluster: string;
  json: boolean;
  all: boolean;
  targetDb: boolean;
  help: boolean;
}

function parseOptions(): Options {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      json: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      "target-db": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  return {
    cluster: positionals[0] || "dev",
    json: values.json || false,
    all: values.all || false,
    targetDb: values["target-db"] || false,
    help: values.help || false,
  };
}

function showHelp(): void {
  console.log(`
${colors.blue("Fetch Executor Cluster Environment Variables")}

${colors.yellow("Usage:")}
  bun scripts/fetch-cluster-env.ts [cluster] [options]

${colors.yellow("Arguments:")}
  cluster          Cluster name (default: dev)

${colors.yellow("Available Clusters:")}
${Object.keys(CLUSTER_TOKEN_MAP)
  .map((c) => `  ${colors.cyan(c.padEnd(10))} ${CLUSTER_TOKEN_MAP[c]}`)
  .join("\n")}

${colors.yellow("Options:")}
  --json           Output as JSON
  --all            Fetch all environment variables (not just filtered)
  --target-db      Fetch target database configuration
                   (via TARGET_DB_DOPPLER_TOKEN in the cluster config)
  --help, -h       Show this help message

${colors.yellow("Examples:")}
  bun scripts/fetch-cluster-env.ts              # Fetch dev cluster config
  bun scripts/fetch-cluster-env.ts sg-1         # Fetch Singapore cluster 1
  bun scripts/fetch-cluster-env.ts dev --json   # Output as JSON
  bun scripts/fetch-cluster-env.ts dev --target-db  # Fetch target DB config

${colors.yellow("Target Database Configuration:")}
  When using --target-db, the script will:
  1. Fetch the cluster config to get TARGET_DB_DOPPLER_TOKEN
  2. Use that token to fetch the target database configuration:
     - DATABASE_URL      (PolarDB MySQL)
     - DATABASE_URL_ADB  (AnalyticDB)
     - REDIS_URL         (Redis)

${colors.yellow("Architecture:")}
  db-bot-console
  └── CLUSTER_DOPPLER_TOKEN_* ──▶ db-bot-executor/{cluster}
                                  └── TARGET_DB_DOPPLER_TOKEN ──▶ target-db-project
                                                                  ├── DATABASE_URL
                                                                  ├── DATABASE_URL_ADB
                                                                  └── REDIS_URL

${colors.yellow("Note:")}
  This script requires CLUSTER_DOPPLER_TOKEN_* to be set in the environment.
  Run with Doppler: ${colors.cyan("doppler run -- bun scripts/fetch-cluster-env.ts")}
`);
}

/**
 * Mask sensitive values for display
 */
function maskSensitiveValue(key: string, value: string): string {
  const sensitivePatterns = ["SECRET", "PASSWORD", "TOKEN", "KEY", "URL"];
  const isSensitive = sensitivePatterns.some((pattern) =>
    key.toUpperCase().includes(pattern)
  );

  if (!isSensitive) {
    return colors.green(value);
  }

  // For URLs, show host but mask credentials
  if (key.includes("URL") && value.includes("://")) {
    try {
      const url = new URL(value);
      const maskedUrl = `${url.protocol}//${url.username ? "****:****@" : ""}${url.host}${url.pathname}`;
      return colors.dim(maskedUrl);
    } catch {
      return colors.dim("********");
    }
  }

  return colors.dim("********");
}

/**
 * Display secrets in a formatted way
 */
function displaySecrets(
  secrets: Record<string, string>,
  title: string,
  filterKeys?: string[]
): void {
  const filtered = filterKeys
    ? Object.fromEntries(
        Object.entries(secrets).filter(([key]) =>
          filterKeys.some((k) => key.startsWith(k.split("_")[0]) || key === k)
        )
      )
    : secrets;

  console.log("\n" + colors.yellow(title));
  console.log("─".repeat(60));

  for (const [key, value] of Object.entries(filtered)) {
    const displayValue = maskSensitiveValue(key, value);
    console.log(`  ${colors.cyan(key)}: ${displayValue}`);
  }

  console.log("\n" + colors.dim(`Total: ${Object.keys(filtered).length} variables`));
}

async function main(): Promise<void> {
  const options = parseOptions();

  if (options.help) {
    showHelp();
    return;
  }

  try {
    // Step 1: Get cluster token and fetch cluster config
    const clusterToken = getClusterToken(options.cluster);

    if (!options.json) {
      log.info(`Fetching environment for cluster: ${colors.cyan(options.cluster)}`);
    }

    const clusterSecrets = await fetchDopplerSecrets(clusterToken);

    // Step 2: If --target-db, fetch target database config
    if (options.targetDb) {
      const targetDbToken = clusterSecrets.TARGET_DB_DOPPLER_TOKEN;

      if (!targetDbToken) {
        throw new Error(
          `TARGET_DB_DOPPLER_TOKEN not found in cluster ${options.cluster} config. ` +
            `Make sure it's configured in the Executor's Doppler project.`
        );
      }

      if (!options.json) {
        log.info("Fetching target database configuration...");
      }

      const targetDbSecrets = await fetchDopplerSecrets(targetDbToken);

      if (options.json) {
        // Filter to only DB-related variables
        const filtered = options.all
          ? targetDbSecrets
          : Object.fromEntries(
              Object.entries(targetDbSecrets).filter(([key]) =>
                TARGET_DB_ENV_KEYS.includes(key)
              )
            );
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        displaySecrets(
          targetDbSecrets,
          `Target Database Configuration (${options.cluster}):`,
          options.all ? undefined : TARGET_DB_ENV_KEYS
        );
      }

      return;
    }

    // Step 3: Display cluster config
    if (options.json) {
      const filtered = options.all
        ? clusterSecrets
        : Object.fromEntries(
            Object.entries(clusterSecrets).filter(([key]) =>
              EXECUTOR_ENV_KEYS.includes(key)
            )
          );
      console.log(JSON.stringify(filtered, null, 2));
    } else {
      displaySecrets(
        clusterSecrets,
        `Cluster Environment Variables (${options.cluster}):`,
        options.all ? undefined : EXECUTOR_ENV_KEYS
      );

      // Hint about target-db option
      if (clusterSecrets.TARGET_DB_DOPPLER_TOKEN) {
        console.log(
          colors.dim(
            `\nTip: Use --target-db to fetch target database configuration`
          )
        );
      }
    }
  } catch (error) {
    if (options.json) {
      console.error(JSON.stringify({ error: String(error) }));
    } else {
      log.error(String(error));
    }
    process.exit(1);
  }
}

main();

// Export for use as a module
export {
  fetchDopplerSecrets,
  getClusterToken,
  CLUSTER_TOKEN_MAP,
  EXECUTOR_ENV_KEYS,
  TARGET_DB_ENV_KEYS,
};
