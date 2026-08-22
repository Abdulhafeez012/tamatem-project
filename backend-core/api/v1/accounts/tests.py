from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class SignupTests(APITestCase):
    url = reverse("accounts:signup")

    def valid_payload(self, **overrides):
        payload = {
            "username": "aboud",
            "email": "aboud@example.com",
            "password": "Str0ngPass!23",
            "confirm_password": "Str0ngPass!23",
        }
        payload.update(overrides)
        return payload

    def test_signup_success_returns_user_and_tokens(self):
        response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "aboud")
        self.assertTrue(User.objects.filter(username="aboud").exists())

    def test_signup_persists_hashed_password(self):
        self.client.post(self.url, self.valid_payload(), format="json")

        user = User.objects.get(username="aboud")
        self.assertTrue(user.check_password("Str0ngPass!23"))
        self.assertNotEqual(user.password, "Str0ngPass!23")

    def test_signup_password_mismatch_returns_400(self):
        response = self.client.post(
            self.url,
            self.valid_payload(confirm_password="SomethingElse!23"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)
        self.assertFalse(User.objects.filter(username="aboud").exists())

    def test_signup_weak_password_returns_400(self):
        response = self.client.post(
            self.url,
            self.valid_payload(password="12345678", confirm_password="12345678"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_signup_duplicate_email_returns_400(self):
        User.objects.create_user(username="existing", email="aboud@example.com", password="Str0ngPass!23")

        response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_signup_duplicate_username_returns_400(self):
        User.objects.create_user(username="aboud", email="other@example.com", password="Str0ngPass!23")

        response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_signup_missing_fields_returns_400(self):
        response = self.client.post(self.url, {"username": "aboud"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signup_integrity_error_race_returns_409(self):
        # Simulates two near-simultaneous requests both passing serializer
        # validation before either commits -- the DB-level unique constraint
        # is what actually catches it, surfaced as a clean 409.
        with patch(
            "api.v1.accounts.serializers.RegisterSerializer.create",
            side_effect=IntegrityError,
        ):
            response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(User.objects.filter(username="aboud").exists())

    def test_signup_unexpected_error_returns_clean_500(self):
        with patch(
            "api.v1.accounts.views.RefreshToken.for_user",
            side_effect=RuntimeError("token service unavailable"),
        ):
            with self.assertLogs("api.v1.accounts.views", level="ERROR") as logs:
                response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("detail", response.data)
        self.assertIn("Unexpected error while registering user", logs.output[0])
        self.assertFalse(User.objects.filter(username="aboud").exists())


class LoginTests(APITestCase):
    url = reverse("accounts:login")

    def setUp(self):
        self.user = User.objects.create_user(
            username="aboud", email="aboud@example.com", password="Str0ngPass!23"
        )

    def test_login_success_returns_tokens_and_user(self):
        response = self.client.post(
            self.url, {"username": "aboud", "password": "Str0ngPass!23"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "aboud")

    def test_login_wrong_password_returns_401(self):
        response = self.client.post(
            self.url, {"username": "aboud", "password": "wrong-password"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data["detail"], "No active account found with the given credentials"
        )

    def test_login_unknown_username_returns_401(self):
        response = self.client.post(
            self.url, {"username": "does-not-exist", "password": "whatever"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_case_sensitive_username_returns_401(self):
        response = self.client.post(
            self.url, {"username": "Aboud", "password": "Str0ngPass!23"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_user_returns_401(self):
        self.user.is_active = False
        self.user.save()

        response = self.client.post(
            self.url, {"username": "aboud", "password": "Str0ngPass!23"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_fields_returns_400(self):
        response = self.client.post(self.url, {"username": "aboud"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_unexpected_error_returns_500(self):
        client = self.client_class(raise_request_exception=False)
        with patch(
            "api.v1.accounts.serializers.LoginSerializer.validate",
            side_effect=RuntimeError("db unavailable"),
        ):
            response = client.post(
                self.url, {"username": "aboud", "password": "Str0ngPass!23"}, format="json"
            )

        self.assertEqual(response.status_code, 500)


class LogoutTests(APITestCase):
    """
    Logout has to actually revoke, not just ask the client to forget. Each test
    that claims a token is dead proves it by trying to refresh with it.
    """

    url = reverse("accounts:logout")
    refresh_url = reverse("accounts:login-refresh")

    def setUp(self):
        self.user = User.objects.create_user(
            username="aboud", email="aboud@example.com", password="Str0ngPass!23"
        )
        self.other_user = User.objects.create_user(
            username="other", email="other@example.com", password="Str0ngPass!23"
        )

    def tokens_for(self, user):
        refresh = RefreshToken.for_user(user)
        return str(refresh), str(refresh.access_token)

    def test_logout_revokes_the_refresh_token(self):
        refresh, _ = self.tokens_for(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, {"refresh": refresh}, format="json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # The token is genuinely dead, not merely forgotten client-side.
        replay = self.client.post(
            self.refresh_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(replay.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_records_the_token_as_blacklisted(self):
        refresh, _ = self.tokens_for(self.user)
        self.client.force_authenticate(user=self.user)

        self.client.post(self.url, {"refresh": refresh}, format="json")

        self.assertEqual(BlacklistedToken.objects.count(), 1)
        self.assertEqual(
            BlacklistedToken.objects.get().token.user_id, self.user.id
        )

    def test_logout_twice_returns_400(self):
        refresh, _ = self.tokens_for(self.user)
        self.client.force_authenticate(user=self.user)
        self.client.post(self.url, {"refresh": refresh}, format="json")

        response = self.client.post(self.url, {"refresh": refresh}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Token is invalid or expired.")

    def test_logout_requires_authentication(self):
        refresh, _ = self.tokens_for(self.user)

        response = self.client.post(self.url, {"refresh": refresh}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(BlacklistedToken.objects.count(), 0)

    def test_logout_cannot_revoke_another_users_token(self):
        # Without the ownership check this would be a trivial way to sign other
        # people out.
        other_refresh, _ = self.tokens_for(self.other_user)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url, {"refresh": other_refresh}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(BlacklistedToken.objects.count(), 0)

        # And the victim's token still works.
        still_valid = self.client.post(
            self.refresh_url, {"refresh": other_refresh}, format="json"
        )
        self.assertEqual(still_valid.status_code, status.HTTP_200_OK)

    def test_logout_missing_refresh_returns_400(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refresh", response.data)

    def test_logout_malformed_token_returns_400(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url, {"refresh": "not-a-jwt"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Token is invalid or expired.")

    def test_logout_rejects_an_access_token(self):
        # Posting the access token by mistake must not silently succeed.
        _, access = self.tokens_for(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, {"refresh": access}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rotation_blacklists_the_spent_refresh_token(self):
        # ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION: refreshing returns a
        # new refresh token and retires the one that was used.
        refresh, _ = self.tokens_for(self.user)

        rotated = self.client.post(
            self.refresh_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(rotated.status_code, status.HTTP_200_OK)
        self.assertIn("refresh", rotated.data)
        self.assertNotEqual(rotated.data["refresh"], refresh)

        reuse = self.client.post(
            self.refresh_url, {"refresh": refresh}, format="json"
        )
        self.assertEqual(reuse.status_code, status.HTTP_401_UNAUTHORIZED)
