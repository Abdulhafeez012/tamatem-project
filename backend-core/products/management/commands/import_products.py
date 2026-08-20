import csv
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.core.management.color import no_style

from products.models import Location, Product


class Command(BaseCommand):
    """
    Import products from a CSV file.

    Usage:
        python manage.py import_products path/to/products.csv
        python manage.py import_products path/to/products.csv --truncate

    Expected CSV columns:
        id, title, description, price, location

    The CSV `id` is used directly as the Django model primary key.

    Rows are upserted by primary key, so re-running the import
    with an updated CSV is safe.
    """

    help = "Import products from a CSV file into the database."

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_path",
            type=str,
            help="Path to the CSV file to import.",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help="Delete all existing products before importing.",
        )

    def handle(self, *args, **options):
        csv_path = options["csv_path"]
        truncate = options["truncate"]

        try:
            file = open(
                csv_path,
                newline="",
                encoding="utf-8-sig",
            )
        except FileNotFoundError as exc:
            raise CommandError(
                f"CSV file not found: {csv_path}"
            ) from exc

        valid_locations = {
            choice.value for choice in Location
        }

        created = 0
        updated = 0
        skipped = 0
        errors = []

        with file:
            reader = csv.DictReader(file)

            required_fields = {
                "id",
                "title",
                "description",
                "price",
                "location",
            }

            missing = required_fields - set(
                reader.fieldnames or []
            )

            if missing:
                raise CommandError(
                    "CSV is missing required column(s): "
                    f"{', '.join(sorted(missing))}"
                )

            rows = list(reader)

            with transaction.atomic():
                if truncate:
                    deleted_count, _ = Product.objects.all().delete()

                    self.stdout.write(
                        self.style.WARNING(
                            f"Deleted {deleted_count} existing product(s)."
                        )
                    )

                for line_no, row in enumerate(rows, start=2):
                    raw_id = (row.get("id") or "").strip()
                    title = (row.get("title") or "").strip()
                    description = (
                        row.get("description") or ""
                    ).strip()
                    location = (
                        row.get("location") or ""
                    ).strip().upper()
                    raw_price = (row.get("price") or "").strip()

                    # Validate primary key
                    if not raw_id.isdigit():
                        errors.append(
                            f"Line {line_no}: "
                            f"invalid id '{raw_id}', skipped."
                        )
                        skipped += 1
                        continue

                    product_id = int(raw_id)

                    if product_id <= 0:
                        errors.append(
                            f"Line {line_no}: "
                            f"id must be greater than 0, "
                            f"got '{raw_id}', skipped."
                        )
                        skipped += 1
                        continue

                    # Validate title
                    if not title:
                        errors.append(
                            f"Line {line_no}: "
                            "missing title, skipped."
                        )
                        skipped += 1
                        continue

                    # Validate location
                    if location not in valid_locations:
                        errors.append(
                            f"Line {line_no}: "
                            f"invalid location '{location}' "
                            f"for '{title}', skipped."
                        )
                        skipped += 1
                        continue

                    # Validate price
                    try:
                        price = Decimal(raw_price)
                    except (InvalidOperation, ValueError):
                        errors.append(
                            f"Line {line_no}: "
                            f"invalid price '{raw_price}' "
                            f"for '{title}', skipped."
                        )
                        skipped += 1
                        continue

                    # Use CSV `id` as Django's primary key.
                    _, was_created = Product.objects.update_or_create(
                        pk=product_id,
                        defaults={
                            "title": title,
                            "description": description,
                            "price": price,
                            "location": location,
                        },
                    )

                    if was_created:
                        created += 1
                    else:
                        updated += 1

                # Important:
                # Since primary keys were explicitly inserted from the CSV,
                # reset the database auto-increment sequence so future
                # automatically-created Products don't collide with them.
                sequence_sql = connection.ops.sequence_reset_sql(
                    no_style(),
                    [Product],
                )

                with connection.cursor() as cursor:
                    for sql in sequence_sql:
                        cursor.execute(sql)

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete: "
                f"{created} created, "
                f"{updated} updated, "
                f"{skipped} skipped."
            )
        )

        for error in errors:
            self.stdout.write(
                self.style.WARNING(error)
            )
