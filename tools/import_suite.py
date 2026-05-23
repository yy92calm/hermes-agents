#!/usr/bin/env python3
"""
Hermes Agents Suite Import Tool

将指定方案从 suites/ 目录导入到 OpenCode 项目。

用法:
    python tools/import_suite.py hermes-fullstack --target /path/to/project
    python tools/import_suite.py lite-review    --target .
    python tools/import_suite.py --list

功能:
    1. 自动检测 hermes-agents 项目根目录（脚本本身所在的上级目录）
    2. 从 suites/<方案>/.opencode/agents/ 读取 agent .md 文件
    3. 解析 YAML frontmatter 提取配置
    4. 复制 agent .md 到目标项目 .opencode/agents/
    5. 合并更新目标项目 opencode.json 的 agents 字段
    6. 自动同步到项目自身的 suites/ 目录
    7. 导入失败时自动回滚
"""

import argparse
import sys
from pathlib import Path

# 从共享模块导入
from _shared import (
    parse_frontmatter,
    detect_project_root,
    list_suites,
    read_agent_files,
    ensure_opencode_dirs,
    copy_agent_files,
    update_opencode_json,
    validate_frontmatter,
    sync_to_root_suites,
    uninstall_suite,
)


class ImportRollback:
    """导入回滚管理器。记录所有操作，失败时回滚。"""

    def __init__(self):
        self._actions = []  # [(type, path), ...]
        self._json_backup = None
        self._json_path = None

    def record_copy(self, dest_path: Path):
        self._actions.append(('copy', dest_path))

    def record_json_backup(self, json_path: Path, content: str):
        self._json_backup = content
        self._json_path = json_path

    def rollback(self):
        """回滚所有已执行的操作。"""
        if self._json_backup and self._json_path:
            try:
                self._json_path.write_text(self._json_backup, encoding='utf-8')
                print(f"  [回滚] 已恢复 {self._json_path}")
            except Exception as e:
                print(f"  [回滚失败] 无法恢复 opencode.json: {e}", file=sys.stderr)

        for action_type, path in reversed(self._actions):
            if action_type == 'copy' and path.exists():
                try:
                    path.unlink()
                    print(f"  [回滚] 已删除 {path}")
                except Exception as e:
                    print(f"  [回滚失败] 无法删除 {path}: {e}", file=sys.stderr)


def import_suite(suite_name: str, target_dir: Path, sync_root: bool = True) -> bool:
    """执行完整的导入流程。

    Args:
        suite_name: 方案名称
        target_dir: 目标 OpenCode 项目路径
        sync_root: 是否同步到项目自身的 suites/ 目录

    Returns:
        成功返回 True，失败返回 False
    """
    rollback = ImportRollback()

    try:
        project_root = detect_project_root()
    except FileNotFoundError as e:
        print(f"错误: {e}", file=sys.stderr)
        return False

    suite_dir = project_root / 'suites' / suite_name
    agents_path = suite_dir / '.opencode' / 'agents'

    if not agents_path.is_dir():
        print(f"错误: 方案 '{suite_name}' 不存在或 agent 文件夹缺失。", file=sys.stderr)
        available = list_suites(project_root)
        print(f"可用方案: {', '.join(available)}", file=sys.stderr)
        return False

    if not target_dir.exists():
        print(f"错误: 目标目录 '{target_dir}' 不存在。", file=sys.stderr)
        return False

    # 读取
    print(f"读取方案 '{suite_name}' ...")
    agents = read_agent_files(suite_dir)
    print(f"  找到 {len(agents)} 个 Agent:")
    for a in agents:
        issues = validate_frontmatter(a['frontmatter'], a['filename'])
        status = ' ⚠️ ' + '; '.join(issues) if issues else ''
        print(f"    - {a['stem']}: {a['frontmatter'].get('description', 'N/A')}{status}")

    # 备份目标 opencode.json（用于回滚）
    json_path = target_dir / 'opencode.json'
    if json_path.exists():
        rollback.record_json_backup(json_path, json_path.read_text(encoding='utf-8'))

    # 复制 agent 文件
    ensure_opencode_dirs(target_dir)
    copied = []
    try:
        copied = copy_agent_files(agents, target_dir)
        for c in copied:
            rollback.record_copy(target_dir / '.opencode' / 'agents' / c)
    except Exception as e:
        print(f"\n错误: 复制文件失败: {e}", file=sys.stderr)
        rollback.rollback()
        return False

    print(f"\n已复制 {len(copied)} 个文件到 {target_dir}/.opencode/agents/:")
    for f in copied:
        print(f"    {f}")

    # 更新 opencode.json
    try:
        registered = update_opencode_json(agents, target_dir)
        print(f"\n已更新 {json_path}")
        print(f"  注册 {len(registered)} 个 Agent: {', '.join(registered)}")
    except Exception as e:
        print(f"\n错误: 更新 opencode.json 失败: {e}", file=sys.stderr)
        rollback.rollback()
        return False

    # 同步到项目自身的 suites/ 目录
    if sync_root:
        try:
            synced = sync_to_root_suites(agents, suite_name, project_root)
            print(f"\n已同步 {len(synced)} 个文件到 suites/{suite_name}/.opencode/agents/:")
            for f in synced:
                print(f"    {f}")
        except Exception as e:
            print(f"\n警告: 同步到 suites/ 失败: {e}", file=sys.stderr)
            print("  导入目标项目已完成，可手动同步。")

    print(f"\n导入完成! 请在 OpenCode 中执行 /agents reload 使配置生效。")
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Hermes Agents Suite 导入工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python tools/import_suite.py hermes-fullstack --target /path/to/my-project
  python tools/import_suite.py lite-review --target .
  python tools/import_suite.py --list
  python tools/import_suite.py --uninstall --target /path/to/my-project
        '''
    )
    parser.add_argument('suite', nargs='?', help='方案名称')
    parser.add_argument('--target', '-t', default='.', help='目标 OpenCode 项目路径（默认当前目录）')
    parser.add_argument('--list', '-l', action='store_true', help='列出所有可用方案')
    parser.add_argument('--uninstall', '-u', action='store_true', help='卸载目标项目的所有 agent 配置')
    parser.add_argument('--no-sync', action='store_true', help='不同步到项目自身的 suites/ 目录')

    args = parser.parse_args()

    if args.list:
        try:
            project_root = detect_project_root()
        except FileNotFoundError as e:
            print(f"错误: {e}", file=sys.stderr)
            sys.exit(1)
        suites = list_suites(project_root)
        print(f"可用方案 ({len(suites)}):")
        for s in suites:
            agents = read_agent_files(project_root / 'suites' / s)
            names = [a['stem'] for a in agents]
            print(f"  {s}: {', '.join(names)}")
        return

    if args.uninstall:
        target_dir = Path(args.target).resolve()
        if not target_dir.exists():
            print(f"错误: 目标目录 '{target_dir}' 不存在。", file=sys.stderr)
            sys.exit(1)

        deleted, json_ok = uninstall_suite(target_dir)
        print(f"卸载完成!")
        if deleted:
            print(f"  已删除 {len(deleted)} 个 agent 文件:")
            for f in deleted:
                print(f"    - {f}")
        else:
            print("  未找到 agent 文件")
        if json_ok:
            print("  已清空 opencode.json 中的 agents 配置")
        print("\n请在 OpenCode 中执行 /agents reload 使配置生效。")
        sys.exit(0)

    if not args.suite:
        parser.print_help()
        sys.exit(1)

    target_dir = Path(args.target).resolve()
    success = import_suite(args.suite, target_dir, sync_root=not args.no_sync)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
