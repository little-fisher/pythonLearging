from django.contrib import admin
from .models import Session

# 装饰器：把 Session 模型"登记"进后台
@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'created_at', 'updated_at') # 列表页显示的字段
    search_fields = ('id', 'title') # 顶部出现搜索框，可按这些字段搜索
