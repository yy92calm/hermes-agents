#!/usr/bin/env python3
"""
验证 suites/ 下所有方案的配置一致性。

检查项:
    1. 所有 agent .md 文件是否有合法 YAML frontmatter
    2. frontmatter 中必要字段是否完整
    3. 方案间共用 agent 的配置是否一致
    4. suites/ 中各方案的完整性（是否有缺失文件）

用法:
    python tools/verify_suites.py
    python tools/verify_suites.py --fix   # 自动修复以下问题：
        - 缺少必要字段时自动填充默认值
        - temperature / max_iterations 越界时自动修正
"""

import shutil
import sys
from collections import defaultdict

# 从共享模块导入
from _shared import (
    parse_frontmatter,
    detect_project_root,
    list_suites,
    read_agent_files,
    validate_frontmatter,
    REQUIRED_FIELDS,
    VALID_MODES,
)


# 默认修复值
DEFAULT_FIXES = {
    'max_iterations': 15,
    'temperature': 0.2,
    'model': 'opencode/gpt-5.1-codex',
    'mode': 'subagent',
    'color': '#6c7bff',
}


def fix_frontmatter_issues(filepath: Path) -> list[str]:
    """尝试自动修复 agent .md 文件的问题。返回修复描述列表。"""
    fixes = []
    try:
        content = filepath.read_text(encoding='utf-8')
    except Exception as e:
        return [f'无法读取: {e}']

    # 检查 frontmatter 是否存在
    import re
    fm_match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not fm_match:
        return ['缺少 frontmatter，无法自动修复']

    fm_text = fm_match.group(1)
    fm = parse_frontmatter(content)

    if not fm:
        return ['frontmatter 为空，无法自动修复']

    lines = fm_text.split('\n')
    new_lines = list(lines)
    modified = False

    # 检查并修复缺失字段
    for field in REQUIRED_FIELDS:
        if field not in fm:
            default_val = DEFAULT_FIXES.get(field, '')
            if isinstance(default_val, str):
                new_lines.append(f'{field}: "{default_val}"')
            else:
                new_lines.append(f'{field}: {default_val}')
            fixes.append(f'添加缺失字段 {field}={default_val}')
            modified = True

    # 修正 temperature 越界
    temp = fm.get('temperature')
    if temp is not None and (not isinstance(temp, (int, float)) or temp < 0 or temp > 2):
        for i, line in enumerate(new_lines):
            if line.strip().startswith('temperature:'):
                new_lines[i] = f'temperature: {max(0.0, min(2.0, float(temp))):.1f}'
                fixes.append(f'修正 temperature {temp} → {max(0.0, min(2.0, float(temp))):.1f}')
                modified = True
                break

    # 修正 max_iterations 越界
    mi = fm.get('max_iterations')
    if mi is not None and (not isinstance(mi, (int, float)) or mi < 5 or mi > 100):
        for i, line in enumerate(new_lines):
            if line.strip().startswith('max_iterations:'):
                new_lines[i] = f'max_iterations: {max(5, min(100, int(mi)))}'
                fixes.append(f'修正 max_iterations {mi} → {max(5, min(100, int(mi)))}')
                modified = True
                break

    # 修正无效的 mode
    mode = fm.get('mode')
    if mode and mode not in VALID_MODES:
        for i, line in enumerate(new_lines):
            if line.strip().startswith('mode:'):
                new_lines[i] = 'mode: subagent'
                fixes.append(f'修正 mode {mode} → subagent')
                modified = True
                break

    if not modified:
        return []

    # 重新构建文件内容
    new_fm_text = '\n'.join(new_lines)
    new_content = content.replace(fm_text, new_fm_text)

    # 备份原始文件
    backup_path = filepath.with_suffix('.md.bak')
    shutil.copy2(filepath, backup_path)
    fixes.append(f'已备份到 {backup_path.name}')

    # 写入修复后的内容
    filepath.write_text(new_content, encoding='utf-8')

    return fixes


