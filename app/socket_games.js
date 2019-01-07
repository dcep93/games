var express = require('express');
var path = require('path');
var fs = require('fs');
var proxy = require('express-http-proxy');

var exec = require('./etc/exec');
var socket = require('./socket/socket');

var proxies;
try {
	proxies = require('./proxies.json');
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND') throw e;
	proxies = {};
}

var app = express.Router();

app.use(socket);

app.use('/socket_games', express.static(path.join(__dirname, 'public')));

app.use(
	'/pull',
	socket.protect(function(res) {
		exec('pull', path.join(__dirname, 'etc', 'pull.sh'), res);
	})
);

app.use(
	'/rs',
	socket.protect(function(res) {
		res.sendStatus(200);
		process.kill(process.pid, 'SIGUSR2');
	})
);

var games = fs.readdirSync(path.join(__dirname, 'routes'));

var routes = [];
for (var game of games) {
	var index = path.join(__dirname, 'routes', game, 'app', 'index');
	routes[game] = require(index);
}

for (var appName in proxies) {
	var port = proxies[appName];
	routes[appName] = proxy(`localhost:${port}`);
}

app.use(function(req, res, next) {
	var game;
	if (req.hostname === undefined) {
		next();
		return;
	}
	if (req.hostname.startsWith('localhost')) {
		game = req.path.split('/')[1];
		req.url = req.url.substring(game.length + 1);
		if (req.url === '') {
			res.redirect(req.originalUrl + '/');
			return;
		}
	} else {
		game = req.hostname.split('.')[0];
	}
	var route = routes[game];
	if (route === undefined) {
		next();
	} else if (req.url === '/socket') {
		socket.register(req, res, game);
	} else {
		route(req, res, next);
	}
});

app.use(function(err, req, res, next) {
	console.error('err', err.stack);
	res.send(err.stack);
});

app.use(function(req, res, next) {
	res.sendStatus(404);
});

module.exports = app;
