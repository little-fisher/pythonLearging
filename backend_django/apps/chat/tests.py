from django.test import TestCase
from .models import Session

class SessionModelTest(TestCase):
    def test_create_session(self):
        """创建一个会话，应能查到"""
        session = Session.objects.create(id='test-1', title='测试会话')
        self.assertEqual(session.title, '测试会话')
        self.assertEqual(Session.objects.count(), 1)

    def test_duplicate_id_raises(self):
        """重复 id 应抛异常"""
        Session.objects.create(id='dup-1', title='第一个')
        with self.assertRaises(Exception):
            Session.objects.create(id='dup-1', title='第二个')