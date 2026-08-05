import redis
import time

r = redis.Redis(host = "127.0.0.1", port = 6379, db = 0, decode_responses = True)

def cache_message(session_id,msg):
    key = f"recent:{session_id}"
    r.lpush(key,msg)
    r.ltrim(key,0,9) # 保留最近10条消息
    r.expire(key, 60)  # 设置过期时间：60 秒后

for i in range(13):
    cache_message("session1", f"message {i}")

msgs = r.lrange("recent:session1", 0, -1)

print("条数:", len(msgs))
print(msgs) 
print("ttl:", r.ttl("chat:session:s1")) 