from rest_framework.pagination import PageNumberPagination


class ProductPagination(PageNumberPagination):
    """
    Defaults: page 1, 10 items per page.
    Client can override page size with ?page_size=, capped at 20 to avoid
    someone requesting the entire catalog in one request.
    """

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 20
