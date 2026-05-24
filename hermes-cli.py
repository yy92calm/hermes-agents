#!/usr/bin/env python3
"""
Hermes Agents CLI — OpenCode 多 Agent 配置管理命令行工具

用法:
    hermes suite list                    # 列出所有可用方案
    hermes suite use hermes-fullstack    # 切换到指定方案
    hermes suite uninstall              # 卸载当前方案
    hermes suite create my-suite        # 创建新方案
    
    hermes agent list                   # 列出当前方案的 Agent
    hermes agent show coder             # 显示 Agent 详情
    hermes agent create my-agent        # 创建新 Agent
    hermes agent generate tester --suite my-suite  # 在方案中生成新 Agent
    hermes agent edit coder             # 编辑 Agent（打开编辑器）
    hermes agent delete my-agent        # 删除 Agent
    
    hermes config validate              # 验证配置
    hermes config export my-suite.json  # 导出为 JSON
    hermes config import my-suite.json  # 从 JSON 导入
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

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
    list_available_skills,
    get_skill_content,
)
from errors import HermesError, ErrorCode, handle_error, success, warning, info


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
            raise HermesError(
                code=ErrorCode.PROJECT_NOT_FOUND,
                message="未找到 hermes-agents 项目",
                hint="请在项目目录或子目录中运行，或检查当前目录是否包含 suites/ 文件夹"
            )
    
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
    
    def create(self, args):
        self.cli._require_project()
        suite_name = args.name
        
        suite_dir = self.cli.project_root / 'suites' / suite_name
        if suite_dir.exists():
            raise HermesError(
                code=ErrorCode.SUITE_EXISTS,
                message=f"方案 '{suite_name}' 已存在",
                hint=f"使用 'hermes suite use {suite_name}' 切换到该方案，或选择其他名称"
            )
        
        agents_dir = suite_dir / '.opencode' / 'agents'
        agents_dir.mkdir(parents=True)
        
        print(f"已创建方案: {suite_name}")
        print(f"目录: {suite_dir}")
        print()
        print("下一步:")
        print(f"  hermes agent generate <agent-name> --suite {suite_name}")


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
            raise HermesError(
                code=ErrorCode.AGENT_NOT_FOUND,
                message=f"Agent '{agent_name}' 不存在",
                hint="使用 'hermes agent list' 查看所有可用 Agent"
            )
        
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
            raise HermesError(
                code=ErrorCode.AGENT_EXISTS,
                message=f"Agent '{agent_name}' 已存在",
                hint=f"使用 'hermes agent edit {agent_name}' 编辑该 Agent，或选择其他名称"
            )
        
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
            raise HermesError(
                code=ErrorCode.AGENT_NOT_FOUND,
                message=f"Agent '{agent_name}' 不存在",
                hint="使用 'hermes agent list' 查看所有可用 Agent"
            )
        
        editor = os.environ.get('EDITOR', 'vim')
        try:
            subprocess.run([editor, str(agent_file)])
        except FileNotFoundError:
            raise HermesError(
                code=ErrorCode.EDITOR_NOT_FOUND,
                message=f"找不到编辑器 '{editor}'",
                hint=f"设置环境变量 EDITOR 或手动编辑文件: {agent_file}"
            )
    
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
    
    def generate(self, args):
        self.cli._require_project()
        agent_name = args.name
        suite_name = args.suite
        
        suite_dir = self.cli.project_root / 'suites' / suite_name
        if not suite_dir.exists():
            raise HermesError(
                code=ErrorCode.SUITE_NOT_FOUND,
                message=f"方案 '{suite_name}' 不存在",
                hint=f"使用 'hermes suite create {suite_name}' 创建新方案"
            )
        
        agents_dir = suite_dir / '.opencode' / 'agents'
        agent_file = agents_dir / f'{agent_name}.md'
        if agent_file.exists():
            raise HermesError(
                code=ErrorCode.AGENT_EXISTS,
                message=f"Agent '{agent_name}' 已存在于方案 '{suite_name}' 中",
                hint=f"使用 'hermes agent edit {agent_name}' 编辑该 Agent，或选择其他名称"
            )
        
        print(f"在方案 '{suite_name}' 中生成 Agent: {agent_name}")
        print()
        
        description = input("角色定位 [默认: {agent_name} - 新建 Agent]: ").strip()
        if not description:
            description = f"{agent_name} - 新建 Agent"
        
        mode_input = input("模式 (primary/subagent) [默认: subagent]: ").strip().lower()
        mode = mode_input if mode_input in ('primary', 'subagent') else 'subagent'
        
        tools_input = input("工具权限 (read,write,edit,bash,list,grep,glob,todo_write,task,web_search,web_fetch) [默认: read,list,grep,glob]: ").strip()
        if tools_input:
            tools = {t.strip(): True for t in tools_input.split(',')}
        else:
            tools = {'read': True, 'list': True, 'grep': True, 'glob': True}
        
        skills_input = input("技能 (逗号分隔，如 test-generator,task-planner) [默认: 无]: ").strip()
        if skills_input:
            skills = [s.strip() for s in skills_input.split(',')]
        else:
            skills = []
        
        perms_input = input("权限 (格式: skill=allow,edit=ask,bash=ask,webfetch=deny) [默认: skill=deny,edit=deny,bash=deny,webfetch=deny]: ").strip()
        if perms_input:
            permissions = {}
            for p in perms_input.split(','):
                if '=' in p:
                    k, v = p.split('=')
                    permissions[k.strip()] = v.strip()
        else:
            permissions = {'skill': 'deny', 'edit': 'deny', 'bash': 'deny', 'webfetch': 'deny'}
        
        role = input("角色描述 [可选]: ").strip()
        workflow = input("工作流程 [可选]: ").strip()
        
        lines = ['---']
        lines.append(f"description: {description}")
        lines.append(f"model: opencode/gpt-5.1-codex")
        lines.append(f"mode: {mode}")
        lines.append(f"color: \"#3498DB\"")
        lines.append(f"temperature: 0.2")
        lines.append(f"max_iterations: 20")
        
        if tools:
            lines.append('tools:')
            for k, v in sorted(tools.items()):
                lines.append(f"  {k}: {str(v).lower()}")
        
        if skills:
            lines.append('skills:')
            for s in skills:
                lines.append(f"  - {s}")
        else:
            lines.append('skills: []')
        
        if permissions:
            lines.append('permissions:')
            for k, v in sorted(permissions.items()):
                lines.append(f"  {k}: {v}")
        
        lines.append('---')
        lines.append('')
        lines.append(f"# {agent_name.title()}")
        lines.append('')
        
        if role:
            lines.append('## 角色定位')
            lines.append('')
            lines.append(role)
            lines.append('')
        
        if workflow:
            lines.append('## 工作流程')
            lines.append('')
            lines.append(workflow)
            lines.append('')
        
        agent_file.write_text('\n'.join(lines), encoding='utf-8')
        
        print()
        print(f"✓ 已创建: {agent_file}")
        print()
        print("下一步:")
        print(f"  hermes suite use {suite_name}  # 导入方案到项目")


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
            raise HermesError(
                code=ErrorCode.NO_AGENTS,
                message="当前无 Agent 配置",
                hint="使用 'hermes suite use <方案名>' 导入方案，或 'hermes agent create <名称>' 创建新 Agent"
            )
        
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
            raise HermesError(
                code=ErrorCode.FILE_NOT_FOUND,
                message=f"文件 '{input_file}' 不存在",
                hint="请检查文件路径是否正确"
            )
        
        with open(input_file, 'r', encoding='utf-8') as f:
            suite_data = json.load(f)
        
        agents = suite_data.get('agents', [])
        if not agents:
            raise HermesError(
                code=ErrorCode.INVALID_CONFIG,
                message="JSON 文件中未找到 agents",
                hint="请确保 JSON 文件包含 'agents' 数组字段"
            )
        
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


class SkillCommands:
    def __init__(self, cli: HermesCLI):
        self.cli = cli
    
    def list(self, args):
        skills = list_available_skills(self.cli.project_root)
        
        if not skills:
            print("未找到任何技能。")
            print()
            print("技能来源:")
            print("  1. 项目级: <project>/skills/")
            print("  2. 全局级: ~/.opencode/skills/")
            return
        
        print(f"可用技能 ({len(skills)}):")
        print()
        
        project_skills = {k: v for k, v in skills.items() if v['source'] == 'project'}
        global_skills = {k: v for k, v in skills.items() if v['source'] == 'global'}
        
        if project_skills:
            print("📦 项目级技能:")
            for name, info in sorted(project_skills.items()):
                try:
                    _, fm = get_skill_content(name, self.cli.project_root)
                    desc = fm.get('description', 'N/A')[:50]
                except Exception:
                    desc = 'N/A'
                print(f"  {name:<20} {desc}")
            print()
        
        if global_skills:
            print("🌐 全局级技能:")
            for name, info in sorted(global_skills.items()):
                try:
                    _, fm = get_skill_content(name, self.cli.project_root)
                    desc = fm.get('description', 'N/A')[:50]
                except Exception:
                    desc = 'N/A'
                print(f"  {name:<20} {desc}")
            print()
    
    def show(self, args):
        skill_name = args.name
        
        try:
            content, fm = get_skill_content(skill_name, self.cli.project_root)
        except FileNotFoundError:
            raise HermesError(
                code=ErrorCode.FILE_NOT_FOUND,
                message=f"技能 '{skill_name}' 不存在",
                hint="使用 'hermes skill list' 查看所有可用技能"
            )
        
        source = '项目级' if list_available_skills(self.cli.project_root)[skill_name]['source'] == 'project' else '全局级'
        
        print(f"技能: {skill_name}")
        print("=" * 60)
        print()
        print(f"来源: {source}")
        print(f"描述: {fm.get('description', 'N/A')}")
        print()
        print("内容:")
        print("-" * 60)
        print(content)


def main():
    parser = argparse.ArgumentParser(
        description='Hermes Agents CLI — OpenCode 多 Agent 配置管理工具',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('-v', '--verbose', action='store_true',
                       help='显示详细错误信息')
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
    
    suite_create = suite_sub.add_parser('create', help='创建新方案')
    suite_create.add_argument('name', help='方案名称')
    suite_create.set_defaults(func=lambda args: SuiteCommands(HermesCLI()).create(args))
    
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
    
    agent_generate = agent_sub.add_parser('generate', help='在方案中生成新 Agent')
    agent_generate.add_argument('name', help='Agent 名称')
    agent_generate.add_argument('--suite', required=True, help='方案名称')
    agent_generate.set_defaults(func=lambda args: AgentCommands(HermesCLI()).generate(args))
    
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
    
    # Skill 命令
    skill_parser = subparsers.add_parser('skill', help='技能管理')
    skill_sub = skill_parser.add_subparsers(dest='skill_command')
    
    skill_list = skill_sub.add_parser('list', help='列出所有可用技能')
    skill_list.set_defaults(func=lambda args: SkillCommands(HermesCLI()).list(args))
    
    skill_show = skill_sub.add_parser('show', help='显示技能详情')
    skill_show.add_argument('name', help='技能名称')
    skill_show.set_defaults(func=lambda args: SkillCommands(HermesCLI()).show(args))
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    if hasattr(args, 'func'):
        try:
            args.func(args)
        except HermesError as e:
            handle_error(e, verbose=getattr(args, 'verbose', False))
        except KeyboardInterrupt:
            print("\n操作已取消")
            sys.exit(130)
        except Exception as e:
            print(f"\n❌ 未预期的错误: {e}", file=sys.stderr)
            if getattr(args, 'verbose', False):
                import traceback
                traceback.print_exc()
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