def check_cross_suite_consistency(suites_data: dict) -> list[str]:
    """检查不同方案中使用相同 agent 名称时配置是否一致。"""
    issues = []
    agent_map = defaultdict(dict)
    for suite_name, agents in suites_data.items():
        for agent in agents:
            agent_map[agent['stem']][suite_name] = agent['frontmatter']

    ignore_fields = {'description'}
    for agent_name, suite_fms in agent_map.items():
        if len(suite_fms) <= 1:
            continue

        suites_list = sorted(suite_fms.keys())
        base_suite = suites_list[0]
        base_fm = suite_fms[base_suite]

        for other_suite in suites_list[1:]:
            other_fm = suite_fms[other_suite]
            diffs = []
            for key in sorted(set(base_fm.keys()) | set(other_fm.keys())):
                if key in ignore_fields:
                    continue
                v1 = base_fm.get(key)
                v2 = other_fm.get(key)
                if v1 != v2:
                    diffs.append(f"{key}: '{v1}' vs '{v2}'")

            if diffs:
                issues.append(
                    f"[不一致] Agent '{agent_name}' 在 '{base_suite}' 和 '{other_suite}' 间差异: "
                    + '; '.join(diffs)
                )

    return issues


def main():
    try:
        project_root = detect_project_root()
    except FileNotFoundError as e:
        print(f'错误: {e}')
        sys.exit(1)

    suites_dir = project_root / 'suites'
    fix_mode = '--fix' in sys.argv

    print(f'检查项目: {project_root}')
    print(f'扫描 suites/ 目录 ...')
    if fix_mode:
        print(f'修复模式: 已启用 (--fix)')
    print()

    all_ok = True
    total_issues = 0
    suites_data = {}

    for suite_dir in sorted(suites_dir.iterdir()):
        if not suite_dir.is_dir():
            continue

        agents_dir = suite_dir / '.opencode' / 'agents'
        if not agents_dir.is_dir():
            print(f'[警告] {suite_dir.name}: 无 .opencode/agents/ 目录')
            continue

        md_files = sorted(agents_dir.glob('*.md'))
        print(f'--- {suite_dir.name} ({len(md_files)} 个 Agent) ---')

        suite_agents = []
        for md_file in md_files:
            issues = validate_frontmatter(parse_frontmatter(md_file.read_text(encoding='utf-8')), md_file.name)

            if issues:
                all_ok = False
                total_issues += len(issues)
                print(f'  {md_file.name}:')
                for issue in issues:
                    print(f'    {issue}')

                # 修复模式
                if fix_mode:
                    fixed = fix_frontmatter_issues(md_file)
                    if fixed:
                        for f in fixed:
                            print(f'    ✅ [修复] {f}')
                        # 重新验证
                        new_fm = parse_frontmatter(md_file.read_text(encoding='utf-8'))
                        remaining = validate_frontmatter(new_fm, md_file.name)
                        if remaining:
                            for r in remaining:
                                print(f'    ❌ [残留] {r}')
                        else:
                            print(f'    ✅ 全部修复完成')
                    else:
                        print(f'    ❌ 无法自动修复')
            else:
                print(f'  {md_file.name}: OK')

            content = md_file.read_text(encoding='utf-8')
            fm = parse_frontmatter(content)
            suite_agents.append({'stem': md_file.stem, 'frontmatter': fm})

        suites_data[suite_dir.name] = suite_agents
        print()

    # 跨方案一致性检查
    print('=== 跨方案一致性检查 ===')
    cross_issues = check_cross_suite_consistency(suites_data)
    if cross_issues:
        all_ok = False
        total_issues += len(cross_issues)
        for issue in cross_issues:
            print(f'  {issue}')
    else:
        print('  无跨方案不一致问题')

    print()
    if all_ok:
        print(f'✅ 全部检查通过!')
    else:
        print(f'⚠️ 发现 {total_issues} 个问题')
        if not fix_mode:
            print(f'💡 提示: 运行 python tools/verify_suites.py --fix 尝试自动修复')


if __name__ == '__main__':
    main()
