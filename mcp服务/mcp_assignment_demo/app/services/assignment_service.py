"""业务逻辑层：MCP Tool、Web API、后台任务都可以复用这里。"""

import logging

from app.data.assignments import ASSIGNMENTS, PHASE_REQUIREMENTS

logger = logging.getLogger(__name__)


def validate_phase(phase: int) -> None:
    logger.debug("校验期数: phase=%s", phase)
    if not 1 <= phase <= 7:
        logger.info("期数校验失败: phase=%s", phase)
        raise ValueError("phase 必须在 1 到 7 之间")


def find_assignment(student: str, phase: int) -> dict:
    """查询一名学员在指定期数的作业记录。"""
    logger.info("业务查询开始: student=%s, phase=%s", student, phase)
    validate_phase(phase)
    name = student.strip()
    if not name:
        raise ValueError("student 不能为空")

    for item in ASSIGNMENTS:
        if item["student"] == name and item["phase"] == phase:
            result = {
                "student": name,
                "phase": phase,
                "submitted": "是" if item["submitted"] else "否",
                "file_count": item["file_count"],
                "notes": item["notes"],
            }
            logger.info("业务查询命中: %s", result)
            return result

    result = {
        "student": name,
        "phase": phase,
        "submitted": "未找到记录",
        "file_count": 0,
        "notes": "请检查姓名、期数，或确认学员是否已提交。",
    }
    logger.info("业务查询未命中: %s", result)
    return result


def list_submitted_students(phase: int) -> list[str]:
    """列出指定期数已提交作业的学员姓名。"""
    validate_phase(phase)
    result = sorted(
        item["student"]
        for item in ASSIGNMENTS
        if item["phase"] == phase and item["submitted"]
    )
    logger.info("提交名单查询: phase=%s, students=%s", phase, result)
    return result


def get_phase_requirement(phase: int) -> str:
    """读取指定期数的作业说明。"""
    validate_phase(phase)
    result = PHASE_REQUIREMENTS.get(phase, f"第 {phase} 期作业说明暂未录入。")
    logger.info("作业说明查询: phase=%s", phase)
    return result
