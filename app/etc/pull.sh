#!/bin/bash

exec &> >(tee -a /var/log/socket_games.log)

cd "$( dirname "${BASH_SOURCE[0]}" )"
echo "$(date) $(pwd) $(whoami) pull"
git pull
code1=$?
git submodule update --init --recursive --remote
code2=$?
echo "$(date) $code1 $code2 pulled"
echo
