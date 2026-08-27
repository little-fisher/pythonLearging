"""Day 3 作业 4：ZSet 热搜排行榜

把 redis-cli 里练过的热搜脚本搬进 Python（redis-py）。
用法：先激活 backend/.venv 或任何装了 redis 包的环境，再运行：

    python day3_hot_search.py
"""

import redis

# 连 Docker 里的 Redis 7（容器 redis-day3，映射到 6380）
r = redis.Redis(host="127.0.0.1", port=6380, db=0, decode_responses=True)

KEY = "hot:weibo:py"


def show_top(n=3):
    """打印 Top N，名次从 1 开始展示。"""
    top = r.zrevrange(KEY, 0, n - 1, withscores=True)
    for i, (member, score) in enumerate(top, start=1):
        print(f"  {i}. {member}  热度 {int(score)}")


def main():
    # 0. 清掉旧数据，保证可重复运行
    r.delete(KEY)

    # 1. 初始化热搜榜（redis-py 的 zadd 用 dict：成员在前，分数在后）
    r.zadd(KEY, {
        "AI发布会": 120,
        "暴雨预警": 95,
        "新电影上映": 88,
        "足球决赛": 70,
        "明星离婚": 55,
    })

    # 2. 模拟用户搜索，热度上涨
    r.zincrby(KEY, 60, "暴雨预警")
    r.zincrby(KEY, 30, "AI发布会")
    r.zincrby(KEY, 45, "足球决赛")

    # 3. 新词条空降（成员不存在时 zincrby 自动从 0 分创建）
    r.zincrby(KEY, 200, "突发新闻")

    # 4. Top 3
    print("Top 3 热搜：")
    show_top(3)

    # 5. 查"AI发布会"名次（zrevrank 从 0 开始，展示要 +1）
    rank = r.zrevrank(KEY, "AI发布会")
    print(f"「AI发布会」当前名次：第 {rank + 1} 名，热度 {int(r.zscore(KEY, 'AI发布会'))}")

    # 6. 清理热度低于 100 的过气词条（(100 表示开区间，不含 100）
    removed = r.zremrangebyscore(KEY, "-inf", "(100")
    print(f"清理掉 {removed} 个过气词条")

    # 7. 最终榜单
    print("最终榜单：")
    for member, score in r.zrevrange(KEY, 0, -1, withscores=True):
        print(f"  {member}  热度 {int(score)}")


if __name__ == "__main__":
    main()
