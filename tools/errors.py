#!/usr/bin/env python3
"""
Hermes Agents — 统一错误处理模块

提供结构化的错误码、友好的错误信息和修复建议。

用法:
    from errors import HermesError, ErrorCode, handle_error

    raise HermesError(
        code=ErrorCode.AGENT_NOT_FOUND,
        message="Agent 'coder' 不存在",
        hint="使用 'hermes agent list' 查看所有可用 Agent"
    )
"""

import sys
from enum import Enum
from typing import Optional


class ErrorCode(Enum):
    PROJECT_NOT_FOUND = 1
    SUITE_NOT_FOUND = 2
    SUITE_EXISTS = 3
    AGENT_NOT_FOUND = 4
    AGENT_EXISTS = 5
    INVALID_CONFIG = 6
    YAML_PARSE_ERROR = 7
    PERMISSION_DENIED = 8
    FILE_NOT_FOUND = 9
    EDITOR_NOT_FOUND = 10
    IMPORT_FAILED = 11
    EXPORT_FAILED = 12
    NO_AGENTS = 13


class HermesError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        hint: Optional[str] = None,
        details: Optional[str] = None
    ):
        self.code = code
        self.message = message
        self.hint = hint
        self.details = details
        super().__init__(message)

    def print_error(self, verbose: bool = False):
        print(f"\n❌ 错误 [{self.code.name}]: {self.message}", file=sys.stderr)
        if self.hint:
            print(f"💡 提示: {self.hint}", file=sys.stderr)
        if verbose and self.details:
            print(f"\n📋 详细信息:\n{self.details}", file=sys.stderr)
        print(file=sys.stderr)


def handle_error(error: HermesError, verbose: bool = False):
    error.print_error(verbose=verbose)
    sys.exit(error.code.value)


def success(message: str, hint: Optional[str] = None):
    print(f"✅ {message}")
    if hint:
        print(f"💡 {hint}")


def warning(message: str, hint: Optional[str] = None):
    print(f"⚠️  警告: {message}", file=sys.stderr)
    if hint:
        print(f"💡 提示: {hint}", file=sys.stderr)


def info(message: str):
    print(f"ℹ️  {message}")
