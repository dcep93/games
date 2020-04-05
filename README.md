# Socket Games

### install git

`sudo apt install -y git-all`

### clone this repo

`git clone https://github.com/dcep93/socket_games`

[`./setup.sh`](setup.sh)

### update godaddy nameservers

url like this https://dns.godaddy.com/somuchcinnamon.com/nameservers
nameservers `carlos.ns.cloudflare.com` and `naya.ns.cloudflare.com`

### setup static external ip

`https://console.cloud.google.com/networking/addresses/list`

### set up firewall to allow port 2096

`https://console.cloud.google.com/networking/firewalls/list`

### use static ip for A type content field

`https://dash.cloudflare.com/a1bc7ea0fb518f09ae19091140583131/somuchcinnamon.com/dns`

### set up subdomains

A type record
name is subdomain
content is static ip

### always use https

`https://dash.cloudflare.com/a1bc7ea0fb518f09ae19091140583131/somuchcinnamon.com/ssl-tls/edge-certificates`

### wait for ssl cert to be deployed

edge certificate needs to be active
sometimes takes 24 hours
`https://dash.cloudflare.com/a1bc7ea0fb518f09ae19091140583131/somuchcinnamon.com/ssl-tls/edge-certificates`

### IP tables

recently, the iptables command didnt seem to work?

#### todo

landing page
start over button
automatically hide log
dont make grey if refresh on snatch
redirect on 404
