#!/bin/bash

exec &> >(tee -a /var/log/socket_games.log)

echo "$(date) $(pwd) $(whoami) pull"
git pull
code=$?
echo "$(date) $code pulled"
echo
