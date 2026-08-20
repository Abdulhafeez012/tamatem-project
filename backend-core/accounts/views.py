import logging
from django.db import IntegrityError, transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.serializers import LoginSerializer, RegisterSerializer, UserSerializer

logger = logging.getLogger(__name__)

class RegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/signup/
    Args:
        - username
        - email
        - password
        - password2
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
            # User creation + token issuance succeed or fail together --
            # if token generation blows up, the user row is rolled back
            # instead of silently existing behind a 500 response.
            with transaction.atomic():
                user = serializer.save()
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
                refresh_token = str(refresh)
        except IntegrityError:
            # Covers a race where two requests with the same username/email
            # land at (almost) the same time and both pass serializer
            # validation before either commits.
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
        data = {
            "user": UserSerializer(user).data,
            "access": access_token,
            "refresh": refresh_token,
        }
        return Response(data, status=status.HTTP_201_CREATED)


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
