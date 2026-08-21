from enum import Enum


class OrderStatus(str, Enum):
    """
    Every purchase completes synchronously today, so COMPLETED is the only
    status orders are actually created with. PENDING/FAILED exist so a real
    payment step could be added later without a model change.
    """

    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

    @property
    def label(self):
        return self.name.replace("_", " ").title()

    @classmethod
    def choices(cls):
        return [(member.value, member.label) for member in cls]
