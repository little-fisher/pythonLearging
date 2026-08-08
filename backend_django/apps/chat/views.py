from rest_framework.decorators import api_view
from rest_framework.response import Response
from .serializers import ChatRequestSerializer

@api_view(['GET'])
def health(request):
    return Response({"status": "ok", "service": "agent-lab-django"})

@api_view(['POST'])
def validate_test(request):
    serializer = ChatRequestSerializer(data = request.data)
    if serializer.is_valid():
        return Response(serializer.data)
    else:
        return Response(serializer.errors, status = 400)
