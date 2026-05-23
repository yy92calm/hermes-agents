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
    """从 Markdown 文本中提取 YAML frontmatter。
    
    支持:
    - 简单键值对: key: value
    - 嵌套字典: key:\n  subkey: value
    - 列表: key:\n  - item1\n  - item2
    """
    match = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not match:
        return {}
    yaml_str = match.group(1)
    result = {}
    current_path = []  # 当前嵌套路径栈

    def set_nested(path, key, value):
        """在嵌套路径中设置值。"""
        target = result
        for p in path:
            if p not in target or not isinstance(target[p], dict):
                target[p] = {}
            target = target[p]
        target[key] = value

    def get_nested(path, key):
        """获取嵌套路径中的值。"""
        target = result
        for p in path:
            if p not in target or not isinstance(target[p], dict):
                return None
            target = target[p]
        return target.get(key)

    def _convert(val):
        """将字符串值转换为合适的 Python 类型。"""
        v = val.strip().strip('"').strip("'")
        if v.lower() == 'true':
            return True
        elif v.lower() == 'false':
            return False
        elif re.match(r'^-?\d+(\.\d+)?$', v):
            return float(v) if '.' in v else int(v)
        return v

    lines = yaml_str.split('\n')
    # 先扫描每行的缩进级别和类型
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            i += 1
            continue

        indent = len(line) - len(line.lstrip())

        # 列表项: - item
        if stripped.startswith('- '):
            value = _convert(stripped[2:])
            # 找到所属的父 key（上一行非列表行）
            if current_path:
                parent_key = current_path[-1]
                parent = result
                for p in current_path[:-1]:
                    parent = parent.get(p, {})
                if not isinstance(parent.get(parent_key), list):
                    parent[parent_key] = []
                parent[parent_key].append(value)
            i += 1
            continue

        if ':' not in stripped:
            i += 1
            continue

        key, _, raw_val = stripped.partition(':')
        key = key.strip()
        raw_val = raw_val.strip()
        value = _convert(raw_val) if raw_val else None

        # 根据缩进确定嵌套层级
        path_level = indent // 2
        if path_level == 0:
            current_path = [key]
            result[key] = value
        else:
            # 调整路径到对应层级：父路径为 current_path[:path_level]
            path = current_path[:path_level]
            set_nested(path, key, value)
            current_path = path + [key]

        i += 1

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

    # 验证 skills 字段（可选，但如果存在必须是列表）
    skills = fm.get('skills')
    if skills is not None:
        if not isinstance(skills, list):
            issues.append(f'{prefix}[错误] skills 必须是列表格式')
        elif not all(isinstance(s, str) for s in skills):
            issues.append(f'{prefix}[错误] skills 列表中的元素必须是字符串')

    # 验证 permission.skill 字段
    perms = fm.get('permissions')
    if perms is not None and isinstance(perms, dict):
        skill_perm = perms.get('skill')
        if skill_perm is not None and skill_perm not in ('allow', 'ask', 'deny'):
            issues.append(f"{prefix}[错误] permission.skill='{skill_perm}' 无效（应为 allow/ask/deny）")

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


def uninstall_suite(target_dir: Path) -> tuple[list[str], bool]:
    """卸载目标项目的所有 agent 配置。

    Args:
        target_dir: 目标 OpenCode 项目路径

    Returns:
        (删除的文件列表, 是否成功更新 opencode.json)
    """
    agents_dir = target_dir / '.opencode' / 'agents'
    deleted = []

    if agents_dir.is_dir():
        for md_file in agents_dir.glob('*.md'):
            try:
                md_file.unlink()
                deleted.append(md_file.name)
            except Exception:
                pass

    json_path = target_dir / 'opencode.json'
    json_ok = False

    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                config = json.load(f)

            if 'agents' in config:
                config['agents'] = {}

            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
                f.write('\n')

            json_ok = True
        except Exception:
            pass

    return deleted, json_ok


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
        if 'permissions' in fm and isinstance(fm['permissions'], dict):
            entry['permissions'] = fm['permissions']

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
