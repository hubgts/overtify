# ==============================================================================
# Overtify — Makefile
#
# `make help` liste toutes les cibles disponibles.
# ==============================================================================

SHELL := /bin/bash

COMPOSE := docker compose
ENV_FILE := .env
ENV_EXAMPLE := .env.example

# Couleurs pour les messages (désactivées si la sortie n'est pas un terminal).
ifneq (,$(findstring xterm,$(TERM)))
	ACCENT := \033[35m
	OK     := \033[32m
	WARN   := \033[33m
	RESET  := \033[0m
else
	ACCENT :=
	OK     :=
	WARN   :=
	RESET  :=
endif

.DEFAULT_GOAL := help

.PHONY: help init up down build rebuild logs logs-backend logs-frontend restart ps \
        clean clean-all dev dev-backend dev-frontend install test typecheck check env-check

# ------------------------------------------------------------------------------
# Aide
# ------------------------------------------------------------------------------

help: ## Affiche cette aide
	@printf "$(ACCENT)Overtify$(RESET) — cibles disponibles :\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@printf "\nDémarrage rapide : $(ACCENT)make init$(RESET) puis $(ACCENT)make up$(RESET)\n"

# ------------------------------------------------------------------------------
# Initialisation
# ------------------------------------------------------------------------------

init: ## Installe les dépendances et crée le .env (avec un secret généré)
	@printf "$(ACCENT)→ Initialisation d'Overtify$(RESET)\n"
	@if [ ! -f $(ENV_FILE) ]; then \
		cp $(ENV_EXAMPLE) $(ENV_FILE); \
		secret=$$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'); \
		if sed --version >/dev/null 2>&1; then \
			sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$$secret|" $(ENV_FILE); \
		else \
			sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$$secret|" $(ENV_FILE); \
		fi; \
		printf "$(OK)✓$(RESET) $(ENV_FILE) créé, SESSION_SECRET généré\n"; \
	else \
		printf "$(WARN)!$(RESET) $(ENV_FILE) existe déjà, conservé en l'état\n"; \
	fi
	@$(MAKE) --no-print-directory install
	@printf "\n$(OK)✓ Initialisation terminée.$(RESET)\n"
	@printf "  Dernière étape : renseignez $(ACCENT)SPOTIFY_CLIENT_ID$(RESET) et "
	@printf "$(ACCENT)SPOTIFY_CLIENT_SECRET$(RESET) dans $(ENV_FILE).\n"
	@printf "  Comment les obtenir : $(ACCENT)docs/SPOTIFY_SETUP.md$(RESET)\n"

install: ## Installe les dépendances npm des deux sous-projets
	@printf "$(ACCENT)→ Installation des dépendances backend$(RESET)\n"
	@cd backend && npm install --no-fund --no-audit
	@printf "$(ACCENT)→ Installation des dépendances frontend$(RESET)\n"
	@cd frontend && npm install --no-fund --no-audit

# Échoue tôt et clairement si la configuration est absente ou incomplète.
env-check:
	@if [ ! -f $(ENV_FILE) ]; then \
		printf "$(WARN)✗ $(ENV_FILE) introuvable. Lancez d'abord : make init$(RESET)\n"; \
		exit 1; \
	fi
	@if ! grep -qE '^SPOTIFY_CLIENT_ID=.+' $(ENV_FILE) || ! grep -qE '^SPOTIFY_CLIENT_SECRET=.+' $(ENV_FILE); then \
		printf "$(WARN)✗ SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET non renseignés dans $(ENV_FILE)$(RESET)\n"; \
		printf "  Voir docs/SPOTIFY_SETUP.md pour les obtenir.\n"; \
		exit 1; \
	fi

# ------------------------------------------------------------------------------
# Cycle de vie des conteneurs
# ------------------------------------------------------------------------------

up: env-check ## Démarre les conteneurs (build si nécessaire)
	@$(COMPOSE) up -d --build
	@printf "\n$(OK)✓ Overtify est démarré$(RESET) → $(ACCENT)http://127.0.0.1:$${FRONTEND_PORT:-8080}$(RESET)\n"

down: ## Arrête et supprime les conteneurs
	@$(COMPOSE) down
	@printf "$(OK)✓ Conteneurs arrêtés$(RESET)\n"

build: ## Construit les images Docker
	@$(COMPOSE) build

rebuild: ## Reconstruit les images sans cache
	@$(COMPOSE) build --no-cache

restart: ## Redémarre les conteneurs
	@$(COMPOSE) restart
	@printf "$(OK)✓ Conteneurs redémarrés$(RESET)\n"

ps: ## Affiche l'état des conteneurs
	@$(COMPOSE) ps

logs: ## Suit les logs des deux services
	@$(COMPOSE) logs -f --tail=100

logs-backend: ## Suit les logs du backend
	@$(COMPOSE) logs -f --tail=100 backend

logs-frontend: ## Suit les logs du frontend
	@$(COMPOSE) logs -f --tail=100 frontend

logs-api: ## Suit le journal des échanges avec l'API Spotify
	@if [ ! -f logs/spotify-api.log ]; then \
		printf "$(WARN)!$(RESET) logs/spotify-api.log est vide ou absent.\n"; \
		printf "  Vérifiez que SPOTIFY_LOG_FILE est renseigné dans .env, puis: make restart\n"; \
		exit 1; \
	fi
	@tail -f logs/spotify-api.log

logs-api-pretty: ## Affiche le dernier échange Spotify, formaté
	@tail -n 1 logs/spotify-api.log | python3 -m json.tool 2>/dev/null \
		|| tail -n 1 logs/spotify-api.log

# ------------------------------------------------------------------------------
# Développement local (hors Docker, avec rechargement à chaud)
# ------------------------------------------------------------------------------

dev: ## Lance backend et frontend en mode développement
	@printf "$(ACCENT)→ Backend sur :3001, frontend sur :5173$(RESET)\n"
	@printf "$(WARN)!$(RESET) Vérifiez que .env pointe sur les URLs de développement "
	@printf "(voir docs/SPOTIFY_SETUP.md)\n\n"
	@trap 'kill 0' EXIT INT TERM; \
		$(MAKE) --no-print-directory dev-backend & \
		$(MAKE) --no-print-directory dev-frontend & \
		wait

dev-backend: ## Lance uniquement le backend en mode développement
	@set -a && . ./$(ENV_FILE) && set +a && cd backend && npm run dev

dev-frontend: ## Lance uniquement le frontend en mode développement
	@cd frontend && npm run dev

# ------------------------------------------------------------------------------
# Qualité
# ------------------------------------------------------------------------------

test: ## Exécute tous les tests (hors ligne, déterministes)
	@printf "$(ACCENT)→ Tests frontend$(RESET)\n"
	@cd frontend && npm test
	@printf "$(ACCENT)→ Tests backend (unitaires + bout en bout)$(RESET)\n"
	@cd backend && npm test

test-e2e: ## Exécute les tests de bout en bout (Spotify simulé)
	@cd backend && npm run test:e2e

test-contract: ## Vérifie que l'API Spotify réelle n'a pas changé (réseau requis)
	@printf "$(ACCENT)→ Contrat avec l'API Spotify$(RESET)\n"
	@if [ ! -f $(ENV_FILE) ]; then \
		printf "$(WARN)✗ $(ENV_FILE) requis pour ce test. Lancez : make init$(RESET)\n"; \
		exit 1; \
	fi
	@set -a && . ./$(ENV_FILE) && set +a && cd backend && npm run test:contract

typecheck: ## Vérifie le typage TypeScript des deux sous-projets
	@printf "$(ACCENT)→ Typage backend$(RESET)\n"
	@set -a && [ -f ./$(ENV_FILE) ] && . ./$(ENV_FILE); set +a; cd backend && npm run typecheck
	@printf "$(ACCENT)→ Typage frontend$(RESET)\n"
	@cd frontend && npx tsc -b --noEmit

check: typecheck test ## Lance typage et tests

# ------------------------------------------------------------------------------
# Nettoyage
# ------------------------------------------------------------------------------

clean: ## Supprime conteneurs, volumes et artefacts de build
	@$(COMPOSE) down --volumes --remove-orphans
	@rm -rf backend/dist frontend/dist
	@printf "$(OK)✓ Conteneurs et artefacts de build supprimés$(RESET)\n"

clean-all: clean ## Nettoyage complet, node_modules et images inclus
	@rm -rf backend/node_modules frontend/node_modules
	@docker image rm -f overtify-backend:latest overtify-frontend:latest 2>/dev/null || true
	@printf "$(OK)✓ Nettoyage complet effectué$(RESET)\n"
