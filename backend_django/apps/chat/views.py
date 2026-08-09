from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Session
from langchain_core.messages import HumanMessage
from .serializers import ChatRequestSerializer
from .graph import graph as langgraph_graph

@api_view(['GET'])
def health(request):
    return Response({"status": "ok", "service": "agent-lab-django"})

# 获取所有会话
@api_view(['GET'])
def list_conversations(request): # 列出所有会话
    # 此处缓存只是演示，实际感觉可以不用加
    cache_key = 'conversations:list'
    cached = cache.get(cache_key)
    if  cached is not None:
        return Response(cached)
    
    sessions = Session.objects.values('id', 'title', 'created_at','updated_at') 
    data = list(sessions)
    cache.set(cache_key, data, timeout=30) # 缓存 30 秒 cache
    return Response(data)

# 删除会话
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

# 聊天接口
@api_view(['POST'])
def chat(request):
    # 1. 校验请求（Serializer 自动返回 400）
    req_serializer = ChatRequestSerializer(data=request.data)
    req_serializer.is_valid(raise_exception=True)
    req = req_serializer.validated_data

    # 2. 会话不存在时创建
    Session.objects.get_or_create(
        id = req['conversation_id'],
        defaults = {'title': req.get('title') or '未命名会话'}
    )

    # 3. 只传当前消息（历史在 Checkpointer 里，按 thread_id 取）
    result = langgraph_graph.invoke(
        {'messages': [HumanMessage(content=req['message'])]}, # 拿到本次发送的消息通过HumanMessage包成 LangGraph 认识的消息对象
        config = {'configurable': {'thread_id': req['conversation_id']}}
    )
    content = result['messages'][-1].content

    # 4. 组装响应
    return Response({
        'conversation_id': req['conversation_id'],
        'message': {'role': 'assistant', 'content': content},
        'usage': None
    })

# 获取会话详情
@api_view(['GET'])
def get_conversation_messages(request, conversation_id):

    # 1.只读：从 Checkpointer 取该会话快照（不跑图、不调模型）
    snapshot = langgraph_graph.get_state(
        {'configurable': {'thread_id': conversation_id}}
    )
    # 2. 从快照中提取消息
    messages = snapshot.values.get('messages', []) if snapshot and snapshot.values else []
    # 3. 组装响应
    return Response([
        {
            'role': 'user' if m.type == 'human' else 'assistant',
            'content': m.content
        }
        for m in messages
        if m.type in ('human', 'ai')
    ])