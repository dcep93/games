var express = require('express');
var path = require('path');
var fs = require('fs');
var ejs = require('ejs');

var exec = require('./etc/exec');
var socket = require('./socket/socket');

var app = express.Router();

app.use(socket);

function checkPassphrase(passphrase) {
	return socket.passphrase !== undefined && socket.passphrase === passphrase;
}

app.use('/socket_games', express.static(path.join(__dirname, 'public')));
app.use('/pull', function(req, res, next) {
	if (checkPassphrase(req.query.passphrase)) {
		exec('pull', path.join(__dirname, 'etc', 'pull.sh'), res);
	} else {
		next();
	}
});

app.use('/rs', function(req, res, next) {
	if (checkPassphrase(req.query.passphrase)) {
		process.once('SIGUSR2', function () {
			process.kill(process.pid, 'SIGUSR2');
		});
	} else {
		next();
	}
});

var games = fs.readdirSync(path.join(__dirname, 'routes'));

var routes = [];
for (var game of games) {
	var index = path.join(__dirname, 'routes', game, 'app', 'index');
	routes[game] = require(index);
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
