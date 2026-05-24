#!/usr/bin/env python3
"""
Hermes Agents CLI — OpenCode 多 Agent 配置管理命令行工具

用法:
    hermes suite list                    # 列出所有可用方案
    hermes suite use hermes-fullstack    # 切换到指定方案
    hermes suite uninstall              # 卸载当前方案
    
    hermes agent list                   # 列出当前方案的 Agent
    hermes agent show coder             # 显示 Agent 详情
    hermes agent create my-agent        # 创建新 Agent
    hermes agent edit coder             # 编辑 Agent（打开编辑器）
    hermes agent delete my-agent        # 删除 Agent
    
    hermes validate                     # 验证配置
    hermes export my-suite.json         # 导出为 JSON
    hermes import my-suite.json         # 从 JSON 导入
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

# 添加 tools 目录到路径
sys.path.insert(0, str(Path(__file__).parent / 'tools'))

from _shared import (
    parse_frontmatter,
    detect_project_root,
    list_suites,
    read_agent_files,
    ensure_opencode_dirs,
    copy_agent_files,
    update_opencode_json,
    uninstall_suite,
)


class HermesCLI:
    def __init__(self):
        self.project_root: Optional[Path] = None
        self._detect_project()
    
    def _detect_project(self):
        try:
            self.project_root = detect_project_root()
        except FileNotFoundError:
            pass
    
    def _require_project(self):
        if not self.project_root:
            print("错误: 未找到 hermes-agents 项目。", file=sys.stderr)
            print("请在 hermes-agents 项目目录或其子目录中运行此命令。", file=sys.stderr)
            sys.exit(1)
    
    def _get_current_agents(self) -> list[dict]:
        if not self.project_root:
            return []
        agents_dir = self.project_root / '.opencode' / 'agents'
        if not agents_dir.is_dir():
            return []
        
        agents = []
        for md_file in sorted(agents_dir.glob('*.md')):
            content = md_file.read_text(encoding='utf-8')
            fm = parse_frontmatter(content)
            agents.append({
                'stem': md_file.stem,
                'filename': md_file.name,
                'frontmatter': fm,
                'content': content,
            })
        return agents
    
    def _print_agent_table(self, agents: list[dict]):
        if not agents:
            print("  无 Agent")
            return
        
        print(f"  {'名称':<20} {'模式':<10} {'描述':<50}")
        print(f"  {'-'*20} {'-'*10} {'-'*50}")
        for a in sorted(agents, key=lambda x: x['stem']):
            fm = a['frontmatter']
            mode = fm.get('mode', 'subagent')
            desc = fm.get('description', 'N/A')[:47] + '...' if len(fm.get('description', '')) > 50 else fm.get('description', 'N/A')
            print(f"  {a['stem']:<20} {mode:<10} {desc:<50}")


class SuiteCommands:
    def __init__(self, cli: HermesCLI):
        self.cli = cli
    
    def list(self, args):
        self.cli._require_project()
        suites = list_suites(self.cli.project_root)
        
        if not suites:
            print("未找到任何方案。")
            return
        
        print(f"可用方案 ({len(suites)}):")
        print()
        
        for suite_name in sorted(suites):
            suite_dir = self.cli.project_root / 'suites' / suite_name
            agents = read_agent_files(suite_dir)
            
            primary = next((a for a in agents if a['frontmatter'].get('mode') == 'primary'), None)
            primary_name = primary['stem'] if primary else 'N/A'
            
            print(f"  📦 {suite_name}")
            print(f"     Agent 数量: {len(agents)}")
            print(f"     主代理: {primary_name}")
            
            modes = [a['frontmatter'].get('mode', 'subagent') for a in agents]
            print(f"     模式分布: {modes.count('primary')} primary, {modes.count('subagent')} subagent")
            print()
    
    def use(self, args):
        self.cli._require_project()
        suite_name = args.suite
        
        from import_suite import import_suite
        success = import_suite(suite_name, self.cli.project_root, sync_root=False)
        sys.exit(0 if success else 1)
    
    def uninstall(self, args):
        self.cli._require_project()
        deleted, json_ok = uninstall_suite(self.cli.project_root)
        
        print("卸载完成!")
        if deleted:
            print(f"  已删除 {len(deleted)} 个 agent 文件:")
            for f in deleted:
                print(f"    - {f}")
        else:
            print("  未找到 agent 文件")
        
        if json_ok:
            print("  已清空 opencode.json 中的 agents 配置")
        
        print("\n请在 OpenCode 中执行 /agents reload 使配置生效。")


class AgentCommands:
    def __init__(self, cli: HermesCLI):
        self.cli = cli
    
    def list(self, args):
        self.cli._require_project()
        agents = self.cli._get_current_agents()
        
        if not agents:
            print("当前无 Agent 配置。")
            print("使用 'hermes suite use <方案名>' 导入方案。")
            return
        
        print(f"当前 Agent ({len(agents)}):")
        print()
        self.cli._print_agent_table(agents)
    
    def show(self, args):
        self.cli._require_project()
        agent_name = args.name
        
        agent_file = self.cli.project_root / '.opencode' / 'agents' / f'{agent_name}.md'
        if not agent_file.exists():
            print(f"错误: Agent '{agent_name}' 不存在。", file=sys.stderr)
            sys.exit(1)
        
        content = agent_file.read_text(encoding='utf-8')
        fm = parse_frontmatter(content)
        
        print(f"Agent: {agent_name}")
        print("=" * 60)
        print()
        
        print("基本信息:")
        for key in ['description', 'model', 'mode', 'color', 'temperature', 'max_iterations']:
            if key in fm:
                print(f"  {key}: {fm[key]}")
        
        print()
        print("工具权限:")
        tools = fm.get('tools', {})
        enabled = [k for k, v in tools.items() if v]
        print(f"  {', '.join(enabled) if enabled else '无'}")
        
        print()
        print("技能:")
        skills = fm.get('skills', [])
        if skills:
            for s in skills:
                print(f"  - {s}")
        else:
            print("  无")
        
        print()
        print("权限配置:")
        perms = fm.get('permissions', {})
        for key in ['skill', 'edit', 'bash', 'webfetch']:
            print(f"  {key}: {perms.get(key, 'deny')}")
        
        print()
        print("系统提示词:")
        prompt_start = content.find('---', 3)
        if prompt_start != -1:
            prompt = content[prompt_start + 3:].strip()
            lines = prompt.split('\n')[:10]
            for line in lines:
                print(f"  {line}")
            if len(prompt.split('\n')) > 10:
                print("  ...")
    
    def create(self, args):
        self.cli._require_project()
        agent_name = args.name
        
        agent_file = self.cli.project_root / '.opencode' / 'agents' / f'{agent_name}.md'
        if agent_file.exists():
            print(f"错误: Agent '{agent_name}' 已存在。", file=sys.stderr)
            sys.exit(1)
        
        template = f'''---
description: {agent_name} - 新建 Agent
model: opencode/gpt-5.1-codex
mode: subagent
color: "#3498DB"
temperature: 0.2
max_iterations: 20
tools:
  read: true
  list: true
  grep: true
  glob: true
skills: []
permissions:
  skill: deny
  edit: deny
  bash: deny
  webfetch: deny
---

# {agent_name.title()}

## 角色定位

TODO: 描述 Agent 的角色和职责。

## 工作流程

TODO: 描述 Agent 的工作流程。
'''
        
        ensure_opencode_dirs(self.cli.project_root)
        agent_file.write_text(template, encoding='utf-8')
        
        print(f"已创建 Agent: {agent_name}")
        print(f"文件: {agent_file}")
        print()
        print("请编辑文件完善配置，然后运行:")
        print(f"  hermes agent edit {agent_name}")
    
    def edit(self, args):
        self.cli._require_project()
        agent_name = args.name
        
        agent_file = self.cli.project_root / '.opencode' / 'agents' / f'{agent_name}.md'
        if not agent_file.exists():
            print(f"错误: Agent '{agent_name}' 不存在。", file=sys.stderr)
            sys.exit(1)
        
        editor = os.environ.get('EDITOR', 'vim')
        try:
            subprocess.run([editor, str(agent_file)])
        except FileNotFoundError:
            print(f"错误: 找不到编辑器 '{editor}'。", file=sys.stderr)
            print(f"请手动编辑文件: {agent_file}", file=sys.stderr)
            sys.exit(1)
    
    def delete(self, args):
        self.cli._require_project()
        agent_name = args.name
        
        if not args.force:
            confirm = input(f"确认删除 Agent '{agent_name}'? [y/N] ")
            if confirm.lower() != 'y':
                print("已取消。")
                return
        
        agent_file = self.cli.project_root / '.opencode' / 'agents' / f'{agent_name}.md'
        if not agent_file.exists():
            print(f"错误: Agent '{agent_name}' 不存在。", file=sys.stderr)
            sys.exit(1)
        
        agent_file.unlink()
        
        json_path = self.cli.project_root / 'opencode.json'
        if json_path.exists():
            with open(json_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            if 'agents' in config and agent_name in config['agents']:
                del config['agents'][agent_name]
                
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2, ensure_ascii=False)
                    f.write('\n')
        
        print(f"已删除 Agent: {agent_name}")
        print("\n请在 OpenCode 中执行 /agents reload 使配置生效。")


class ConfigCommands:
    def __init__(self, cli: HermesCLI):
        self.cli = cli
    
    def validate(self, args):
        self.cli._require_project()
        
        from verify_suites import main as verify_main
        sys.argv = ['verify_suites.py']
        verify_main()
    
    def export(self, args):
        self.cli._require_project()
        output_file = Path(args.output)
        
        agents = self.cli._get_current_agents()
        if not agents:
            print("错误: 当前无 Agent 配置。", file=sys.stderr)
            sys.exit(1)
        
        suite_data = {
            'name': output_file.stem,
            'agents': []
        }
        
        for a in agents:
            fm = a['frontmatter']
            agent_data = {
                'name': a['stem'],
                'description': fm.get('description', ''),
                'model': fm.get('model', 'opencode/gpt-5.1-codex'),
                'mode': fm.get('mode', 'subagent'),
                'color': fm.get('color', '#3498DB'),
                'temperature': fm.get('temperature', 0.2),
                'max_iterations': fm.get('max_iterations', 20),
                'tools': fm.get('tools', {}),
                'skills': fm.get('skills', []),
                'permissions': fm.get('permissions', {}),
                'prompt': a['content'].split('---', 2)[-1].strip() if '---' in a['content'] else ''
            }
            suite_data['agents'].append(agent_data)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(suite_data, f, indent=2, ensure_ascii=False)
        
        print(f"已导出 {len(agents)} 个 Agent 到: {output_file}")
    
    def import_(self, args):
        self.cli._require_project()
        input_file = Path(args.input)
        
        if not input_file.exists():
            print(f"错误: 文件 '{input_file}' 不存在。", file=sys.stderr)
            sys.exit(1)
        
        with open(input_file, 'r', encoding='utf-8') as f:
            suite_data = json.load(f)
        
        agents = suite_data.get('agents', [])
        if not agents:
            print("错误: JSON 文件中未找到 agents。", file=sys.stderr)
            sys.exit(1)
        
        ensure_opencode_dirs(self.cli.project_root)
        agents_dir = self.cli.project_root / '.opencode' / 'agents'
        
        created = []
        for agent_data in agents:
            name = agent_data.get('name')
            if not name:
                continue
            
            lines = ['---']
            lines.append(f"description: {agent_data.get('description', '')}")
            lines.append(f"model: {agent_data.get('model', 'opencode/gpt-5.1-codex')}")
            lines.append(f"mode: {agent_data.get('mode', 'subagent')}")
            lines.append(f"color: {agent_data.get('color', '#3498DB')}")
            lines.append(f"temperature: {agent_data.get('temperature', 0.2)}")
            lines.append(f"max_iterations: {agent_data.get('max_iterations', 20)}")
            
            tools = agent_data.get('tools', {})
            if tools:
                lines.append('tools:')
                for k, v in tools.items():
                    lines.append(f"  {k}: {str(v).lower()}")
            
            skills = agent_data.get('skills', [])
            if skills:
                lines.append('skills:')
                for s in skills:
                    lines.append(f"  - {s}")
            
            perms = agent_data.get('permissions', {})
            if perms:
                lines.append('permissions:')
                for k, v in perms.items():
                    lines.append(f"  {k}: {v}")
            
            lines.append('---')
            lines.append('')
            lines.append(agent_data.get('prompt', ''))
            
            agent_file = agents_dir / f'{name}.md'
            agent_file.write_text('\n'.join(lines), encoding='utf-8')
            created.append(name)
        
        print(f"已导入 {len(created)} 个 Agent:")
        for name in created:
            print(f"  - {name}")
        
        print("\n请在 OpenCode 中执行 /agents reload 使配置生效。")


def main():
    parser = argparse.ArgumentParser(
        description='Hermes Agents CLI — OpenCode 多 Agent 配置管理工具',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest='command', help='命令')
    
    # Suite 命令
    suite_parser = subparsers.add_parser('suite', help='方案管理')
    suite_sub = suite_parser.add_subparsers(dest='suite_command')
    
    suite_list = suite_sub.add_parser('list', help='列出所有可用方案')
    suite_list.set_defaults(func=lambda args: SuiteCommands(HermesCLI()).list(args))
    
    suite_use = suite_sub.add_parser('use', help='切换到指定方案')
    suite_use.add_argument('suite', help='方案名称')
    suite_use.set_defaults(func=lambda args: SuiteCommands(HermesCLI()).use(args))
    
    suite_uninstall = suite_sub.add_parser('uninstall', help='卸载当前方案')
    suite_uninstall.set_defaults(func=lambda args: SuiteCommands(HermesCLI()).uninstall(args))
    
    # Agent 命令
    agent_parser = subparsers.add_parser('agent', help='Agent 管理')
    agent_sub = agent_parser.add_subparsers(dest='agent_command')
    
    agent_list = agent_sub.add_parser('list', help='列出当前 Agent')
    agent_list.set_defaults(func=lambda args: AgentCommands(HermesCLI()).list(args))
    
    agent_show = agent_sub.add_parser('show', help='显示 Agent 详情')
    agent_show.add_argument('name', help='Agent 名称')
    agent_show.set_defaults(func=lambda args: AgentCommands(HermesCLI()).show(args))
    
    agent_create = agent_sub.add_parser('create', help='创建新 Agent')
    agent_create.add_argument('name', help='Agent 名称')
    agent_create.set_defaults(func=lambda args: AgentCommands(HermesCLI()).create(args))
    
    agent_edit = agent_sub.add_parser('edit', help='编辑 Agent')
    agent_edit.add_argument('name', help='Agent 名称')
    agent_edit.set_defaults(func=lambda args: AgentCommands(HermesCLI()).edit(args))
    
    agent_delete = agent_sub.add_parser('delete', help='删除 Agent')
    agent_delete.add_argument('name', help='Agent 名称')
    agent_delete.add_argument('-f', '--force', action='store_true', help='跳过确认')
    agent_delete.set_defaults(func=lambda args: AgentCommands(HermesCLI()).delete(args))
    
    # Config 命令
    config_parser = subparsers.add_parser('config', help='配置管理')
    config_sub = config_parser.add_subparsers(dest='config_command')
    
    config_validate = config_sub.add_parser('validate', help='验证配置')
    config_validate.set_defaults(func=lambda args: ConfigCommands(HermesCLI()).validate(args))
    
    config_export = config_sub.add_parser('export', help='导出为 JSON')
    config_export.add_argument('output', help='输出文件路径')
    config_export.set_defaults(func=lambda args: ConfigCommands(HermesCLI()).export(args))
    
    config_import = config_sub.add_parser('import', help='从 JSON 导入')
    config_import.add_argument('input', help='输入文件路径')
    config_import.set_defaults(func=lambda args: ConfigCommands(HermesCLI()).import_(args))
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    if hasattr(args, 'func'):
        args.func(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
