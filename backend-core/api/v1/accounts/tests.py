from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
            "accounts.serializers.RegisterSerializer.create",
            side_effect=IntegrityError,
        ):
            response = self.client.post(self.url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(User.objects.filter(username="aboud").exists())

    def test_signup_unexpected_error_returns_clean_500(self):
        with patch(
            "accounts.views.RefreshToken.for_user",
            side_effect=RuntimeError("token service unavailable"),
        ):
            with self.assertLogs("accounts.views", level="ERROR") as logs:
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
            "accounts.serializers.LoginSerializer.validate",
            side_effect=RuntimeError("db unavailable"),
        ):
            response = client.post(
                self.url, {"username": "aboud", "password": "Str0ngPass!23"}, format="json"
            )

        self.assertEqual(response.status_code, 500)
