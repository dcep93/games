#!/bin/bash

if [ "$EUID" -ne 0 ]; then
  echo "must run as root"
  exit 1
fi

set -e
set -x
set -o pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

CERT_DIR=$DIR/app/socket/cert
if [ ! -d $CERT_DIR ]; then
	echo -n "ssl password: "
	read -s SSL_PASSWORD
	echo
	mkdir -p $CERT_DIR
	yes '' | openssl req -x509 -newkey rsa:2048 -days 36500 --passout pass:"$SSL_PASSWORD" \
		-keyout $CERT_DIR/key.pem -out $CERT_DIR/cert.pem || [ -f $CERT_DIR/key.pem ]
	echo $SSL_PASSWORD > $CERT_DIR/passphrase.txt
fi

# install git submodules
git submodule update --init

# install nodejs
which node || ( curl -sL https://deb.nodesource.com/setup_8.x | bash - && apt-get install -y nodejs )

# install nodemon
which nodemon || npm install --global nodemon

if [ ! -d $DIR/app/node_modules ]; then
	( cd $DIR/app && npm install )
fi

if [ ! -d $DIR/app/public/words ]; then
	tar -zxvf $DIR/app/public/words.tar.gz -C $DIR/app/public
fi

STARTUP_SCRIPT=$DIR/startup_script.sh
INDEX=$DIR/app/index.js

# server service
cat <<END > /etc/systemd/system/socket_games.service
[Unit]
Description=starts socket_games server
After=local-fs.target
Wants=local-fs.target

[Service]
ExecStart=/bin/bash $STARTUP_SCRIPT $INDEX
Type=simple

[Install]
WantedBy=multi-user.target

END
systemctl daemon-reload
systemctl enable socket_games
systemctl start socket_games

iptables -A PREROUTING -t nat -p tcp --dport 80 -j REDIRECT --to-ports 8080
iptables -A PREROUTING -t nat -p tcp --dport 443 -j REDIRECT --to-ports 8080
