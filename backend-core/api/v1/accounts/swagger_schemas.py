from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status

USER_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["id", "username", "email"],
    properties={
        "id": openapi.Schema(type=openapi.TYPE_INTEGER, example=1),
        "username": openapi.Schema(type=openapi.TYPE_STRING, example="aboud"),
        "email": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_EMAIL,
            example="aboud@example.com",
        ),
    },
)

REGISTER_REQUEST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["username", "email", "password", "confirm_password"],
    properties={
        "username": openapi.Schema(type=openapi.TYPE_STRING, example="aboud"),
        "email": openapi.Schema(
            type=openapi.TYPE_STRING,
            format=openapi.FORMAT_EMAIL,
            example="aboud@example.com",
        ),
        "password": openapi.Schema(
            type=openapi.TYPE_STRING,
            format="password",
            example="Str0ngPass!23",
        ),
        "confirm_password": openapi.Schema(
            type=openapi.TYPE_STRING,
            format="password",
            example="Str0ngPass!23",
        ),
    },
    example={
        "username": "aboud",
        "email": "aboud@example.com",
        "password": "Str0ngPass!23",
        "confirm_password": "Str0ngPass!23",
    },
)

LOGIN_REQUEST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["username", "password"],
    properties={
        "username": openapi.Schema(type=openapi.TYPE_STRING, example="aboud"),
        "password": openapi.Schema(
            type=openapi.TYPE_STRING,
            format="password",
            example="Str0ngPass!23",
        ),
    },
    example={
        "username": "aboud",
        "password": "Str0ngPass!23",
    },
)

AUTH_RESPONSE_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["access", "refresh", "user"],
    properties={
        "access": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access-token",
        ),
        "refresh": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
        ),
        "user": USER_SCHEMA,
    },
    example={
        "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access-token",
        "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
        "user": {
            "id": 1,
            "username": "aboud",
            "email": "aboud@example.com",
        },
    },
)

REFRESH_REQUEST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["refresh"],
    properties={
        "refresh": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
        ),
    },
    example={
        "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
    },
)

REFRESH_RESPONSE_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["access", "refresh"],
    properties={
        "access": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-access-token",
        ),
        # ROTATE_REFRESH_TOKENS is on, so a rotated refresh token comes back
        # too and the token that was spent is blacklisted. A client that keeps
        # using the old one will be rejected.
        "refresh": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.rotated-refresh-token",
        ),
    },
    example={
        "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-access-token",
        "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.rotated-refresh-token",
    },
)

LOGOUT_REQUEST_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["refresh"],
    properties={
        "refresh": openapi.Schema(
            type=openapi.TYPE_STRING,
            example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
        ),
    },
    example={
        "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
    },
)

DETAIL_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "detail": openapi.Schema(type=openapi.TYPE_STRING),
    },
    required=["detail"],
)

VALIDATION_ERROR_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    example={
        "email": ["Enter a valid email address."],
        "confirm_password": ["Passwords do not match."],
    },
)

REGISTER_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Auth"],
    security=[],
    operation_summary="Register a new user",
    operation_description="Creates a user account and returns JWT access and refresh tokens.",
    request_body=REGISTER_REQUEST_SCHEMA,
    responses={
        status.HTTP_201_CREATED: openapi.Response(
            description="User registered successfully",
            schema=AUTH_RESPONSE_SCHEMA,
            examples={
                "application/json": {
                    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access-token",
                    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
                    "user": {
                        "id": 1,
                        "username": "aboud",
                        "email": "aboud@example.com",
                    },
                }
            },
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description="Validation error",
            schema=VALIDATION_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "confirm_password": ["Passwords do not match."],
                }
            },
        ),
        status.HTTP_409_CONFLICT: openapi.Response(
            description="Duplicate user data detected",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "A user with these credentials already exists.",
                }
            },
        ),
        status.HTTP_500_INTERNAL_SERVER_ERROR: openapi.Response(
            description="Unexpected registration failure",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Could not complete registration. Please try again.",
                }
            },
        ),
    },
)

LOGIN_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Auth"],
    security=[],
    operation_summary="Login and get JWT tokens",
    operation_description="Authenticates a user and returns JWT access and refresh tokens.",
    request_body=LOGIN_REQUEST_SCHEMA,
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Login successful",
            schema=AUTH_RESPONSE_SCHEMA,
            examples={
                "application/json": {
                    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access-token",
                    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token",
                    "user": {
                        "id": 1,
                        "username": "aboud",
                        "email": "aboud@example.com",
                    },
                }
            },
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description="Missing required fields",
            schema=VALIDATION_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "password": ["This field is required."],
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Invalid credentials",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "No active account found with the given credentials",
                }
            },
        ),
    },
)

REFRESH_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Auth"],
    security=[],
    operation_summary="Refresh an access token",
    operation_description="Accepts a refresh token and returns a new JWT access token.",
    request_body=REFRESH_REQUEST_SCHEMA,
    responses={
        status.HTTP_200_OK: openapi.Response(
            description="Token refreshed successfully",
            schema=REFRESH_RESPONSE_SCHEMA,
            examples={
                "application/json": {
                    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-access-token",
                    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.rotated-refresh-token",
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Invalid, expired or blacklisted refresh token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Token is invalid or expired",
                }
            },
        ),
    },
)

LOGOUT_SWAGGER_DECORATOR = swagger_auto_schema(
    tags=["Auth"],
    security=[{"Bearer": []}],
    operation_summary="Log out and revoke a refresh token",
    operation_description=(
        "Blacklists the supplied refresh token so it can no longer be exchanged "
        "for a new access token. Requires the access token of the same user the "
        "refresh token was issued to.\n\n"
        "The access token itself is not revoked -- simplejwt's blacklist tracks "
        "refresh tokens only -- so it stays usable until it expires (at most 30 "
        "minutes). Revoking the refresh token is what stops the session being "
        "extended beyond that."
    ),
    request_body=LOGOUT_REQUEST_SCHEMA,
    responses={
        status.HTTP_204_NO_CONTENT: openapi.Response(
            description="Refresh token revoked; no body returned",
        ),
        status.HTTP_400_BAD_REQUEST: openapi.Response(
            description="Missing, malformed, expired or already-revoked token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Token is invalid or expired.",
                }
            },
        ),
        status.HTTP_401_UNAUTHORIZED: openapi.Response(
            description="Missing or invalid access token",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Authentication credentials were not provided.",
                }
            },
        ),
        status.HTTP_403_FORBIDDEN: openapi.Response(
            description="The refresh token belongs to a different user",
            schema=DETAIL_ERROR_SCHEMA,
            examples={
                "application/json": {
                    "detail": "Token does not belong to the authenticated user.",
                }
            },
        ),
    },
)
