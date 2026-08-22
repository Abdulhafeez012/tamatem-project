from django.urls import path

from api.v1.accounts.views import (
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView
)

app_name = "accounts"

urlpatterns = [
    path("signup/", RegisterView.as_view(), name="signup"),
    path("login/", LoginView.as_view(), name="login"),
    path("login/refresh/", RefreshView.as_view(), name="login-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
