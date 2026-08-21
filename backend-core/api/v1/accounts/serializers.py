from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the user object.
    """
    class Meta:
        model = User
        fields = ("id", "username", "email")

class RegisterResponseSerializer(serializers.Serializer):
    """
    Serializer for the register response.
    """
    user = UserSerializer()
    access = serializers.CharField()
    refresh = serializers.CharField()

class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for the register view.
    """
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True, required=True, label="Confirm password")

    class Meta:
        model = User
        fields = ("username", "email", "password", "confirm_password")

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class LoginSerializer(TokenObtainPairSerializer):
    """
    Serializer for the login view.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
