from django.urls import path

from accounts.views import LoginView, RefreshView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("signup/", RegisterView.as_view(), name="signup"),
    path("login/", LoginView.as_view(), name="login"),
    path("login/refresh/", RefreshView.as_view(), name="login-refresh"),
]
