from django.core.management.base import BaseCommand
from apps.chat.models import Session

# 自定义管理命令 用来"造测试数据"
class Command(BaseCommand):
    help = 'Seed initial data for the chat app'
    
    def handle(self, *args, **options):
        Session.objects.get_or_create(
            id = '123',
            defaults = {'title': '默认会话'}
        )
        self.stdout.write(self.style.SUCCESS('Initial data seeded successfully'))