#!/usr/bin/env python3
"""
Hermes Agents — 共享工具模块

提供 YAML frontmatter 解析、字段验证等公共功能。

用法:
    from _shared import parse_frontmatter, REQUIRED_FIELDS, VALID_MODES
"""

import re
from pathlib import Path


REQUIRED_FIELDS = ['description', 'model', 'mode', 'color', 'temperature', 'max_iterations']
VALID_MODES = {'primary', 'subagent'}


def parse_frontmatter(text: str) -> dict:
    """从 Markdown 文本中提取 YAML frontmatter（惰性解析，仅提取键值对）。"""
    match = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not match:
        return {}
    yaml_str = match.group(1)
    result = {}
    for line in yaml_str.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' in line:
            key, _, value = line.partition(':')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if value.lower() == 'true':
                value = True
            elif value.lower() == 'false':
                value = False
            elif re.match(r'^-?\d+(\.\d+)?$', value):
                value = float(value) if '.' in value else int(value)
            result[key] = value
    return result


def detect_project_root() -> Path:
    """自动检测 hermes-agents 项目根目录（基于脚本位置）。"""
    script_dir = Path(__file__).resolve().parent.parent
    suites_path = script_dir / 'suites'
    if not suites_path.is_dir():
        raise FileNotFoundError(f'未在 {script_dir} 找到 suites/ 目录，请确认项目结构完整。')
    return script_dir


def validate_frontmatter(fm: dict, filename: str = '') -> list:
    """验证 frontmatter 是否合法，返回问题列表。空列表表示完全通过。"""
    issues = []
    if not fm:
        issues.append('[严重] 缺少或无法解析 YAML frontmatter')
        return issues

    prefix = f'[{filename}] ' if filename else ''

    for field in REQUIRED_FIELDS:
        if field not in fm:
            issues.append(f'{prefix}[缺失] 缺少字段 \'{field}\'')

    if fm.get('mode') and fm['mode'] not in VALID_MODES:
        issues.append(f"{prefix}[错误] mode='{fm['mode']}' 无效（应为 primary 或 subagent）")

    if filename:
        stem = filename.replace('.md', '')
        if 'description' in fm and stem not in fm['description']:
            issues.append(f"{prefix}[警告] description 中未包含 agent 文件名 '{stem}'")

    mi = fm.get('max_iterations')
    if mi is not None and (not isinstance(mi, (int, float)) or mi < 5 or mi > 100):
        issues.append(f'{prefix}[警告] max_iterations={mi} 超出合理范围 (5-100)')

    temp = fm.get('temperature')
    if temp is not None and (not isinstance(temp, (int, float)) or temp < 0 or temp > 2):
        issues.append(f'{prefix}[警告] temperature={temp} 超出合理范围 (0-2)')

    return issues


def read_agent_files(suite_dir: Path) -> list[dict]:
    """读取方案中的所有 agent 文件，返回 (stem, filename, frontmatter, content) 列表。"""
    agents_dir = suite_dir / '.opencode' / 'agents'
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


def list_suites(project_root: Path) -> list[str]:
    """列出所有可用方案。"""
    suites_dir = project_root / 'suites'
    return sorted([
        d.name for d in suites_dir.iterdir()
        if d.is_dir() and (d / '.opencode' / 'agents').is_dir()
    ])


def ensure_opencode_dirs(target_dir: Path):
    """确保目标项目的 .opencode/agents/ 目录存在。"""
    (target_dir / '.opencode' / 'agents').mkdir(parents=True, exist_ok=True)


def copy_agent_files(agents: list[dict], target_dir: Path) -> list[str]:
    """将 agent .md 文件复制到目标项目。返回已复制的文件名列表。"""
    target_agents = target_dir / '.opencode' / 'agents'
    copied = []
    for agent in agents:
        dest = target_agents / agent['filename']
        dest.write_text(agent['content'], encoding='utf-8')
        copied.append(agent['filename'])
    return copied


def update_opencode_json(agents: list[dict], target_dir: Path) -> dict:
    """更新目标项目的 opencode.json，注册所有 agent。"""
    import json

    json_path = target_dir / 'opencode.json'

    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    else:
        config = {}

    if 'agents' not in config:
        config['agents'] = {}

    registered = {}
    for agent in agents:
        fm = agent['frontmatter']
        stem = agent['stem']

        entry = {
            'description': fm.get('description', ''),
            'model': fm.get('model', 'opencode/gpt-5.1-codex'),
            'mode': fm.get('mode', 'subagent'),
            'color': fm.get('color', '#999999'),
            'temperature': fm.get('temperature', 0.0),
            'max_iterations': fm.get('max_iterations', 10),
            'hidden': False,
        }

        if 'tools' in fm:
            entry['tools'] = fm['tools']

        config['agents'][stem] = entry
        registered[stem] = entry

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
        f.write('\n')

    return registered


def sync_to_root_suites(agents: list[dict], suite_name: str, project_root: Path):
    """将 agent 文件同步到项目自身的 suites/<suite_name>/ 目录。"""
    suite_dir = project_root / 'suites' / suite_name
    agents_dir = suite_dir / '.opencode' / 'agents'
    agents_dir.mkdir(parents=True, exist_ok=True)

    copied = []
    for agent in agents:
        dest = agents_dir / agent['filename']
        dest.write_text(agent['content'], encoding='utf-8')
        copied.append(agent['filename'])

    return copied
