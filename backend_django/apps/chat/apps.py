from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.chat'

    def ready(self):
         # Django 启动时导入图，触发 Checkpointer 初始化（建表、连 MySQL）
        from . import graph