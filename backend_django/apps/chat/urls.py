from django.urls import path
from . import views

urlpatterns = [
    path('health/',views.health, name = 'health' ),
    path('validate/',views.validate_test, name = 'validate_test' )
]
