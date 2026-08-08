from django.db import models

class Session(models.Model): # 声明我需要有这样一张 session 表
    id = models.CharField(max_length=64, primary_key=True)
    title = models.CharField(max_length=100, default="未命名会话")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sessions'
        ordering = ['-created_at'] # 按创建时间降序排序

    def __str__(self):
        return f'{self.id}:{self.title}'