from pathlib import Path
import redis

r = redis.Redis(host="127.0.0.1", port=6380, db=0, decode_responses=True)
r.set("seckill:stock", 5)

# 读 .lua 文件，注册成可调用对象（底层：首次 EVAL 上传，之后自动走VALSHA）
lua_text = Path(__file__).parent.joinpath("seckill.lua").read_text(encoding="utf-8")
seckill = r.register_script(lua_text)

# 库存 5 件抢 8 次
for i in range(1, 9):
    result = seckill(keys=["seckill:stock"])
    if result >= 0:
        print(f"第 {i} 次：抢购成功，剩余库存 {result}")
    else:
        print(f"第 {i} 次：库存不足，抢购失败")

print("最终库存:", r.get("seckill:stock"))
