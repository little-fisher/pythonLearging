-- SQL 练习库一键重置脚本
-- 用法：docker exec -i mysql8 mysql -uroot -proot --default-character-set=utf8mb4 < sql_practice_setup.sql
-- 每次执行会清空 sql_practice 并重建（练习中练坏了就跑一次重置）

DROP DATABASE IF EXISTS sql_practice;
CREATE DATABASE sql_practice CHARACTER SET utf8mb4;
USE sql_practice;

-- 用户表
CREATE TABLE users (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(20) NOT NULL,
    age        INT,
    city       VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 订单表
CREATE TABLE orders (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    user_id    INT,
    amount     DECIMAL(10,2),
    status     VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 种子数据
INSERT INTO users (name, age, city) VALUES
('小林', 24, '上海'), ('阿青', 22, '北京'),
('大熊', 30, '广州'), ('小美', 27, '上海'),
('大伟', 35, '深圳');

INSERT INTO orders (user_id, amount, status) VALUES
(1, 100.00, 'paid'), (1, 50.00, 'pending'),
(2, 200.00, 'paid'), (3, 80.00, 'paid'),
(3, 30.00, 'paid'), (3, 20.00, 'refunded'),
(5, 500.00, 'paid');
