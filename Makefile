.RECIPEPREFIX := >
.PHONY: up api frontend logs health backup legacy

up: api frontend health

api:
> docker compose -p backend-spring -f backend-spring/docker-compose.yml --project-directory backend-spring up -d --build

frontend:
> docker compose -p job-compass up -d --build frontend

health:
> @for i in $$(seq 1 30); do curl -fs http://127.0.0.1:9500/health && echo && exit 0; sleep 2; done; echo "API not healthy"; docker logs --tail=30 jobcompass-api; exit 1

logs:
> docker logs -f --tail=50 jobcompass-api

backup:
> ./backend-spring/scripts/backup.sh

legacy:
> docker compose -p job-compass --profile legacy up -d backend
