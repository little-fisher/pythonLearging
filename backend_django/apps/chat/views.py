from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Session

@api_view(['GET'])
def health(request):
    return Response({"status": "ok", "service": "agent-lab-django"})

@api_view(['GET'])
def list_conversations(request): # 列出所有会话
    sessions = Session.objects.values('id', 'title', 'created_at','updated_at') 
    return Response(list(sessions))

@api_view(['DELETE'])
def delete_conversation(request, conversation_id): # 删除会话
    try:
        session = Session.objects.get(id = conversation_id)
        session.delete()
        return Response({'deleted': conversation_id})
    except Session.DoesNotExist:
        return Response(
            {'detail': 'Conversation not found'},
            status=status.HTTP_404_NOT_FOUND
        )