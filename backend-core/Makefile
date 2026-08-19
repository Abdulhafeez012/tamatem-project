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
	$(COMPOSE) exec app python manage.py migrate

makemigrations:
	$(COMPOSE) exec app python manage.py makemigrations

shell:
	$(COMPOSE) exec app python manage.py shell

check:
	$(COMPOSE) exec app python manage.py check

test:
	$(COMPOSE) exec app python manage.py test

clean:
	$(COMPOSE) down -v --remove-orphans
