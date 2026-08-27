-- 秒杀扣减：库存 > 0 才扣，返回剩余库存；否则返回 -1
local stock = tonumber(redis.call('GET', KEYS[1]))

if stock == nil then
    return -1
end

if stock > 0 then
    return redis.call('DECR', KEYS[1])
else
    return -1
end