#!/bin/bash
# 兼容旧习惯的入口：实际逻辑都在 deploy.mjs（跨平台，Mac/Windows 通用）。
# 用法：./deploy.sh [home|blog|all]
set -e
cd "$(dirname "$0")"
exec node deploy.mjs "${1:-all}"
