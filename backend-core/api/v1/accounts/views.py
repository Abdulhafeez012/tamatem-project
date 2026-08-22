import logging

from django.db import IntegrityError, transaction
from django.utils.decorators import method_decorator
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from api.v1.accounts.serializers import (
    LoginSerializer,
    LogoutSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
)
from api.v1.accounts.swagger_schemas import (
    LOGIN_SWAGGER_DECORATOR,
    LOGOUT_SWAGGER_DECORATOR,
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
        """
        Handle a registration request. Validates the request, creates a new user,
        and returns the user along with access and refresh tokens.
        :param request:
        :param args:
        :param kwargs:
        :return: Response with the user data and tokens, or an error response if registration fails
        """
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
    POST /api/v1/auth/login/refresh/
    Args:
        - refresh
    Return:
        - access
        - refresh (rotated, because ROTATE_REFRESH_TOKENS is on)
    """

    permission_classes = [permissions.AllowAny]


@method_decorator(name="post", decorator=LOGOUT_SWAGGER_DECORATOR)
class LogoutView(generics.GenericAPIView):
    """
    POST /api/v1/auth/logout/
    Args:
        - refresh
    Return:
        - 204 No Content
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LogoutSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]

        try:
            token = RefreshToken(refresh)
        except TokenError:
            return Response(
                {"detail": "Token is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_user_id = str(token.payload.get(api_settings.USER_ID_CLAIM))
        request_user_id = str(getattr(request.user, api_settings.USER_ID_FIELD))
        if token_user_id != request_user_id:
            return Response(
                {"detail": "Token does not belong to the authenticated user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            token.blacklist()
        except AttributeError:
            logger.exception("Logout attempted without the token_blacklist app installed.")
            return Response(
                {"detail": "Token revocation is not enabled on this server."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
