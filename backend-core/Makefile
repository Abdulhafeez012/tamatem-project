SHELL := /bin/bash

COMPOSE := docker compose -f docker-compose.yml

.PHONY: help up down restart build ps logs migrate makemigrations shell check test clean

help:
	@echo "Available commands:"
	@echo "  make build           Build Docker images"
	@echo "  make up              Start services"
	@echo "  make down            Stop services"
	@echo "  make restart         Restart services"
	@echo "  make ps              Show service status"
	@echo "  make logs            Show service logs"
	@echo "  make migrate         Run Django migrations"
	@echo "  make makemigrations  Create Django migrations"
	@echo "  make shell           Open Django shell"
	@echo "  make check           Run Django checks"
	@echo "  make test            Run tests"
	@echo "  make clean           Remove containers and volumes"
	@echo "  make test-coverage   Run tests with coverage"

build-no-cache:
	$(COMPOSE) build --no-cache

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d --remove-orphans

down:
	$(COMPOSE) down --remove-orphans

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

migrate:
	$(COMPOSE) exec app uv run  python manage.py migrate

makemigrations:
	$(COMPOSE) exec app uv run python manage.py makemigrations

shell:
	$(COMPOSE) exec app uv run python manage.py shell

check:
	$(COMPOSE) exec app uv run python manage.py check

test:
	$(COMPOSE) exec app uv run python manage.py test

test-coverage:
	$(COMPOSE) exec app uv run python -m coverage run manage.py test
	$(COMPOSE) exec app uv run python -m coverage report -m

clean:
	$(COMPOSE) down -v --remove-orphans
