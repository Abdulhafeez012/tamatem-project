from django.urls import path
from accounts.views import RegisterView, LoginView
from rest_framework_simplejwt.views import TokenRefreshView

app_name = "accounts"

urlpatterns = [
    path("signup/", RegisterView.as_view(), name="signup"),
    path("login/", LoginView.as_view(), name="login"),
    path("login/refresh/", TokenRefreshView.as_view(), name="login-refresh"),
]
