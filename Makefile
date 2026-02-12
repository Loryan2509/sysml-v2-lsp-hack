.PHONY: help install generate build watch test test-e2e lint package package-server clean update-grammar ci

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	npm install

generate: ## Generate TypeScript parser from ANTLR4 grammar
	npm run generate

build: ## Compile TypeScript and bundle with esbuild
	npm run build

watch: ## Watch mode for development
	npm run watch

test: ## Run unit tests (vitest)
	npm run test

test-e2e: ## Run VS Code E2E tests
	npm run test:e2e

lint: ## Run ESLint
	npm run lint

package: ## Build VSIX for distribution
	npm run package

package-server: ## Build server tarball for use in other extensions
	npm run package:server
	@echo ""
	@echo "✅ Server package created:"
	@ls -lh sysml-v2-lsp-*.tgz
	@echo ""
	@echo "Install in your extension with:"
	@echo "  npm install ./path/to/sysml-v2-lsp-*.tgz"
	@echo "  — or —"
	@echo "  npm install github:daltskin/sysml-v2-lsp"

clean: ## Clean build artifacts
	npm run clean

update-grammar: ## Pull latest grammar from daltskin/sysml-v2-grammar
	npm run update-grammar

ci: lint build test ## Full CI pipeline
