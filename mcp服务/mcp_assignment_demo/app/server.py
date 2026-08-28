"""标准 MCP Server：stdio 传输，适合本地 Host / IDE 调用。"""

import logging

from mcp.server.fastmcp import FastMCP

from app.core.logging import configure_logging
from app.services.assignment_service import (
    find_assignment,
    get_phase_requirement,
    get_submission_rate,
    list_submitted_students,
)

configure_logging()
logger = logging.getLogger(__name__)

mcp = FastMCP(
    "assignment-tools",
    instructions="用于查询 AI Agent 课程作业上交情况与作业说明。",
)


@mcp.tool(
    description=(
        "按学员姓名和期数查询单个学员的作业上交情况。"
        "适用于：某某交了吗、查询某位学员某一期的作业、查看个人提交记录。"
        "需要提供 student（学员姓名）和 phase（第几期，1 到 7）。"
        "示例：查询胡秋第一期作业是否提交。"
    )
)
def find_student_assignment(student: str, phase: int) -> dict:
    """查询单个学员指定期次的作业上交情况。"""
    logger.info("MCP Tool find_student_assignment: student=%s, phase=%s", student, phase)
    result = find_assignment(student, phase)
    logger.info("MCP Tool find_student_assignment result: %s", result)
    return result


@mcp.tool(
    description=(
        "按期次列出全部已提交作业的学员姓名。"
        "适用于：第一期谁提交了、查看某一期上交名单、统计某一期作业情况。"
        "需要提供 phase（第几期，1 到 7）。"
        "示例：列出第二期已经提交作业的所有学员。"
    )
)
def list_phase_submissions(phase: int) -> list[str]:
    """列出指定期次已经提交作业的全部学员。"""
    logger.info("MCP Tool list_phase_submissions: phase=%s", phase)
    result = list_submitted_students(phase)
    logger.info("MCP Tool list_phase_submissions result: %s", result)
    return result


@mcp.tool(
    description=(
        "统计指定期数的作业提交率，返回已提交人数、全班人数和提交率百分比。"
        "适用于：某期提交率是多少、统计某一期作业完成情况、比较多期提交情况。"
        "需要提供 phase（第几期，1 到 7）。"
        "示例：统计第三期作业提交率。"
    )
)
def get_phase_submission_rate(phase: int) -> dict:
    """统计指定期次的作业提交率。"""
    logger.info("MCP Tool get_phase_submission_rate: phase=%s", phase)
    result = get_submission_rate(phase)
    logger.info("MCP Tool get_phase_submission_rate result: %s", result)
    return result


@mcp.resource("course://phase/{phase}/assignment")
def phase_assignment_resource(phase: int) -> str:
    """读取指定期数的作业说明。"""
    logger.info("MCP Resource course://phase/%s/assignment", phase)
    return get_phase_requirement(phase)


@mcp.prompt(title="作业查询助手")
def assignment_query_prompt(student: str, phase: int) -> str:
    """生成查询作业上交情况的标准提问。"""
    logger.info("MCP Prompt assignment_query_prompt: student=%s, phase=%s", student, phase)
    return f"请查询 {student} 第 {phase} 期的作业上交情况，并简要说明结果。"


if __name__ == "__main__":
    mcp.run()
