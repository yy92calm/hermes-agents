#!/usr/bin/env python3
"""
Hermes Agents — 共享工具模块

提供 YAML frontmatter 解析、字段验证等公共功能。

用法:
    from _shared import parse_frontmatter, REQUIRED_FIELDS, VALID_MODES
"""

import json
from pathlib import Path

try:
    import frontmatter
    HAS_FRONTMATTER = True
except ImportError:
    HAS_FRONTMATTER = False


REQUIRED_FIELDS = ['description', 'model', 'mode', 'color', 'temperature', 'max_iterations']
VALID_MODES = {'primary', 'subagent'}


def parse_frontmatter(text: str) -> dict:
    """从 Markdown 文本中提取 YAML frontmatter。
    
    使用 python-frontmatter 库解析，自动处理复杂 YAML 结构。
    如果库不可用，返回空字典并打印警告。
    """
    if not HAS_FRONTMATTER:
        print("警告: python-frontmatter 未安装，无法解析 frontmatter", file=__import__('sys').stderr)
        print("请运行: pip install python-frontmatter", file=__import__('sys').stderr)
        return {}
    
    try:
        post = frontmatter.loads(text)
        metadata = post.metadata
        if hasattr(metadata, 'to_dict'):
            return metadata.to_dict()
        return dict(metadata) if metadata else {}
    except Exception as e:
        print(f"警告: YAML 解析失败: {e}", file=__import__('sys').stderr)
        return {}


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


def get_skill_dirs(project_root: Path = None) -> list[Path]:
    """获取技能搜索路径（项目级 + 全局级）。
    
    Args:
        project_root: 项目根目录，如果为 None 则自动检测
    
    Returns:
        技能目录列表，按优先级排序（项目级优先）
    """
    dirs = []
    
    if project_root is None:
        try:
            project_root = detect_project_root()
        except FileNotFoundError:
            pass
    
    if project_root:
        project_skills = project_root / 'skills'
        if project_skills.is_dir():
            dirs.append(project_skills)
    
    global_skills = Path.home() / '.opencode' / 'skills'
    if global_skills.is_dir():
        dirs.append(global_skills)
    
    return dirs


def list_available_skills(project_root: Path = None) -> dict:
    """列出所有可用技能及其来源。
    
    Args:
        project_root: 项目根目录
    
    Returns:
        {skill_name: {'path': Path, 'source': 'project'|'global'}}
    """
    skills = {}
    for skill_dir in get_skill_dirs(project_root):
        for skill_path in skill_dir.iterdir():
            if skill_path.is_dir() and (skill_path / 'SKILL.md').exists():
                source = 'project' if 'hermes-agents' in str(skill_path) or \
                         (project_root and str(project_root) in str(skill_path)) else 'global'
                skills[skill_path.name] = {
                    'path': skill_path,
                    'source': source
                }
    return skills


def get_skill_content(skill_name: str, project_root: Path = None) -> tuple[str, dict]:
    """获取技能内容和元数据。
    
    Args:
        skill_name: 技能名称
        project_root: 项目根目录
    
    Returns:
        (技能内容, frontmatter 元数据)
    
    Raises:
        FileNotFoundError: 技能不存在
    """
    skills = list_available_skills(project_root)
    if skill_name not in skills:
        raise FileNotFoundError(f"技能 '{skill_name}' 不存在")
    
    skill_path = skills[skill_name]['path']
    skill_file = skill_path / 'SKILL.md'
    content = skill_file.read_text(encoding='utf-8')
    
    fm = parse_frontmatter(content)
    return content, fm
