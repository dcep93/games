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

ZONE=$(gcloud compute instances list | awk "\$1 == \"$(hostname)\" {print \$2}")
gcloud compute instances add-metadata $(hostname) --metadata startup-script="bash $STARTUP_SCRIPT $INDEX" --zone=$ZONE

if [ ! -f /var/log/snatch.log ]; then
    bash $STARTUP_SCRIPT $INDEX
fi
