import logging

from django.db import IntegrityError, transaction
from django.utils.decorators import method_decorator
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from api.v1.accounts.serializers import (
    LoginSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
)
from api.v1.accounts.swagger_schemas import (
    LOGIN_SWAGGER_DECORATOR,
    REFRESH_SWAGGER_DECORATOR,
    REGISTER_SWAGGER_DECORATOR,
)

logger = logging.getLogger(__name__)


@method_decorator(name="post", decorator=REGISTER_SWAGGER_DECORATOR)
class RegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/signup/
    Args:
        - username
        - email
        - password
        - confirm_password
    Return:
        - user
        - access
        - refresh
    """

    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                user = serializer.save()
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
                refresh_token = str(refresh)
        except IntegrityError:
            return Response(
                {"detail": "A user with these credentials already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            logger.exception("Unexpected error while registering user.")
            return Response(
                {"detail": "Could not complete registration. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        response_serializer = RegisterResponseSerializer(
            instance={
                "user": user,
                "access": access_token,
                "refresh": refresh_token,
            }
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


@method_decorator(name="post", decorator=LOGIN_SWAGGER_DECORATOR)
class LoginView(TokenObtainPairView):
    """
    POST /api/v1/auth/login/
    Args:
        - username
        - password
    Return:
        - access
        - refresh
        - user
    """

    permission_classes = [permissions.AllowAny]
    serializer_class = LoginSerializer


@method_decorator(name="post", decorator=REFRESH_SWAGGER_DECORATOR)
class RefreshView(TokenRefreshView):
    """
    POST /api/v1/auth/refresh/
    POST /api/v1/auth/login/refresh/
    Args:
        - refresh
    Return:
        - access
    """

    permission_classes = [permissions.AllowAny]
