from rest_framework import serializers

class ChatMessageSerializer(serializers.Serializer):
    ROLE_CHOICES = ['user', 'assistant']
    role = serializers.ChoiceField(choices = ROLE_CHOICES) # ChoiceField：只能是预设的几个值之一
    content = serializers.CharField(min_length = 1) # CharField：字符串字段，最小长度为1

class UsageInfoSerializer(serializers.Serializer):
    prompt_tokens = serializers.IntegerField() # IntegerField：整数字段
    completion_tokens = serializers.IntegerField()
    total_tokens = serializers.IntegerField()

class ChatRequestSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    message = serializers.CharField()
    history = serializers.ListField( # ListField：列表字段，每个元素都是ChatMessageSerializer的实例
        child = ChatMessageSerializer(),
        default = list,
    )
    context_mode = serializers.ChoiceField(choices = ['client_history', 'graph_memory'])
    title = serializers.CharField(required = False, allow_blank = True) # CharField：字符串字段，可选，允许为空串

class ChatResponseSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    message = ChatMessageSerializer()
    usage = UsageInfoSerializer(required = False, allow_null = True) # 允许为null