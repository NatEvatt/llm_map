#!/bin/bash

current_head=$(git rev-parse HEAD)

git fetch origin

new_head=$(git rev-parse HEAD)

if [ "$current_head" != "$new_head" ]; then
  echo "Changes detected!  Running Deployment..."
  docker compose -f docker-compose-deploy.yml build
  docker compose -f docker-compose-deploy.yml up -d
else
    echo "No changes."
fi