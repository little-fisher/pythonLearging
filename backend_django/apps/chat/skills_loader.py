from pathlib import Path
import yaml

SKILLS_DIR  = Path(__file__).parents[2] / 'skills'

def list_skills() -> list[dict]:
    if not SKILLS_DIR .exists():
        return []
    skills = []
    for skill_file in SKILLS_DIR.glob('*/SKILL.md'):
        text = skill_file.read_text(encoding='utf-8')
        parts = text.split("---", 2)
        if len(parts) >= 3:
            meta = yaml.safe_load(parts[1])
            skills.append({"name": meta["name"], "description": meta["description"]})
    return skills

def load_skill_body(name: str) -> str:
    if "/" in name or ".." in name or "\\" in name:
        raise ValueError("非法的技能名")
    skill_file = SKILLS_DIR / name / "SKILL.md"
    if not skill_file.exists():
        raise ValueError(f"技能不存在: {name}")
    return skill_file.read_text(encoding="utf-8")