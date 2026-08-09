from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('conversations/', views.list_conversations, name='list_conversations'),
    path('conversations/<str:conversation_id>/', views.delete_conversation, name='delete_conversation'),
    path('chat/', views.chat, name='chat'),
    path('conversations/<str:conversation_id>/messages/', views.get_conversation_messages, name='get_conversation_messages'),
]
