from enum import Enum


class Location(str, Enum):
    """
    Product location. Inherits from (str, Enum) so a member compares equal
    to its plain string value (Location.JORDAN == "JO"), which keeps it
    interchangeable with the raw strings stored in the DB and the CSV.
    """

    JORDAN = "JO"
    SAUDI_ARABIA = "SA"

    @property
    def label(self):
        return self.name.replace("_", " ").title()

    @classmethod
    def choices(cls):
        """Django model/form `choices=` kwargs expect a list of (value, label) pairs."""
        return [(member.value, member.label) for member in cls]
