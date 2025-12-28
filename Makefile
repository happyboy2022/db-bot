# =============================================================================
# SQL Ops Console - Makefile
# =============================================================================
# 简化的本地开发命令。所有环境变量通过 Doppler 管理。
#
# 快速开始:
#   make setup    # 首次设置（安装依赖 + 配置 Doppler）
#   make dev      # 启动开发环境（自动使用 Doppler）
#
# 更多命令请运行: make help
# =============================================================================

.PHONY: help setup install dev dev-console dev-executor dev-no-update dev-console-no-update dev-executor-no-update build lint typecheck test clean
.PHONY: db-generate db-push db-studio db-migrate db-seed db-unseed
.PHONY: generate-secret generate-executor-secret gen-ex sync-env sync-env-quiet sync-executor-env sync-executor-env-quiet sync-all-env
.PHONY: doppler-login doppler-setup doppler-status

# Default target
.DEFAULT_GOAL := help

# Colors
BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
CYAN := \033[36m
RED := \033[31m
RESET := \033[0m
BOLD := \033[1m

# 检测 Doppler 是否已配置
# 优先检查 .doppler.yaml 文件，如果不存在则检查 doppler configure 是否有项目配置
DOPPLER_CONFIGURED := $(shell [ -f .doppler.yaml ] && echo "yes" || (doppler configure --json 2>/dev/null | grep -q '"enclave.project"' && echo "yes" || echo "no"))

# 检测 .env.local 文件是否存在
CONSOLE_ENV_LOCAL := apps/console/.env.local
EXECUTOR_ENV_LOCAL := apps/executor/.env.local
ENV_LOCAL_EXISTS := $(shell [ -f $(CONSOLE_ENV_LOCAL) ] && echo "yes" || echo "no")

# Doppler 命令包装器 - 如果已配置则使用 doppler run
ifeq ($(DOPPLER_CONFIGURED),yes)
  DOPPLER_RUN := doppler run --
else
  DOPPLER_RUN :=
endif

# =============================================================================
# Help
# =============================================================================

help: ## 显示帮助信息
	@echo ""
	@echo "$(BOLD)$(BLUE)SQL Ops Console$(RESET) - 开发命令"
	@echo ""
ifeq ($(DOPPLER_CONFIGURED),yes)
	@echo "$(GREEN)✓$(RESET) Doppler 已配置 - 环境变量将自动注入"
else
	@echo "$(YELLOW)!$(RESET) Doppler 未配置 - 请先运行 $(CYAN)make setup$(RESET)"
endif
	@echo ""
	@echo "$(BOLD)$(YELLOW)快速开始:$(RESET)"
	@echo "  $(CYAN)make setup$(RESET)              首次项目设置"
	@echo "  $(CYAN)make dev$(RESET)                启动所有开发服务"
	@echo ""
	@echo "$(BOLD)$(YELLOW)开发命令:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '^(dev|install)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(YELLOW)构建 & 质量:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '^(build|lint|typecheck|test|clean)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(YELLOW)数据库:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '^db-' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(YELLOW)Doppler:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '^doppler-' | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# Setup & Installation
# =============================================================================

install: ## 安装依赖
	@bun install

setup: ## 首次项目设置（安装依赖 + 配置 Doppler）
	@echo "$(BOLD)$(BLUE)SQL Ops Console - 项目设置$(RESET)"
	@echo ""
	@echo "$(CYAN)步骤 1/3:$(RESET) 检查依赖..."
	@command -v bun >/dev/null 2>&1 || { echo "$(RED)✗$(RESET) 请先安装 Bun: https://bun.sh"; exit 1; }
	@echo "$(GREEN)✓$(RESET) Bun 已安装"
	@command -v doppler >/dev/null 2>&1 || { echo "$(YELLOW)!$(RESET) Doppler CLI 未安装，请运行: brew install dopplerhq/cli/doppler"; exit 1; }
	@echo "$(GREEN)✓$(RESET) Doppler CLI 已安装"
	@echo ""
	@echo "$(CYAN)步骤 2/3:$(RESET) 安装项目依赖..."
	@bun install
	@echo "$(GREEN)✓$(RESET) 依赖安装完成"
	@echo ""
	@echo "$(CYAN)步骤 3/3:$(RESET) 配置 Doppler..."
	@if [ ! -f .doppler.yaml ]; then \
		echo ""; \
		echo "$(YELLOW)请在接下来的提示中选择:$(RESET)"; \
		echo "  Project: $(CYAN)db-bot-console$(RESET)"; \
		echo "  Config:  $(CYAN)dev$(RESET)"; \
		echo ""; \
		doppler setup; \
	else \
		echo "$(GREEN)✓$(RESET) Doppler 已配置"; \
	fi
	@echo ""
	@echo "$(GREEN)$(BOLD)设置完成!$(RESET)"
	@echo ""
	@echo "$(YELLOW)下一步:$(RESET)"
	@echo "  运行 $(CYAN)make dev$(RESET) 启动开发环境"
	@echo ""

# =============================================================================
# Development
# =============================================================================

dev: _check-doppler _ensure-env _ensure-executor-env ## 启动所有开发服务（Console + Executor）
	@$(DOPPLER_RUN) bun scripts/dev.ts

dev-console: _check-doppler _ensure-env ## 仅启动 Console (端口 3000)
	@$(DOPPLER_RUN) bun scripts/dev.ts --console

dev-executor: _check-doppler _ensure-executor-env ## 仅启动 Executor (端口 8787)
	@$(DOPPLER_RUN) bun scripts/dev.ts --executor

dev-remote: _check-doppler _ensure-env ## 连接远程 Executor (用法: make dev-remote CLUSTER=dev)
ifndef CLUSTER
	@echo "$(BOLD)$(YELLOW)用法:$(RESET) make dev-remote CLUSTER=<集群名称>"
	@echo ""
	@echo "$(BOLD)$(YELLOW)可用集群:$(RESET)"
	@echo "  dev       开发环境"
	@echo "  pre       预发布环境"
	@echo "  sg-1      新加坡集群 1"
	@echo "  us-1      美国集群 1"
	@echo ""
	@echo "$(BOLD)$(YELLOW)示例:$(RESET)"
	@echo "  make dev-remote CLUSTER=dev"
else
	@$(DOPPLER_RUN) bun scripts/dev.ts --remote-cluster $(CLUSTER) --console
endif

# Internal target to check Doppler configuration
_check-doppler:
ifeq ($(DOPPLER_CONFIGURED),no)
	@echo "$(YELLOW)!$(RESET) Doppler 未配置"
	@echo ""
	@echo "请先运行: $(CYAN)make setup$(RESET)"
	@echo ""
	@echo "或手动配置:"
	@echo "  1. $(CYAN)doppler login$(RESET)"
	@echo "  2. $(CYAN)doppler setup$(RESET) (选择 db-bot-console / dev)"
	@echo ""
	@exit 1
endif

# Internal target to ensure Console .env.local exists and is up-to-date
# 默认行为：每次启动时自动更新环境变量（调用 sync-env）
# 如果设置了 SKIP_ENV_UPDATE=1，则跳过更新（仅当文件不存在时才同步）
_ensure-env:
ifeq ($(DOPPLER_CONFIGURED),yes)
	@if [ ! -f $(CONSOLE_ENV_LOCAL) ]; then \
		echo "$(CYAN)→$(RESET) Console .env.local 不存在，正在从 Doppler 同步..."; \
		$(MAKE) sync-env-quiet; \
	elif [ "$(SKIP_ENV_UPDATE)" = "1" ]; then \
		echo "$(GREEN)✓$(RESET) Console .env.local 已存在（跳过更新）"; \
	else \
		echo "$(CYAN)→$(RESET) 更新 Console .env.local..."; \
		$(MAKE) sync-env-quiet; \
		echo "$(GREEN)✓$(RESET) Console 环境变量已更新"; \
	fi
endif

# Internal target to ensure Executor .env.local exists and is up-to-date
_ensure-executor-env:
ifeq ($(DOPPLER_CONFIGURED),yes)
	@if [ ! -f $(EXECUTOR_ENV_LOCAL) ]; then \
		echo "$(CYAN)→$(RESET) Executor .env.local 不存在，正在从 Doppler 同步..."; \
		$(MAKE) sync-executor-env-quiet; \
	elif [ "$(SKIP_ENV_UPDATE)" = "1" ]; then \
		echo "$(GREEN)✓$(RESET) Executor .env.local 已存在（跳过更新）"; \
	else \
		echo "$(CYAN)→$(RESET) 更新 Executor .env.local..."; \
		$(MAKE) sync-executor-env-quiet; \
		echo "$(GREEN)✓$(RESET) Executor 环境变量已更新"; \
	fi
endif

# =============================================================================
# Build & Quality
# =============================================================================

build: ## 构建所有包
	@bun run build

lint: ## 运行代码检查
	@bun run lint

typecheck: ## 运行类型检查
	@bun run typecheck

test: ## 运行测试
	@bun run test

clean: ## 清理构建产物和 node_modules
	@rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@rm -rf apps/console/.next apps/executor/dist
	@echo "$(GREEN)✓$(RESET) 已清理构建产物"

# =============================================================================
# Database (Drizzle)
# =============================================================================

db-generate: _check-doppler ## 从 schema 变更生成迁移文件
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun db:generate'

db-push: _check-doppler ## 推送 schema 变更到数据库（开发用）
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun db:push'

db-studio: _check-doppler ## 打开 Drizzle Studio（数据库浏览器）
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun db:studio'

db-migrate: _check-doppler ## 运行待执行的迁移（生产用）
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun drizzle-kit migrate'

db-seed: _check-doppler ## 创建本地开发管理员账户
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun db:seed'

db-unseed: _check-doppler ## 删除本地开发管理员账户
	@$(DOPPLER_RUN) sh -c 'cd apps/console && bun db:unseed'

# =============================================================================
# Utilities
# =============================================================================

generate-secret: ## 生成 BETTER_AUTH_SECRET（添加到 Doppler）
	@bun scripts/generate-secret.ts

generate-executor-secret: ## 生成 EXECUTOR_SIGNING_SECRET（添加到 Doppler）
	@bun scripts/generate-executor-secret.ts

gen-ex: generate-executor-secret ## 生成 EXECUTOR_SIGNING_SECRET（简化版命令）

sync-env: _check-doppler ## 从 Doppler 同步 Console 环境变量到 .env.local
	@bun scripts/sync-env.ts

# 静默版本的 sync-env（用于自动更新，显示关键信息但减少冗余输出）
sync-env-quiet: _check-doppler
	@bun scripts/sync-env.ts 2>&1 | grep -vE "(项目:|配置:|从 Doppler|📦|⚙️)" | head -10 || true

sync-executor-env: _check-doppler ## 从 Doppler 同步 Executor 环境变量到 .env.local
	@$(DOPPLER_RUN) bun scripts/sync-executor-env.ts

# 静默版本
sync-executor-env-quiet: _check-doppler
	@$(DOPPLER_RUN) bun scripts/sync-executor-env.ts --quiet

sync-all-env: _check-doppler ## 同步 Console 和 Executor 的所有环境变量
	@echo "$(CYAN)→$(RESET) 同步 Console 环境变量..."
	@$(MAKE) sync-env-quiet
	@echo "$(CYAN)→$(RESET) 同步 Executor 环境变量..."
	@$(MAKE) sync-executor-env-quiet
	@echo "$(GREEN)✓$(RESET) 所有环境变量已同步"

# 跳过环境变量更新的开发命令（使用现有的 .env.local，不更新）
dev-no-update: _check-doppler ## 启动开发服务但不更新环境变量
	@SKIP_ENV_UPDATE=1 $(MAKE) dev

dev-console-no-update: _check-doppler ## 启动 Console 但不更新环境变量
	@SKIP_ENV_UPDATE=1 $(MAKE) dev-console

dev-executor-no-update: _check-doppler ## 启动 Executor 但不更新环境变量
	@SKIP_ENV_UPDATE=1 $(MAKE) dev-executor

# =============================================================================
# Doppler Management
# =============================================================================

doppler-login: ## 登录 Doppler
	@doppler login

doppler-setup: ## 配置 Doppler 项目
	@echo "$(BOLD)$(YELLOW)配置 Doppler...$(RESET)"
	@echo ""
	@echo "请选择以下选项:"
	@echo "  Project: $(CYAN)db-bot-console$(RESET)"
	@echo "  Config:  $(CYAN)dev$(RESET)"
	@echo ""
	@doppler setup

doppler-status: ## 显示当前 Doppler 配置状态
	@if [ -f .doppler.yaml ]; then \
		echo "$(GREEN)✓$(RESET) Doppler 已配置"; \
		echo ""; \
		cat .doppler.yaml; \
	else \
		echo "$(YELLOW)!$(RESET) Doppler 未配置"; \
		echo ""; \
		echo "请运行: $(CYAN)make doppler-setup$(RESET)"; \
	fi
