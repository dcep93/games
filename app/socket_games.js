var express = require("express");
var path = require("path");
var fs = require("fs");

var exec = require("./etc/exec");
var socket = require("./socket/socket");

var app = express.Router();

app.use(socket);

app.use("/socket_games", express.static(path.join(__dirname, "public")));

app.use(
	"/pull",
	socket.protect(function (res) {
		exec("pull", path.join(__dirname, "etc", "pull.sh"), res);
	})
);

app.use(
	"/rs",
	socket.protect(function (res) {
		res.sendStatus(200);
		process.kill(process.pid, "SIGUSR2");
	})
);

var games = fs.readdirSync(path.join(__dirname, "routes"));

var routes = [];
for (var game of games) {
	var index = path.join(__dirname, "routes", game, "app", "index");
	let gameObj = require(index);
	routes[game] = gameObj;
	fs.readFile(
		path.join(
			__dirname,
			`../.git/modules/app/routes/${game}/refs/heads/master`
		),
		function (err, data) {
			if (err !== null) return console.log(err);
			gameObj.sha = data.toString();
		}
	);
}

app.use(function (req, res, next) {
	var game;
	if (req.hostname === undefined) {
		next();
		return;
	}
	if (req.hostname.startsWith("localhost")) {
		game = req.path.split("/")[1];
		req.url = req.url.substring(game.length + 1);
		if (req.url === "") {
			res.redirect(req.originalUrl + "/");
			return;
		}
	} else {
		game = req.hostname.split(".")[0];
	}
	var route = routes[game];
	if (route === undefined) {
		next();
	} else if (req.url === "/socket") {
		socket.register(req, res, game);
	} else {
		route(req, res, next);
	}
});

app.use(function (err, req, res, next) {
	console.error("err", err.stack);
	res.send(err.stack);
});

app.use(function (req, res, next) {
	res.sendStatus(404);
});

module.exports = app;
